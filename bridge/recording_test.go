package main

import (
	"bufio"
	"bytes"
	"compress/zlib"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

var recordingReaderAllocationSink byte

func recordingWithEncodedSnapshot(t *testing.T, decoded []byte, checksum uint32) []byte {
	t.Helper()
	metadata, err := json.Marshal(recordingMetadata{
		Format: recordingFormat, CreatedAt: "2026-07-12T12:00:00Z", AppVersion: "test",
		SampleRateHz: 50, Source: lmuSharedMemoryName, PayloadBytes: lmuSharedMemoryPayloadSize,
	})
	if err != nil {
		t.Fatal(err)
	}
	var compressed bytes.Buffer
	zipper := zlib.NewWriter(&compressed)
	if _, err := zipper.Write(decoded); err != nil {
		t.Fatal(err)
	}
	if err := zipper.Close(); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	output.WriteString(recordingMagic)
	var metadataSize [4]byte
	binary.LittleEndian.PutUint32(metadataSize[:], uint32(len(metadata)))
	output.Write(metadataSize[:])
	output.Write(metadata)
	var header [recordingRecordHeader]byte
	header[0] = recordingFullSnapshot
	binary.LittleEndian.PutUint32(header[9:13], lmuSharedMemoryPayloadSize)
	binary.LittleEndian.PutUint32(header[13:17], uint32(compressed.Len()))
	binary.LittleEndian.PutUint32(header[17:21], checksum)
	output.Write(header[:])
	output.Write(compressed.Bytes())
	return output.Bytes()
}

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

func TestRecordingReaderReusesBoundedBuffersWithoutChangingRawBytes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.apexrec")
	writer, err := createRecording(path, recordingMetadata{
		Format: recordingFormat, CreatedAt: "2026-07-12T12:00:00Z", AppVersion: "test",
		SampleRateHz: 50, Source: lmuSharedMemoryName, PayloadBytes: lmuSharedMemoryPayloadSize,
	})
	if err != nil {
		t.Fatal(err)
	}
	const snapshotCount = 32
	fixture := makeContractFixture()
	want := make([][]byte, snapshotCount)
	for index := range snapshotCount {
		putF64(fixture, lmuScoringOffset+228, float64(index)+0.25)
		want[index] = append([]byte(nil), fixture...)
		if err := writer.WriteSnapshot(time.Duration(index)*20*time.Millisecond, fixture); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	reader, err := newRecordingReader(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	var firstBuffer, secondBuffer []byte
	for index := range snapshotCount {
		record, readErr := reader.Next()
		if readErr != nil || !bytes.Equal(record.Raw, want[index]) {
			t.Fatalf("snapshot %d mismatch: %v", index, readErr)
		}
		if index == 0 {
			firstBuffer = record.Raw
		} else if index == 1 {
			secondBuffer = record.Raw
		} else {
			expected := firstBuffer
			if index%2 == 1 {
				expected = secondBuffer
			}
			if &record.Raw[0] != &expected[0] {
				t.Fatalf("snapshot %d allocated a third raw buffer", index)
			}
		}
	}
	if _, err := reader.Next(); err != io.EOF {
		t.Fatalf("end = %v", err)
	}

	// This guards the asymptotic property, not wall-clock timing: reopening the
	// stream has a fixed allocation cost, while advancing through more snapshots
	// must reuse the compressed payload, zlib state, and two raw buffers.
	result := testing.Benchmark(func(benchmark *testing.B) {
		benchmark.ReportAllocs()
		for iteration := 0; iteration < benchmark.N; iteration++ {
			current, openErr := newRecordingReader(bytes.NewReader(data))
			if openErr != nil {
				panic(openErr)
			}
			frames := 0
			for {
				record, readErr := current.Next()
				if readErr == io.EOF {
					break
				}
				if readErr != nil {
					panic(readErr)
				}
				if len(record.Raw) > 0 {
					recordingReaderAllocationSink ^= record.Raw[frames%len(record.Raw)]
					frames++
				}
			}
			if frames != snapshotCount {
				panic("unexpected snapshot count")
			}
		}
	})
	maximumAllocationBytes := int64(4 * lmuSharedMemoryPayloadSize)
	t.Logf("reader allocation guard: %d bytes in %d objects for %d snapshots", result.AllocedBytesPerOp(), result.AllocsPerOp(), snapshotCount)
	if result.AllocedBytesPerOp() > maximumAllocationBytes || result.AllocsPerOp() > 256 {
		t.Fatalf("reader allocated %d bytes in %d objects for %d snapshots; want at most %d bytes in 256 bounded allocations", result.AllocedBytesPerOp(), result.AllocsPerOp(), snapshotCount, maximumAllocationBytes)
	}
}

func TestRecordingReaderRejectsWrongDecompressedSizeAndChecksum(t *testing.T) {
	exact := make([]byte, lmuSharedMemoryPayloadSize)
	tests := []struct {
		name     string
		decoded  []byte
		checksum uint32
	}{
		{name: "short", decoded: make([]byte, lmuSharedMemoryPayloadSize-1), checksum: crc32.ChecksumIEEE(make([]byte, lmuSharedMemoryPayloadSize-1))},
		{name: "oversized", decoded: make([]byte, lmuSharedMemoryPayloadSize+1), checksum: crc32.ChecksumIEEE(make([]byte, lmuSharedMemoryPayloadSize+1))},
		{name: "checksum", decoded: exact, checksum: crc32.ChecksumIEEE(exact) ^ 1},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			reader, err := newRecordingReader(bytes.NewReader(recordingWithEncodedSnapshot(t, test.decoded, test.checksum)))
			if err != nil {
				t.Fatal(err)
			}
			if _, err := reader.Next(); err == nil {
				t.Fatal("malformed snapshot was accepted")
			}
		})
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

func TestRecordingOpenRejectsAnInitiallyOversizedRegularFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "oversized.apexrec")
	if err := os.WriteFile(path, []byte("five"), 0o600); err != nil {
		t.Fatal(err)
	}
	file, err := openRecordingFileWithLimit(path, 3)
	if file != nil {
		_ = file.Close()
	}
	if !errors.Is(err, errRecordingTooLarge) {
		t.Fatalf("error = %v", err)
	}
}

