package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"testing"
	"time"
)

func TestRunSelfTestEmitsExactDeterministicContract(t *testing.T) {
	options, err := parseCLIOptions([]string{"--self-test", "--frames=3", "--run-id=test-run", "--hz=50"})
	if err != nil {
		t.Fatalf("parse options: %v", err)
	}

	var first bytes.Buffer
	if err := runSelfTest(&first, options); err != nil {
		t.Fatalf("run self-test: %v", err)
	}
	var second bytes.Buffer
	if err := runSelfTest(&second, options); err != nil {
		t.Fatalf("run repeated self-test: %v", err)
	}
	if first.String() != second.String() {
		t.Fatal("self-test output changed between identical runs")
	}

	messages := decodeMessages(t, first.Bytes())
	if got, want := len(messages), options.frames+2; got != want {
		t.Fatalf("message count = %d, want %d", got, want)
	}
	for index, current := range messages {
		if current.ProtocolVersion != protocolVersion {
			t.Errorf("message %d protocolVersion = %d", index, current.ProtocolVersion)
		}
		if current.Source != selfTestSource {
			t.Errorf("message %d source = %q", index, current.Source)
		}
		if current.RunID != options.runID {
			t.Errorf("message %d runId = %q", index, current.RunID)
		}
		if current.Fixture != selfTestFixtureID {
			t.Errorf("message %d fixture = %q", index, current.Fixture)
		}
	}

	if messages[0].Type != "status" || messages[0].State != "self-test-starting" {
		t.Fatalf("unexpected first message: %#v", messages[0])
	}
	for index, current := range messages[1 : len(messages)-1] {
		wantSequence := uint64(index + 1)
		if current.Type != "telemetry" || current.Sequence != wantSequence {
			t.Errorf("frame %d has type %q sequence %d", index, current.Type, current.Sequence)
		}
		wantTime := time.Date(2026, time.January, 1, 12, 0, 0, index*20_000_000, time.UTC).Format(time.RFC3339Nano)
		if current.CapturedAt != wantTime {
			t.Errorf("frame %d capturedAt = %q, want %q", index, current.CapturedAt, wantTime)
		}
	}

	firstFrame := messages[1]
	if firstFrame.Player == nil || firstFrame.Player.Driver != "Apex Self-Test" {
		t.Fatalf("fixture player missing: %#v", firstFrame.Player)
	}
	if got := firstFrame.Player.Wheels[0].PressurePsi; got != 24 {
		t.Errorf("front-left pressure = %v, want 24", got)
	}
	if got := firstFrame.Player.Wheels[0].WearRemaining; got != 0.87 {
		t.Errorf("front-left wear remaining = %v, want 0.87", got)
	}
	if got := len(firstFrame.Opponents); got != 2 {
		t.Fatalf("opponents = %d, want 2", got)
	}
	if firstFrame.Opponents[1].Class != "LMP2" || !firstFrame.Opponents[1].InPits {
		t.Errorf("multiclass pit fixture missing: %#v", firstFrame.Opponents[1])
	}

	complete := messages[len(messages)-1]
	if complete.Type != "status" || complete.State != "self-test-complete" || complete.Frames != options.frames {
		t.Fatalf("unexpected completion message: %#v", complete)
	}
}

func TestParseCLIOptionsBoundsSelfTest(t *testing.T) {
	replayPath := filepath.Join(t.TempDir(), "fixture.apexrec")
	tests := []struct {
		name string
		args []string
	}{
		{name: "zero frames", args: []string{"--self-test", "--frames=0"}},
		{name: "too many frames", args: []string{"--self-test", "--frames=257"}},
		{name: "unsafe run id", args: []string{"--self-test", "--run-id=contains spaces"}},
		{name: "unsafe replay run id", args: []string{"--replay=" + replayPath, "--run-id=contains spaces"}},
		{name: "strict outside replay", args: []string{"--replay-strict"}},
		{name: "negative parent", args: []string{"--parent-pid=-1"}},
		{name: "positional argument", args: []string{"--self-test", "extra"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := parseCLIOptions(test.args); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}

	options, err := parseCLIOptions([]string{"--self-test", "--frames=256", "--run-id=Apex_1.2-test", "--hz=500"})
	if err != nil {
		t.Fatalf("valid upper bound: %v", err)
	}
	if options.frames != 256 || options.hz != 100 {
		t.Fatalf("unexpected normalized options: %#v", options)
	}
	replay, err := parseCLIOptions([]string{"--replay=" + replayPath, "--replay-speed=0", "--replay-strict", "--run-id=real-fixture"})
	if err != nil || !replay.replayStrict || replay.runID != "real-fixture" || replay.replaySpeed != 0 {
		t.Fatalf("valid replay options: %#v, error=%v", replay, err)
	}
}

func TestRunSelfTestReportsWriterFailure(t *testing.T) {
	options, err := parseCLIOptions([]string{"--self-test", "--frames=1"})
	if err != nil {
		t.Fatal(err)
	}
	err = runSelfTest(failingWriter{}, options)
	if err == nil {
		t.Fatal("expected writer error")
	}
}

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) {
	return 0, errors.New("fixture writer failed")
}

func decodeMessages(t *testing.T, data []byte) []message {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	messages := make([]message, 0)
	for {
		var current message
		err := decoder.Decode(&current)
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatalf("decode message %d: %v", len(messages), err)
		}
		messages = append(messages, current)
	}
	return messages
}
