package main

import (
	"bytes"
	"compress/zlib"
	"crypto/sha256"
	"crypto/subtle"
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

var (
	errRecordingTruncated = errors.New("recording ends with an incomplete record")
	errRecordingDecode    = errors.New("recording snapshot rejected by the current decoder")
	errRecordingTooLarge  = errors.New("recording exceeds the 8 GiB safety limit")
)

var replayableRecordingLifecycleStates = map[string]string{
	"waiting":      "Captured LMU source is waiting.",
	"mapping-open": "Captured LMU shared memory opened.",
	"connected":    "Captured LMU source connected.",
	"disconnected": "Captured LMU source disconnected.",
	"missing":      "Captured LMU source became unavailable.",
	"stopped":      "Captured LMU source stopped.",
}

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
	header      [recordingRecordHeader]byte
	payload     []byte
	compressed  bytes.Reader
	zipper      io.ReadCloser
	previous    []byte
	current     []byte
	lastElapsed time.Duration
}

type recordingSizeGuard struct {
	reader    io.Reader
	remaining int64
}

func (guard *recordingSizeGuard) Read(target []byte) (int, error) {
	if len(target) == 0 {
		return 0, nil
	}
	if guard.remaining <= 0 {
		// Probe once beyond the accepted boundary. Returning EOF here without a
		// probe would make a recording that grew past the initial stat look like a
		// cleanly completed stream at exactly maxRecordingBytes.
		var extra [1]byte
		read, err := guard.reader.Read(extra[:])
		if read > 0 {
			return 0, errRecordingTooLarge
		}
		return 0, err
	}
	if int64(len(target)) > guard.remaining {
		target = target[:guard.remaining]
	}
	read, err := guard.reader.Read(target)
	guard.remaining -= int64(read)
	return read, err
}

func openRecordingFile(path string) (*os.File, error) {
	return openRecordingFileWithLimit(path, maxRecordingBytes)
}

func openRecordingFileWithLimit(path string, maximumBytes int64) (*os.File, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open recording: %w", err)
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("stat recording: %w", err)
	}
	if !info.Mode().IsRegular() {
		_ = file.Close()
		return nil, fmt.Errorf("recording is not a regular file")
	}
	if info.Size() > maximumBytes {
		_ = file.Close()
		return nil, errRecordingTooLarge
	}
	return file, nil
}

func openRecording(path string) (*recordingReader, *os.File, error) {
	file, err := openRecordingFile(path)
	if err != nil {
		return nil, nil, err
	}
	reader, err := newRecordingReader(&recordingSizeGuard{reader: file, remaining: maxRecordingBytes})
	if err != nil {
		_ = file.Close()
		return nil, nil, err
	}
	return reader, file, nil
}

