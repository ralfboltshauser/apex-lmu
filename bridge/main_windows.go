//go:build windows

package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

const mappingReopenInterval = time.Second

func run(options cliOptions) (resultErr error) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)
	interval := time.Second / time.Duration(options.hz)
	parentExited := watchParent(options.parentID)
	started := time.Now()
	var recorder *recordingWriter
	var stopRequested <-chan struct{}
	if options.recordPath != "" {
		var err error
		recorder, err = createRecording(options.recordPath, recordingMetadata{
			Format: recordingFormat, CreatedAt: started.UTC().Format(time.RFC3339Nano), AppVersion: options.appVersion,
			SampleRateHz: options.hz, Source: lmuSharedMemoryName, PayloadBytes: lmuSharedMemoryPayloadSize,
			PrivacyNotice: "Contains raw LMU shared memory, including driver names, Steam IDs, server details, and local LMU paths. Nothing is uploaded automatically.",
		})
		if err != nil {
			return err
		}
		stop := make(chan struct{})
		stopRequested = stop
		go func() {
			scanner := bufio.NewScanner(os.Stdin)
			if scanner.Scan() && strings.EqualFold(strings.TrimSpace(scanner.Text()), "stop") {
				close(stop)
			}
		}()
		_ = emit(encoder, message{Source: recordingSource, Type: "recording", State: "recording", Message: "Recording raw LMU shared memory", DurationSeconds: 0})
		defer func() {
			closeErr := recorder.Close()
			if resultErr == nil && closeErr != nil {
				resultErr = closeErr
			}
			state, detail := "complete", "Recording saved"
			if resultErr != nil {
				state, detail = "error", resultErr.Error()
			}
			_ = emit(encoder, message{Source: recordingSource, Type: "recording", State: state, Message: detail, Frames: int(recorder.snapshots), Bytes: recorder.bytes, DurationSeconds: time.Since(started).Seconds()})
		}()
	}
	emitStatus := func(value message) error {
		if recorder != nil && value.Type == "status" {
			if err := recorder.WriteEvent(time.Since(started), value.State, value.Message); err != nil {
				return err
			}
		}
		return emit(encoder, value)
	}
	lastProgress := time.Now()
	emitProgress := func() {
		if recorder != nil && time.Since(lastProgress) >= time.Second {
			_ = emit(encoder, message{Source: recordingSource, Type: "recording", State: "recording", Message: "Recording raw LMU shared memory", Frames: int(recorder.snapshots), Bytes: recorder.bytes, DurationSeconds: time.Since(started).Seconds()})
			lastProgress = time.Now()
		}
	}
	var sequence uint64
	// A named section can be kept alive by any reader. Require the producer
	// process before the first open so a stale section can never emit a frame.
	requireProducerProcess := true

	for {
		emitProgress()
		select {
		case <-interrupt:
			return
		case <-parentExited:
			return nil
		case <-stopRequested:
			return nil
		default:
		}
		var verifiedProcessHandle syscall.Handle
		if requireProducerProcess {
			handle, processErr := findLMUProcessHandle()
			if processErr != nil {
				if err := emitStatus(message{Type: "status", State: "waiting", Message: "Waiting for Le Mans Ultimate"}); err != nil {
					return err
				}
				select {
				case <-time.After(time.Second):
				case <-interrupt:
					return nil
				case <-parentExited:
					return nil
				case <-stopRequested:
					return nil
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
			if err := emitStatus(message{Type: "status", State: "waiting", Message: "Waiting for LMU shared memory"}); err != nil {
				return err
			}
			select {
			case <-time.After(time.Second):
			case <-interrupt:
				return nil
			case <-parentExited:
				return nil
			case <-stopRequested:
				return nil
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

		if err := emitStatus(message{Type: "status", State: "mapping-open", Message: "LMU shared memory opened; waiting for a drivable car"}); err != nil {
			_ = memory.Close()
			return err
		}
		ticker := time.NewTicker(interval)
		lastReopen := time.Now()
		lastIssueState := ""
		reportIssue := func(state, detail string) error {
			if state == lastIssueState {
				return nil
			}
			if err := emitStatus(message{Type: "status", State: state, Message: detail}); err != nil {
				return err
			}
			lastIssueState = state
			return nil
		}
		var reportedGameVersion *int32
		var raw []byte

	connectedLoop:
		for {
			select {
			case <-interrupt:
				ticker.Stop()
				_ = memory.Close()
				return nil
			case <-parentExited:
				ticker.Stop()
				_ = memory.Close()
				return nil
			case <-stopRequested:
				ticker.Stop()
				_ = memory.Close()
				return nil
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
				if err := reportIssue("invalid-data", readErr.Error()); err != nil {
					ticker.Stop()
					_ = memory.Close()
					return err
				}
				continue
			}
			raw = nextRaw
			if recorder != nil {
				if err := recorder.WriteSnapshot(time.Since(started), raw); err != nil {
					ticker.Stop()
					_ = memory.Close()
					return err
				}
				emitProgress()
			}
			decoded, decodeErr := decodeSnapshot(raw)
			if decodeErr != nil {
				if errors.Is(decodeErr, errLMUPlayerHasNoVehicle) {
					if err := reportIssue("waiting-for-vehicle", decodeErr.Error()); err != nil {
						ticker.Stop()
						_ = memory.Close()
						return err
					}
					continue
				}
				if err := reportIssue("invalid-data", decodeErr.Error()); err != nil {
					ticker.Stop()
					_ = memory.Close()
					return err
				}
				continue
			}
			lastIssueState = ""
			if reportedGameVersion == nil || *reportedGameVersion != decoded.GameVersion {
				version := decoded.GameVersion
				reportedGameVersion = &version
				if err := emitStatus(message{
					Type: "status", State: "connected", GameVersion: decoded.GameVersion,
					Message: fmt.Sprintf("Official LMU shared memory connected (game version %d)", decoded.GameVersion),
				}); err != nil {
					ticker.Stop()
					_ = memory.Close()
					return err
				}
			}
			sequence++
			if recorder == nil {
				_ = emit(encoder, message{
					Type: "telemetry", CapturedAt: time.Now().UTC().Format(time.RFC3339Nano), Sequence: sequence,
					GameVersion: decoded.GameVersion,
					Session:     &decoded.Session, Player: &decoded.Player, Opponents: decoded.Opponents,
					PlayerTelemetryAvailable: decoded.PlayerTelemetryAvailable,
				})
			}
		}

		ticker.Stop()
		_ = memory.Close()
		requireProducerProcess = true
		if err := emitStatus(message{Type: "status", State: "disconnected", Message: "LMU shared memory closed"}); err != nil {
			return err
		}
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
	if options.replayPath != "" {
		if err := runReplay(os.Stdout, options); err != nil {
			_, _ = fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if err := run(options); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
