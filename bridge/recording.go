package main

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"os"
	"time"
)

const (
	recordingMagic         = "APEXLMUREC1\n"
	recordingFormat        = "apex-lmu-raw-v1"
	recordingFullSnapshot  = byte(1)
	recordingDeltaSnapshot = byte(2)
	recordingEvent         = byte(3)
	recordingKeyframeEvery = 250
	recordingRecordHeader  = 21
	maxRecordingHeader     = 1 << 20
	maxRecordingPayload    = 16 << 20
	maxRecordingBytes      = int64(8 << 30)
)

var errRecordingTruncated = errors.New("recording ends with an incomplete record")

type recordingMetadata struct {
	Format        string `json:"format"`
	CreatedAt     string `json:"createdAt"`
	AppVersion    string `json:"appVersion"`
	SampleRateHz  int    `json:"sampleRateHz"`
	Source        string `json:"source"`
	PayloadBytes  int    `json:"payloadBytes"`
	PrivacyNotice string `json:"privacyNotice"`
}

type recordingTimelineEvent struct {
	State   string `json:"state"`
	Message string `json:"message"`
}

type recordingRecord struct {
	Kind    byte
	Elapsed time.Duration
	Raw     []byte
	Event   recordingTimelineEvent
}

type recordingWriter struct {
	file      *os.File
	previous  []byte
	snapshots uint64
	bytes     int64
}

func createRecording(path string, metadata recordingMetadata) (*recordingWriter, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create recording: %w", err)
	}
	writer := &recordingWriter{file: file}
	header, err := json.Marshal(metadata)
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("encode recording metadata: %w", err)
	}
	if len(header) > maxRecordingHeader {
		_ = file.Close()
		return nil, fmt.Errorf("recording metadata is too large")
	}
	if err := writer.write([]byte(recordingMagic)); err != nil {
		_ = file.Close()
		return nil, err
	}
	var size [4]byte
	binary.LittleEndian.PutUint32(size[:], uint32(len(header)))
	if err := writer.write(size[:]); err != nil {
		_ = file.Close()
		return nil, err
	}
	if err := writer.write(header); err != nil {
		_ = file.Close()
		return nil, err
	}
	return writer, nil
}

func (writer *recordingWriter) WriteEvent(elapsed time.Duration, state, message string) error {
	payload, err := json.Marshal(recordingTimelineEvent{State: state, Message: message})
	if err != nil {
		return err
	}
	return writer.writeRecord(recordingEvent, elapsed, nil, payload, crc32.ChecksumIEEE(payload))
}

func (writer *recordingWriter) WriteSnapshot(elapsed time.Duration, raw []byte) error {
	if len(raw) != lmuSharedMemoryPayloadSize {
		return fmt.Errorf("recording snapshot is %d bytes; expected %d", len(raw), lmuSharedMemoryPayloadSize)
	}
	kind := recordingDeltaSnapshot
	input := raw
	if writer.previous == nil || writer.snapshots%recordingKeyframeEvery == 0 {
		kind = recordingFullSnapshot
	} else {
		delta := make([]byte, len(raw))
		for index := range raw {
			delta[index] = raw[index] ^ writer.previous[index]
		}
		input = delta
	}
	var compressed bytes.Buffer
	zipper, err := zlib.NewWriterLevel(&compressed, zlib.BestSpeed)
	if err != nil {
		return err
	}
	if _, err := zipper.Write(input); err != nil {
		return err
	}
	if err := zipper.Close(); err != nil {
		return err
	}
	if err := writer.writeRecord(kind, elapsed, raw, compressed.Bytes(), crc32.ChecksumIEEE(raw)); err != nil {
		return err
	}
	writer.previous = append(writer.previous[:0], raw...)
	writer.snapshots++
	return nil
}

func (writer *recordingWriter) writeRecord(kind byte, elapsed time.Duration, raw, payload []byte, checksum uint32) error {
	if len(payload) > maxRecordingPayload {
		return fmt.Errorf("recording payload is too large: %d", len(payload))
	}
	header := make([]byte, recordingRecordHeader)
	header[0] = kind
	binary.LittleEndian.PutUint64(header[1:9], uint64(max(0, elapsed.Nanoseconds())))
	binary.LittleEndian.PutUint32(header[9:13], uint32(len(raw)))
	binary.LittleEndian.PutUint32(header[13:17], uint32(len(payload)))
	binary.LittleEndian.PutUint32(header[17:21], checksum)
	if err := writer.write(header); err != nil {
		return err
	}
	return writer.write(payload)
}