func newRecordingReader(source io.Reader) (*recordingReader, error) {
	magic := make([]byte, len(recordingMagic))
	if _, err := io.ReadFull(source, magic); err != nil {
		if errors.Is(err, errRecordingTooLarge) {
			return nil, err
		}
		return nil, fmt.Errorf("not an Apex LMU recording")
	}
	if string(magic) != recordingMagic {
		return nil, fmt.Errorf("not an Apex LMU recording")
	}
	var size [4]byte
	if _, err := io.ReadFull(source, size[:]); err != nil {
		if errors.Is(err, errRecordingTooLarge) {
			return nil, err
		}
		return nil, errRecordingTruncated
	}
	headerSize := binary.LittleEndian.Uint32(size[:])
	if headerSize == 0 || headerSize > maxRecordingHeader {
		return nil, fmt.Errorf("invalid recording metadata size %d", headerSize)
	}
	header := make([]byte, headerSize)
	if _, err := io.ReadFull(source, header); err != nil {
		if errors.Is(err, errRecordingTooLarge) {
			return nil, err
		}
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
	read, err := io.ReadFull(reader.reader, reader.header[:])
	if err == io.EOF && read == 0 {
		return recordingRecord{}, io.EOF
	}
	if err != nil {
		if errors.Is(err, errRecordingTooLarge) {
			return recordingRecord{}, err
		}
		return recordingRecord{}, errRecordingTruncated
	}
	kind := reader.header[0]
	elapsedValue := binary.LittleEndian.Uint64(reader.header[1:9])
	if elapsedValue > uint64(1<<63-1) {
		return recordingRecord{}, fmt.Errorf("recording timestamp exceeds limit")
	}
	elapsed := time.Duration(elapsedValue)
	if elapsed < reader.lastElapsed {
		return recordingRecord{}, fmt.Errorf("recording timestamps are not monotonic")
	}
	reader.lastElapsed = elapsed
	rawSize := binary.LittleEndian.Uint32(reader.header[9:13])
	payloadSize := binary.LittleEndian.Uint32(reader.header[13:17])
	checksum := binary.LittleEndian.Uint32(reader.header[17:21])
	if payloadSize > maxRecordingPayload {
		return recordingRecord{}, fmt.Errorf("recording payload size %d exceeds limit", payloadSize)
	}
	if cap(reader.payload) < int(payloadSize) {
		reader.payload = make([]byte, payloadSize)
	} else {
		reader.payload = reader.payload[:payloadSize]
	}
	if _, err := io.ReadFull(reader.reader, reader.payload); err != nil {
		if errors.Is(err, errRecordingTooLarge) {
			return recordingRecord{}, err
		}
		return recordingRecord{}, errRecordingTruncated
	}
	result := recordingRecord{Kind: kind, Elapsed: elapsed}
	if kind == recordingEvent {
		if rawSize != 0 {
			return recordingRecord{}, fmt.Errorf("recording event declares raw bytes")
		}
		if crc32.ChecksumIEEE(reader.payload) != checksum {
			return recordingRecord{}, fmt.Errorf("recording event checksum mismatch")
		}
		if err := json.Unmarshal(reader.payload, &result.Event); err != nil {
			return recordingRecord{}, fmt.Errorf("decode recording event: %w", err)
		}
		return result, nil
	}
	if (kind != recordingFullSnapshot && kind != recordingDeltaSnapshot) || rawSize != lmuSharedMemoryPayloadSize {
		return recordingRecord{}, fmt.Errorf("invalid recording snapshot header")
	}
	if len(reader.current) != int(rawSize) {
		reader.current = make([]byte, rawSize)
	}
	reader.compressed.Reset(reader.payload)
	if reader.zipper == nil {
		reader.zipper, err = zlib.NewReader(&reader.compressed)
	} else {
		resetter, ok := reader.zipper.(zlib.Resetter)
		if !ok {
			return recordingRecord{}, fmt.Errorf("compressed snapshot reader cannot be reset")
		}
		err = resetter.Reset(&reader.compressed, nil)
	}
	if err != nil {
		return recordingRecord{}, fmt.Errorf("open compressed snapshot: %w", err)
	}
	decoded := reader.current
	_, readErr := io.ReadFull(reader.zipper, decoded)
	var extra [1]byte
	extraBytes, extraErr := io.ReadFull(reader.zipper, extra[:])
	closeErr := reader.zipper.Close()
	if readErr != nil || extraBytes != 0 || extraErr != io.EOF || closeErr != nil {
		return recordingRecord{}, fmt.Errorf("invalid compressed snapshot")
	}
	if kind == recordingDeltaSnapshot {
		if len(reader.previous) != len(decoded) {
			return recordingRecord{}, fmt.Errorf("delta snapshot has no keyframe")
		}
		subtle.XORBytes(decoded, decoded, reader.previous)
	}
	if crc32.ChecksumIEEE(decoded) != checksum {
		return recordingRecord{}, fmt.Errorf("recording snapshot checksum mismatch")
	}
	// Raw is backed by two alternating reader-owned buffers. The caller may use
	// it until the next call to Next; code that retains it longer must clone it.
	// Replay decodes and emits each snapshot synchronously before advancing.
	reader.current = reader.previous
	reader.previous = decoded
	result.Raw = decoded
	return result, nil
}

func runReplay(output io.Writer, options cliOptions) error {
	file, err := openRecordingFile(options.replayPath)
	if err != nil {
		return err
	}
	defer file.Close()
	recordingHash := sha256.New()
	guardedFile := &recordingSizeGuard{reader: file, remaining: maxRecordingBytes}
	reader, err := newRecordingReader(io.TeeReader(guardedFile, recordingHash))
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(output)
	startTime, _ := time.Parse(time.RFC3339Nano, reader.Metadata.CreatedAt)
	_ = emit(encoder, message{Source: recordingReplaySource, RunID: options.runID, Type: "status", State: "replay-starting", Message: "Replaying raw LMU shared-memory recording"})
	wallStart := time.Now()
	var sequence uint64
	lastIssue := ""
	var decodeIssues decodeIssueTracker
	completeStream := false
	for {
		record, readErr := reader.Next()
		if readErr == io.EOF {
			completeStream = true
			break
		}
		if errors.Is(readErr, errRecordingTruncated) {
			_ = emit(encoder, message{Source: recordingReplaySource, RunID: options.runID, Type: "status", State: "replay-partial", Message: readErr.Error()})
			if options.replayStrict {
				return readErr
			}
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
			// Reproduce only source-lifecycle truth from the capture. Historical
			// decoder errors and their free-text messages are deliberately ignored:
			// the current decoder derives those states again from the raw snapshot,
			// and the recorded message may contain private scoring identity data.
			if detail, ok := replayableRecordingLifecycleStates[record.Event.State]; ok {
				capturedAt := startTime.Add(record.Elapsed)
				_ = emit(encoder, message{
					Source: recordingReplaySource, RunID: options.runID, Type: "status", State: record.Event.State,
					Message: detail, CapturedAt: capturedAt.Format(time.RFC3339Nano),
				})
			}
			continue
		}
		decoded, decodeErr := decodeSnapshot(record.Raw)
		if decodeErr != nil {
			state := decodeIssues.classify(record.Elapsed, decodeErr)
			if state != lastIssue {
				_ = emit(encoder, message{Source: recordingReplaySource, RunID: options.runID, Type: "status", State: state, Message: decodeErr.Error()})
				lastIssue = state
			}
			// A missing player vehicle is an expected LMU lifecycle state: scoring
			// can exist before a uniquely selected car does. Every other decoder
			// rejection means strict import did not pass every reconstructed raw
			// snapshot through the current contract, so fail without completion.
			// Do not wrap decodeErr here because it may contain private driver data.
			if options.replayStrict && !errors.Is(decodeErr, errLMUPlayerHasNoVehicle) {
				return fmt.Errorf("%w (%s at %s)", errRecordingDecode, state, record.Elapsed)
			}
			continue
		}
		decodeIssues.reset()
		lastIssue = ""
		sequence++
		capturedAt := startTime.Add(record.Elapsed)
		_ = emit(encoder, message{
			Source: recordingReplaySource, RunID: options.runID, Type: "telemetry", CapturedAt: capturedAt.Format(time.RFC3339Nano), Sequence: sequence,
			GameVersion: decoded.GameVersion, Session: &decoded.Session, Player: &decoded.Player, Opponents: decoded.Opponents,
			PlayerTelemetryAvailable: decoded.PlayerTelemetryAvailable,
		})
	}
	completion := message{
		Source: recordingReplaySource, RunID: options.runID, Type: "status", State: "replay-complete",
		Message: "Recording replay complete", Frames: int(sequence),
	}
	if completeStream {
		completion.RecordingSHA256 = fmt.Sprintf("%x", recordingHash.Sum(nil))
	}
	return emit(encoder, completion)
}