func TestRecordingSizeGuardRejectsGrowthPastTheAcceptedBoundary(t *testing.T) {
	raw := makeContractFixture()
	data := recordingWithEncodedSnapshot(t, raw, crc32.ChecksumIEEE(raw))
	guard := &recordingSizeGuard{reader: bytes.NewReader(data), remaining: int64(len(data) - 1)}
	reader, err := newRecordingReader(guard)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Next(); !errors.Is(err, errRecordingTooLarge) {
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
	recordingBytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	wantSHA256 := fmt.Sprintf("%x", sha256.Sum256(recordingBytes))
	var output bytes.Buffer
	if err := runReplay(&output, cliOptions{replayPath: path, replaySpeed: 0, runID: "recording-test"}); err != nil {
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
	if messages[2].RecordingSHA256 != wantSHA256 {
		t.Fatalf("completion recording SHA-256 = %q, want %q", messages[2].RecordingSHA256, wantSHA256)
	}
	for _, current := range messages {
		if current.RunID != "recording-test" {
			t.Fatalf("uncorrelated replay message: %#v", current)
		}
	}
}

func TestReplayReproducesCapturedSourceLifecycleWithoutOldPrivateDecoderText(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lifecycle.apexrec")
	writer, err := createRecording(path, recordingMetadata{Format: recordingFormat, CreatedAt: "2026-07-12T12:00:00Z", PayloadBytes: lmuSharedMemoryPayloadSize})
	if err != nil {
		t.Fatal(err)
	}
	fixture := makeContractFixture()
	if err := writer.WriteSnapshot(0, fixture); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteEvent(time.Second, "waiting", "private server and driver identity must not replay"); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteEvent(1100*time.Millisecond, "invalid-data", "old decoder detail must be recomputed"); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteSnapshot(2*time.Second, fixture); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	var output bytes.Buffer
	if err := runReplay(&output, cliOptions{replayPath: path, replaySpeed: 0, replayStrict: true, runID: "lifecycle-test"}); err != nil {
		t.Fatal(err)
	}
	messages := decodeMessages(t, output.Bytes())
	if len(messages) != 5 || messages[1].Type != "telemetry" || messages[2].State != "waiting" || messages[3].Type != "telemetry" || messages[4].State != "replay-complete" {
		t.Fatalf("messages = %#v", messages)
	}
	if messages[2].CapturedAt != "2026-07-12T12:00:01Z" || messages[2].Message != replayableRecordingLifecycleStates["waiting"] {
		t.Fatalf("lifecycle status = %#v", messages[2])
	}
	if bytes.Contains(output.Bytes(), []byte("private server")) || bytes.Contains(output.Bytes(), []byte("old decoder detail")) {
		t.Fatalf("replay leaked historical free-text event: %s", output.String())
	}
}

func TestPartialReplayDoesNotClaimACompleteStreamHash(t *testing.T) {
	path := filepath.Join(t.TempDir(), "truncated.apexrec")
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
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data[:len(data)-1], 0o600); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := runReplay(&output, cliOptions{replayPath: path, replaySpeed: 0, runID: "partial-test"}); err != nil {
		t.Fatal(err)
	}
	messages := decodeMessages(t, output.Bytes())
	completion := messages[len(messages)-1]
	if completion.State != "replay-complete" || completion.RecordingSHA256 != "" {
		t.Fatalf("partial replay completion = %#v", completion)
	}
}

func TestTelemetryProtocolEncodesNoOpponentsAsArray(t *testing.T) {
	var output bytes.Buffer
	if err := emit(json.NewEncoder(&output), message{Type: "telemetry", Session: &session{}, Player: &vehicle{}}); err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err := json.Unmarshal(output.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	opponents, ok := raw["opponents"].([]any)
	if !ok || len(opponents) != 0 {
		t.Fatalf("opponents = %#v, want []", raw["opponents"])
	}
}

func TestStrictReplayRejectsTruncatedTailWithoutCompletion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "truncated.apexrec")
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
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data[:len(data)-1], 0o600); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	err = runReplay(&output, cliOptions{replayPath: path, replaySpeed: 0, replayStrict: true, runID: "strict-test"})
	if !errors.Is(err, errRecordingTruncated) {
		t.Fatalf("error = %v", err)
	}
	messages := decodeMessages(t, output.Bytes())
	if messages[len(messages)-1].State != "replay-partial" {
		t.Fatalf("messages = %#v", messages)
	}
	for _, current := range messages {
		if current.State == "replay-complete" {
			t.Fatal("strict truncated replay emitted completion")
		}
	}
}

