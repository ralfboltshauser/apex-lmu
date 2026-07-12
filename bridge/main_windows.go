//go:build windows

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const mappingReopenInterval = time.Second

func run(hz int, parentID int) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)
	interval := time.Second / time.Duration(hz)
	parentExited := watchParent(parentID)
	var sequence uint64
	// A named section can be kept alive by any reader. Require the producer
	// process before the first open so a stale section can never emit a frame.
	requireProducerProcess := true

	for {
		select {
		case <-interrupt:
			return
		case <-parentExited:
			return
		default:
		}
		var verifiedProcessHandle syscall.Handle
		if requireProducerProcess {
			handle, processErr := findLMUProcessHandle()
			if processErr != nil {
				emit(encoder, message{Type: "status", State: "waiting", Message: "Waiting for Le Mans Ultimate"})
				select {
				case <-time.After(time.Second):
				case <-interrupt:
					return
				case <-parentExited:
					return
				}
				continue
			}
			// Keep the verified handle through mapping open so producer exit in
			// between those operations is still observable without a TOCTOU gap.
			verifiedProcessHandle = handle
		}

		memory, err := openLMUSharedMemory()
		if err != nil {
			if verifiedProcessHandle != 0 {
				_ = syscall.CloseHandle(verifiedProcessHandle)
			}
			emit(encoder, message{Type: "status", State: "waiting", Message: "Waiting for LMU shared memory"})
			select {
			case <-time.After(time.Second):
			case <-interrupt:
				return
			case <-parentExited:
				return
			}
			continue
		}
		if verifiedProcessHandle != 0 {
			if memory.processHandle != 0 {
				_ = syscall.CloseHandle(memory.processHandle)
			}
			memory.processHandle = verifiedProcessHandle
		}
		requireProducerProcess = false

		emit(encoder, message{Type: "status", State: "mapping-open", Message: "LMU shared memory opened; waiting for a drivable car"})
		ticker := time.NewTicker(interval)
		lastReopen := time.Now()
		lastIssueState := ""
		reportIssue := func(state, detail string) {
			if state == lastIssueState {
				return
			}
			emit(encoder, message{Type: "status", State: state, Message: detail})
			lastIssueState = state
		}
		var reportedGameVersion *int32
		var raw []byte

	connectedLoop:
		for {
			select {
			case <-interrupt:
				ticker.Stop()
				_ = memory.Close()
				return
			case <-parentExited:
				ticker.Stop()
				_ = memory.Close()
				return
			case <-ticker.C:
			}

			if memory.producerExited() {
				requireProducerProcess = true
				break connectedLoop
			}
			if time.Since(lastReopen) >= mappingReopenInterval {
				// A mapped view remains readable after its producer exits. Releasing
				// and reopening our view lets the kernel report that the named object
				// has disappeared when no other process still owns it.
				_ = memory.Close()
				memory, err = openLMUSharedMemory()
				if err != nil {
					break connectedLoop
				}
				if memory.processHandle == 0 {
					_ = memory.Close()
					requireProducerProcess = true
					break connectedLoop
				}
				lastReopen = time.Now()
			}

			nextRaw, readErr := memory.snapshotInto(raw)
			if readErr != nil {
				reportIssue("invalid-data", readErr.Error())
				continue
			}
			raw = nextRaw
			decoded, decodeErr := decodeSnapshot(raw)
			if decodeErr != nil {
				if errors.Is(decodeErr, errLMUPlayerHasNoVehicle) {
					reportIssue("waiting-for-vehicle", decodeErr.Error())
					continue
				}
				reportIssue("invalid-data", decodeErr.Error())
				continue
			}
			lastIssueState = ""
			if reportedGameVersion == nil || *reportedGameVersion != decoded.GameVersion {
				version := decoded.GameVersion
				reportedGameVersion = &version
				emit(encoder, message{
					Type: "status", State: "connected", GameVersion: decoded.GameVersion,
					Message: fmt.Sprintf("Official LMU shared memory connected (game version %d)", decoded.GameVersion),
				})
			}
			sequence++
			emit(encoder, message{
				Type: "telemetry", CapturedAt: time.Now().UTC().Format(time.RFC3339Nano), Sequence: sequence,
				GameVersion: decoded.GameVersion,
				Session:     &decoded.Session, Player: &decoded.Player, Opponents: decoded.Opponents,
			})
		}

		ticker.Stop()
		_ = memory.Close()
		requireProducerProcess = true
		emit(encoder, message{Type: "status", State: "disconnected", Message: "LMU shared memory closed"})
	}
}

func main() {
	options, err := parseCLIOptions(os.Args[1:])
	if err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if options.selfTest {
		if err := runSelfTest(os.Stdout, options); err != nil {
			_, _ = fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	run(options.hz, options.parentID)
}