func (writer *recordingWriter) write(value []byte) error {
	if writer.bytes+int64(len(value)) > maxRecordingBytes {
		return fmt.Errorf("recording reached the 8 GiB safety limit")
	}
	written, err := writer.file.Write(value)
	writer.bytes += int64(written)
	if err != nil {
		return fmt.Errorf("write recording: %w", err)
	}
	if written != len(value) {
		return io.ErrShortWrite
	}
	return nil
}

func (writer *recordingWriter) Close() error {
	if writer == nil || writer.file == nil {
		return nil
	}
	err := writer.file.Close()
	writer.file = nil
	return err
}

type recordingReader struct {
	reader      io.Reader
	Metadata    recordingMetadata
	previous    []byte
	lastElapsed time.Duration
}

func openRecording(path string) (*recordingReader, *os.File, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("open recording: %w", err)
	}
	reader, err := newRecordingReader(file)
	if err != nil {
		_ = file.Close()
		return nil, nil, err
	}
	return reader, file, nil
}

func newRecordingReader(source io.Reader) (*recordingReader, error) {
	magic := make([]byte, len(recordingMagic))
	if _, err := io.ReadFull(source, magic); err != nil || string(magic) != recordingMagic {
		return nil, fmt.Errorf("not an Apex LMU recording")
	}
	var size [4]byte
	if _, err := io.ReadFull(source, size[:]); err != nil {
		return nil, errRecordingTruncated
	}
	headerSize := binary.LittleEndian.Uint32(size[:])
	if headerSize == 0 || headerSize > maxRecordingHeader {
		return nil, fmt.Errorf("invalid recording metadata size %d", headerSize)
	}
	header := make([]byte, headerSize)
	if _, err := io.ReadFull(source, header); err != nil {
		return nil, errRecordingTruncated
	}
	result := &recordingReader{reader: source}
	if err := json.Unmarshal(header, &result.Metadata); err != nil {
		return nil, fmt.Errorf("decode recording metadata: %w", err)
	}
	if result.Metadata.Format != recordingFormat || result.Metadata.PayloadBytes != lmuSharedMemoryPayloadSize {
		return nil, fmt.Errorf("unsupported recording contract %q (%d bytes)", result.Metadata.Format, result.Metadata.PayloadBytes)
	}
	if _, err := time.Parse(time.RFC3339Nano, result.Metadata.CreatedAt); err != nil {
		return nil, fmt.Errorf("invalid recording creation time: %w", err)
	}
	return result, nil
}