func TestStrictReplayRejectsCurrentDecoderFaultWithoutCompletion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "decoder-invalid.apexrec")
	raw := makeContractFixture()
	raw[lmuTelemetryOffset] = lmuMaximumVehicles + 1
	if err := os.WriteFile(path, recordingWithEncodedSnapshot(t, raw, crc32.ChecksumIEEE(raw)), 0o600); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	err := runReplay(&output, cliOptions{replayPath: path, replaySpeed: 0, replayStrict: true, runID: "strict-decoder-test"})
	if !errors.Is(err, errRecordingDecode) {
		t.Fatalf("error = %v", err)
	}
	messages := decodeMessages(t, output.Bytes())
	if len(messages) != 2 || messages[0].State != "replay-starting" || messages[1].State != "invalid-data" {
		t.Fatalf("messages = %#v", messages)
	}
	for _, current := range messages {
		if current.State == "replay-complete" || current.RecordingSHA256 != "" {
			t.Fatalf("strict decoder failure claimed completion: %#v", current)
		}
	}
}

func TestStrictReplayToleratesScoringBeforeAPlayerVehicleExists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "waiting-for-vehicle.apexrec")
	writer, err := createRecording(path, recordingMetadata{Format: recordingFormat, CreatedAt: "2026-07-12T12:00:00Z", PayloadBytes: lmuSharedMemoryPayloadSize})
	if err != nil {
		t.Fatal(err)
	}
	waiting := makeContractFixture()
	waiting[lmuTelemetryOffset] = 0
	waiting[lmuTelemetryOffset+1] = 0
	waiting[lmuTelemetryOffset+2] = 0
	waiting[lmuVehicleScoringBase+196] = 0
	waiting[lmuVehicleScoringBase+lmuVehicleScoringSize+196] = 0
	waiting[lmuVehicleScoringBase+2*lmuVehicleScoringSize+196] = 0
	clear(waiting[lmuScoringOffset+116 : lmuScoringOffset+148])
	if err := writer.WriteSnapshot(0, waiting); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteSnapshot(20*time.Millisecond, makeContractFixture()); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	var output bytes.Buffer
	if err := runReplay(&output, cliOptions{replayPath: path, replaySpeed: 0, replayStrict: true, runID: "strict-waiting-test"}); err != nil {
		t.Fatal(err)
	}
	messages := decodeMessages(t, output.Bytes())
	if len(messages) != 4 || messages[1].State != "waiting-for-vehicle" || messages[2].Type != "telemetry" || messages[3].State != "replay-complete" || messages[3].RecordingSHA256 == "" {
		t.Fatalf("messages = %#v", messages)
	}
}
