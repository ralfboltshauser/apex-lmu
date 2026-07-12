//go:build windows

package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"
	"unsafe"

	"github.com/ralfboltshauser/apex-lmu/bridge/internal/lmutestfixture"
)

// namedMappingFixture is a minimal raw Windows section used to isolate kernel
// object-lifetime behavior. Field-level tests use lmutestfixture.OpenProducer,
// which also implements the SDK event and CAS-lock protocol.
type namedMappingFixture struct {
	handle  syscall.Handle
	address uintptr
	bytes   []byte
}

func newNamedMappingFixture(t *testing.T, size int) *namedMappingFixture {
	t.Helper()
	if existing, err := openLMUSharedMemory(); err == nil {
		_ = existing.Close()
		t.Fatalf("named section %q already exists; fixture requires an isolated Windows session", lmutestfixture.MappingName)
	}

	name, err := syscall.UTF16PtrFromString(lmutestfixture.MappingName)
	if err != nil {
		t.Fatalf("encode mapping name: %v", err)
	}
	handle, err := syscall.CreateFileMapping(syscall.InvalidHandle, nil, syscall.PAGE_READWRITE, 0, uint32(size), name)
	if err != nil {
		t.Fatalf("create named section %q: %v", lmutestfixture.MappingName, err)
	}
	address, err := syscall.MapViewOfFile(handle, syscall.FILE_MAP_READ|syscall.FILE_MAP_WRITE, 0, 0, uintptr(size))
	if err != nil {
		_ = syscall.CloseHandle(handle)
		t.Fatalf("map producer view: %v", err)
	}

	fixture := &namedMappingFixture{
		handle: handle, address: address,
		bytes: unsafe.Slice((*byte)(unsafe.Pointer(address)), size),
	}
	clear(fixture.bytes)
	t.Cleanup(fixture.closeProducer)
	return fixture
}

func (fixture *namedMappingFixture) closeProducer() {
	if fixture.address != 0 {
		_ = syscall.UnmapViewOfFile(fixture.address)
		fixture.address = 0
		fixture.bytes = nil
	}
	if fixture.handle != 0 {
		_ = syscall.CloseHandle(fixture.handle)
		fixture.handle = 0
	}
}

