package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRecordingRoundTripPreservesRawSnapshotsAndTimeline(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.apexrec")
	writer, err := createRecording(path, recordingMetadata{
		Format: recordingFormat, CreatedAt: "2026-07-12T12:00:00Z", AppVersion: "test",
		SampleRateHz: 50, Source: lmuSharedMemoryName, PayloadBytes: lmuSharedMemoryPayloadSize,
	})
	if err != nil {
		t.Fatal(err)
	}
	first := makeContractFixture()
	second := append([]byte(nil), first...)
	putF64(second, lmuScoringOffset+228, 21.5)
	if err := writer.WriteEvent(time.Second, "mapping-open", "opened"); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteSnapshot(2*time.Second, first); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteSnapshot(2020*time.Millisecond, second); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	reader, file, err := openRecording(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if reader.Metadata.Format != recordingFormat || reader.Metadata.SampleRateHz != 50 {
		t.Fatalf("metadata: %#v", reader.Metadata)
	}
	event, err := reader.Next()
	if err != nil || event.Event.State != "mapping-open" {
		t.Fatalf("event: %#v, %v", event, err)
	}
	gotFirst, err := reader.Next()
	if err != nil || !bytes.Equal(gotFirst.Raw, first) {
		t.Fatalf("first snapshot mismatch: %v", err)
	}
	gotSecond, err := reader.Next()
	if err != nil || !bytes.Equal(gotSecond.Raw, second) {
		t.Fatalf("delta snapshot mismatch: %v", err)
	}
	if _, err := reader.Next(); err != io.EOF {
		t.Fatalf("end = %v", err)
	}
}

func TestRecordingReportsTruncatedTailAfterCompleteFrames(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.apexrec")
	writer, err := createRecording(path, recordingMetadata{Format: recordingFormat, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano), PayloadBytes: lmuSharedMemoryPayloadSize})
	if err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteSnapshot(0, makeContractFixture()); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data[:len(data)-3], 0o600); err != nil {
		t.Fatal(err)
	}
	reader, file, err := openRecording(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if _, err := reader.Next(); !errors.Is(err, errRecordingTruncated) {
		t.Fatalf("error = %v", err)
	}
}

func TestReplayRunsSnapshotsThroughCurrentDecoder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.apexrec")
	writer, err := createRecording(path, recordingMetadata{Format: recordingFormat, CreatedAt: "2026-07-12T12:00:00Z", PayloadBytes: lmuSharedMemoryPayloadSize})
	if err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteSnapshot(0, makeContractFixture()); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := runReplay(&output, cliOptions{replayPath: path, replaySpeed: 0}); err != nil {
		t.Fatal(err)
	}
	var messages []message
	scanner := bufio.NewScanner(&output)
	for scanner.Scan() {
		var current message
		if err := json.Unmarshal(scanner.Bytes(), &current); err != nil {
			t.Fatal(err)
		}
		messages = append(messages, current)
	}
	if len(messages) != 3 || messages[1].Type != "telemetry" || messages[1].Player.Name != "Porsche 963" || messages[2].State != "replay-complete" {
		t.Fatalf("replay messages: %#v", messages)
	}
}