func (reader *recordingReader) Next() (recordingRecord, error) {
	header := make([]byte, recordingRecordHeader)
	read, err := io.ReadFull(reader.reader, header)
	if err == io.EOF && read == 0 {
		return recordingRecord{}, io.EOF
	}
	if err != nil {
		return recordingRecord{}, errRecordingTruncated
	}
	kind := header[0]
	elapsedValue := binary.LittleEndian.Uint64(header[1:9])
	if elapsedValue > uint64(1<<63-1) {
		return recordingRecord{}, fmt.Errorf("recording timestamp exceeds limit")
	}
	elapsed := time.Duration(elapsedValue)
	if elapsed < reader.lastElapsed {
		return recordingRecord{}, fmt.Errorf("recording timestamps are not monotonic")
	}
	reader.lastElapsed = elapsed
	rawSize := binary.LittleEndian.Uint32(header[9:13])
	payloadSize := binary.LittleEndian.Uint32(header[13:17])
	checksum := binary.LittleEndian.Uint32(header[17:21])
	if payloadSize > maxRecordingPayload {
		return recordingRecord{}, fmt.Errorf("recording payload size %d exceeds limit", payloadSize)
	}
	payload := make([]byte, payloadSize)
	if _, err := io.ReadFull(reader.reader, payload); err != nil {
		return recordingRecord{}, errRecordingTruncated
	}
	result := recordingRecord{Kind: kind, Elapsed: elapsed}
	if kind == recordingEvent {
		if rawSize != 0 {
			return recordingRecord{}, fmt.Errorf("recording event declares raw bytes")
		}
		if crc32.ChecksumIEEE(payload) != checksum {
			return recordingRecord{}, fmt.Errorf("recording event checksum mismatch")
		}
		if err := json.Unmarshal(payload, &result.Event); err != nil {
			return recordingRecord{}, fmt.Errorf("decode recording event: %w", err)
		}
		return result, nil
	}
	if (kind != recordingFullSnapshot && kind != recordingDeltaSnapshot) || rawSize != lmuSharedMemoryPayloadSize {
		return recordingRecord{}, fmt.Errorf("invalid recording snapshot header")
	}
	zipper, err := zlib.NewReader(bytes.NewReader(payload))
	if err != nil {
		return recordingRecord{}, fmt.Errorf("open compressed snapshot: %w", err)
	}
	decoded, err := io.ReadAll(io.LimitReader(zipper, int64(rawSize)+1))
	closeErr := zipper.Close()
	if err != nil || closeErr != nil || len(decoded) != int(rawSize) {
		return recordingRecord{}, fmt.Errorf("invalid compressed snapshot")
	}
	if kind == recordingDeltaSnapshot {
		if len(reader.previous) != len(decoded) {
			return recordingRecord{}, fmt.Errorf("delta snapshot has no keyframe")
		}
		for index := range decoded {
			decoded[index] ^= reader.previous[index]
		}
	}
	if crc32.ChecksumIEEE(decoded) != checksum {
		return recordingRecord{}, fmt.Errorf("recording snapshot checksum mismatch")
	}
	reader.previous = append(reader.previous[:0], decoded...)
	result.Raw = decoded
	return result, nil
}

func runReplay(output io.Writer, options cliOptions) error {
	reader, file, err := openRecording(options.replayPath)
	if err != nil {
		return err
	}
	defer file.Close()
	encoder := json.NewEncoder(output)
	startTime, _ := time.Parse(time.RFC3339Nano, reader.Metadata.CreatedAt)
	_ = emit(encoder, message{Source: recordingReplaySource, Type: "status", State: "replay-starting", Message: "Replaying raw LMU shared-memory recording"})
	wallStart := time.Now()
	var sequence uint64
	lastIssue := ""
	for {
		record, readErr := reader.Next()
		if readErr == io.EOF {
			break
		}
		if errors.Is(readErr, errRecordingTruncated) {
			_ = emit(encoder, message{Source: recordingReplaySource, Type: "status", State: "replay-partial", Message: readErr.Error()})
			break
		}
		if readErr != nil {
			return readErr
		}
		if options.replaySpeed > 0 {
			target := time.Duration(float64(record.Elapsed) / options.replaySpeed)
			if wait := target - time.Since(wallStart); wait > 0 {
				time.Sleep(wait)
			}
		}
		if record.Raw == nil {
			continue
		}
		decoded, decodeErr := decodeSnapshot(record.Raw)
		if decodeErr != nil {
			state := "invalid-data"
			if errors.Is(decodeErr, errLMUPlayerHasNoVehicle) {
				state = "waiting-for-vehicle"
			}
			if state != lastIssue {
				_ = emit(encoder, message{Source: recordingReplaySource, Type: "status", State: state, Message: decodeErr.Error()})
				lastIssue = state
			}
			continue
		}
		lastIssue = ""
		sequence++
		capturedAt := startTime.Add(record.Elapsed)
		_ = emit(encoder, message{
			Source: recordingReplaySource, Type: "telemetry", CapturedAt: capturedAt.Format(time.RFC3339Nano), Sequence: sequence,
			GameVersion: decoded.GameVersion, Session: &decoded.Session, Player: &decoded.Player, Opponents: decoded.Opponents,
			PlayerTelemetryAvailable: decoded.PlayerTelemetryAvailable,
		})
	}
	return emit(encoder, message{Source: recordingReplaySource, Type: "status", State: "replay-complete", Message: "Recording replay complete", Frames: int(sequence)})
}