func TestNamedMappingCanBeReopenedWhileProducerLives(t *testing.T) {
	fixture := newNamedMappingFixture(t, lmutestfixture.AllocationSize)
	first, err := openLMUSharedMemory()
	if err != nil {
		t.Fatalf("open production mapping name: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("close first consumer: %v", err)
	}

	second, err := openLMUSharedMemory()
	if err != nil {
		t.Fatalf("reopen while producer still owns section: %v", err)
	}
	if _, err := second.snapshot(); err != nil {
		_ = second.Close()
		t.Fatalf("reopened consumer could not copy its mapped view: %v", err)
	}
	if err := second.Close(); err != nil {
		t.Fatalf("close second consumer: %v", err)
	}
	if fixture.handle == 0 {
		t.Fatal("producer closed unexpectedly")
	}
}

func TestCloseThenReopenDetectsLastProducerExit(t *testing.T) {
	fixture := newNamedMappingFixture(t, lmutestfixture.AllocationSize)
	consumer, err := openLMUSharedMemory()
	if err != nil {
		t.Fatalf("open consumer: %v", err)
	}
	fixture.closeProducer()

	// The consumer's mapped view owns the section and therefore remains a
	// readable (but stale) byte snapshot after the producer exits.
	if _, err := consumer.snapshot(); err != nil {
		_ = consumer.Close()
		t.Fatalf("expected consumer-owned stale view to remain readable: %v", err)
	}
	if err := consumer.Close(); err != nil {
		t.Fatalf("close final consumer: %v", err)
	}
	if reopened, err := openLMUSharedMemory(); err == nil {
		_ = reopened.Close()
		t.Fatal("reopen unexpectedly succeeded after producer and final consumer exited")
	}
}

func TestCloseThenReopenCannotIdentifyProducerWhenAnotherConsumerOwnsSection(t *testing.T) {
	fixture := newNamedMappingFixture(t, lmutestfixture.AllocationSize)
	bridgeConsumer, err := openLMUSharedMemory()
	if err != nil {
		t.Fatalf("open bridge consumer: %v", err)
	}
	otherConsumer, err := openLMUSharedMemory()
	if err != nil {
		_ = bridgeConsumer.Close()
		t.Fatalf("open second consumer: %v", err)
	}

	fixture.closeProducer()
	if err := bridgeConsumer.Close(); err != nil {
		_ = otherConsumer.Close()
		t.Fatalf("close bridge consumer: %v", err)
	}
	// Windows sections do not distinguish creators from openers. A different
	// overlay retaining a handle keeps the stale name alive.
	reopened, err := openLMUSharedMemory()
	if err != nil {
		_ = otherConsumer.Close()
		t.Fatalf("expected reopen through second consumer's retained section: %v", err)
	}
	_ = reopened.Close()
	_ = otherConsumer.Close()
	if final, err := openLMUSharedMemory(); err == nil {
		_ = final.Close()
		t.Fatal("section survived after every producer and consumer released it")
	}
}

func TestSDKProducerPublishesThroughProductionReader(t *testing.T) {
	producer, err := lmutestfixture.OpenProducer()
	if err != nil {
		t.Fatalf("open SDK fixture producer: %v", err)
	}
	t.Cleanup(func() { _ = producer.Close() })
	if err := producer.Publish(901.25, 0); err != nil {
		t.Fatalf("publish deterministic fixture: %v", err)
	}

	memory, err := openLMUSharedMemory()
	if err != nil {
		t.Fatalf("open production reader: %v", err)
	}
	defer memory.Close()
	raw, err := memory.snapshot()
	if err != nil {
		t.Fatalf("copy SDK-locked snapshot: %v", err)
	}
	assertDecodedFixture(t, raw)
}

func TestNamedMappingFixtureDecodesPackedFields(t *testing.T) {
	fixture := newNamedMappingFixture(t, lmutestfixture.AllocationSize)
	if err := lmutestfixture.Populate(fixture.bytes, 901.25, 0); err != nil {
		t.Fatalf("populate named-section fixture: %v", err)
	}
	assertDecodedFixture(t, fixture.bytes)
}

func assertDecodedFixture(t *testing.T, raw []byte) {
	t.Helper()
	decoded, err := decodeSnapshot(raw)
	if err != nil {
		t.Fatalf("decode named-section bytes: %v", err)
	}
	if decoded.GameVersion != 130 || decoded.Session.Track != "Circuit de la Sarthe" || decoded.Session.ElapsedSeconds != 901.25 {
		t.Fatalf("unexpected version/session: version=%d session=%#v", decoded.GameVersion, decoded.Session)
	}
	if decoded.Session.WindSpeedMps != 5 || decoded.Session.Rain != 0.25 || decoded.Session.Wetness != 0.12 {
		t.Fatalf("unexpected weather: %#v", decoded.Session)
	}
	if decoded.Player.ID != 6 || decoded.Player.Driver != "Fixture Driver" || decoded.Player.Class != "Hypercar" {
		t.Fatalf("player scoring correlation failed: %#v", decoded.Player)
	}
	if decoded.Player.Name != "Porsche 963" || decoded.Player.Lap != 8 || decoded.Player.Sector != 3 {
		t.Fatalf("packed player fields decoded incorrectly: %#v", decoded.Player)
	}
	if math.Abs(decoded.Player.SpeedKph-271.4) > 1e-9 || decoded.Player.RPM != 8021 || decoded.Player.Gear != 6 {
		t.Fatalf("packed motion fields decoded incorrectly: %#v", decoded.Player)
	}
	if math.Abs(decoded.Player.Wheels[0].PressurePsi-165.474*kilopascalToPSI) > 1e-12 {
		t.Fatalf("pressure conversion is wrong: %#v", decoded.Player.Wheels[0])
	}
	if decoded.Player.Wheels[0].SurfaceTempC != [3]float64{92, 91, 90} || decoded.Player.Wheels[0].CarcassTempC != 88 {
		t.Fatalf("packed wheel temperatures decoded incorrectly: %#v", decoded.Player.Wheels[0])
	}
	if len(decoded.Opponents) != 1 || decoded.Opponents[0].ID != 51 || decoded.Opponents[0].Position != 1 {
		t.Fatalf("unexpected opponents: %#v", decoded.Opponents)
	}
}

// This test is skipped unless the production bridge and separately built test
// producer are beside the test binary (or selected through environment
// variables). The producer executable must be named "Le Mans Ultimate.exe" so
// the production process-liveness gate is exercised, not bypassed.
func TestPackagedBridgeStreamsFixtureAndReturnsToWaiting(t *testing.T) {
	testPath, err := os.Executable()
	if err != nil {
		t.Skipf("resolve test executable: %v", err)
	}
	testDirectory := filepath.Dir(testPath)
	bridgePath := os.Getenv("APEX_LMU_BRIDGE_EXE")
	if bridgePath == "" {
		bridgePath = filepath.Join(testDirectory, "apex-lmu-bridge.exe")
	}
	if _, err := os.Stat(bridgePath); err != nil {
		t.Skipf("production bridge executable not available at %s", bridgePath)
	}
	fixturePath := os.Getenv("APEX_LMU_FIXTURE_EXE")
	if fixturePath == "" {
		fixturePath = filepath.Join(testDirectory, "Le Mans Ultimate.exe")
	}
	if _, err := os.Stat(fixturePath); err != nil {
		t.Skipf("external LMU fixture executable not available at %s", fixturePath)
	}

	fixtureCommand := exec.Command(fixturePath, "--duration=4s", "--hz=20")
	fixtureStdout, err := fixtureCommand.StdoutPipe()
	if err != nil {
		t.Fatalf("open fixture stdout: %v", err)
	}
	var fixtureStderr bytes.Buffer
	fixtureCommand.Stderr = &fixtureStderr
	if err := fixtureCommand.Start(); err != nil {
		t.Fatalf("start external LMU fixture: %v", err)
	}
	fixtureDone := make(chan error, 1)
	go func() { fixtureDone <- fixtureCommand.Wait() }()
	fixtureExited := false
	defer func() {
		if !fixtureExited {
			_ = fixtureCommand.Process.Kill()
			<-fixtureDone
		}
	}()
	fixtureLines := make(chan fixtureOutput, 16)
	go scanFixtureOutput(fixtureStdout, fixtureLines)
	waitForFixtureState(t, fixtureLines, "ready", 2*time.Second, &fixtureStderr)

	command := exec.Command(bridgePath, "--hz=50")
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatalf("open bridge stdout: %v", err)
	}
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Start(); err != nil {
		t.Fatalf("start production bridge: %v", err)
	}
	processDone := false
	defer func() {
		if !processDone {
			_ = command.Process.Kill()
			_ = command.Wait()
		}
	}()

	lines := make(chan bridgeOutput, 64)
	go scanBridgeOutput(stdout, lines)
	telemetry := waitForBridgeMessage(t, lines, 4*time.Second, func(value message) bool { return value.Type == "telemetry" }, &stderr)
	if telemetry.GameVersion != 130 || telemetry.Source != liveSource || telemetry.Player == nil || telemetry.Player.ID != 6 {
		t.Fatalf("unexpected live bridge telemetry: %#v", telemetry)
	}

	select {
	case err := <-fixtureDone:
		fixtureExited = true
		if err != nil {
			t.Fatalf("external fixture exited unsuccessfully: %v; stderr=%s", err, fixtureStderr.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatalf("external fixture did not honor bounded duration; stderr=%s", fixtureStderr.String())
	}
	waitForBridgeMessage(t, lines, 4*time.Second, func(value message) bool {
		return value.Type == "status" && value.State == "disconnected"
	}, &stderr)
	waitForBridgeMessage(t, lines, 4*time.Second, func(value message) bool {
		return value.Type == "status" && value.State == "waiting"
	}, &stderr)

	_ = command.Process.Kill()
	_ = command.Wait()
	processDone = true
}

type fixtureOutput struct {
	state string
	err   error
}

func scanFixtureOutput(stdout interface{ Read([]byte) (int, error) }, output chan<- fixtureOutput) {
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		var value struct {
			Type  string `json:"type"`
			State string `json:"state"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &value); err != nil {
			output <- fixtureOutput{err: fmt.Errorf("decode fixture output %q: %w", scanner.Text(), err)}
			return
		}
		if value.Type == "fixture" {
			output <- fixtureOutput{state: value.State}
		}
	}
	err := scanner.Err()
	if err == nil {
		err = io.EOF
	}
	output <- fixtureOutput{err: err}
}

func waitForFixtureState(t *testing.T, lines <-chan fixtureOutput, state string, timeout time.Duration, stderr *bytes.Buffer) {
	t.Helper()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		select {
		case line := <-lines:
			if line.err != nil {
				t.Fatalf("fixture output ended before %q: %v; stderr=%s", state, line.err, stderr.String())
			}
			if line.state == state {
				return
			}
		case <-timer.C:
			t.Fatalf("timed out after %s waiting for fixture state %q; stderr=%s", timeout, state, stderr.String())
		}
	}
}

type bridgeOutput struct {
	message message
	err     error
}

func scanBridgeOutput(stdout interface{ Read([]byte) (int, error) }, output chan<- bridgeOutput) {
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		var value message
		if err := json.Unmarshal(scanner.Bytes(), &value); err != nil {
			output <- bridgeOutput{err: fmt.Errorf("decode bridge output %q: %w", scanner.Text(), err)}
			return
		}
		output <- bridgeOutput{message: value}
	}
	err := scanner.Err()
	if err == nil {
		err = io.EOF
	}
	output <- bridgeOutput{err: err}
}

func waitForBridgeMessage(t *testing.T, lines <-chan bridgeOutput, timeout time.Duration, predicate func(message) bool, stderr *bytes.Buffer) message {
	t.Helper()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		select {
		case line := <-lines:
			if line.err != nil {
				t.Fatalf("bridge output ended before expected message: %v; stderr=%s", line.err, stderr.String())
			}
			if predicate(line.message) {
				return line.message
			}
		case <-timer.C:
			t.Fatalf("timed out after %s waiting for bridge output; stderr=%s", timeout, stderr.String())
		}
	}
}
