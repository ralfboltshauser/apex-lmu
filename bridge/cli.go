package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"time"
)

const maxSelfTestFrames = 256

var validRunID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

type cliOptions struct {
	hz           int
	selfTest     bool
	frames       int
	runID        string
	parentID     int
	recordPath   string
	replayPath   string
	replaySpeed  float64
	replayStrict bool
	appVersion   string
}

func parseCLIOptions(arguments []string) (cliOptions, error) {
	flags := flag.NewFlagSet("apex-lmu-bridge", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	hz := flags.Int("hz", 50, "telemetry output frequency (10-100 Hz)")
	selfTest := flags.Bool("self-test", false, "emit a finite deterministic bridge protocol fixture")
	frames := flags.Int("frames", 8, "number of telemetry frames emitted in self-test mode")
	runID := flags.String("run-id", "", "correlation identifier for self-test or replay messages")
	parentID := flags.Int("parent-pid", 0, "exit when this parent process is no longer running")
	recordPath := flags.String("record", "", "write raw LMU snapshots to an Apex recording")
	replayPath := flags.String("replay", "", "replay an Apex raw LMU recording")
	replaySpeed := flags.Float64("replay-speed", 1, "replay speed; zero runs without timing delays")
	replayStrict := flags.Bool("replay-strict", false, "fail instead of accepting an incomplete recording tail")
	appVersion := flags.String("app-version", "unknown", "Apex application version stored in recording metadata")
	if err := flags.Parse(arguments); err != nil {
		return cliOptions{}, err
	}
	if flags.NArg() != 0 {
		return cliOptions{}, fmt.Errorf("unexpected positional arguments: %v", flags.Args())
	}
	if *hz < 10 {
		*hz = 10
	}
	if *hz > 100 {
		*hz = 100
	}
	if *selfTest {
		if *runID == "" {
			*runID = "bridge-self-test"
		}
		if *frames < 1 || *frames > maxSelfTestFrames {
			return cliOptions{}, fmt.Errorf("frames must be between 1 and %d", maxSelfTestFrames)
		}
		if !validRunID.MatchString(*runID) {
			return cliOptions{}, fmt.Errorf("run-id must be 1-64 letters, digits, dots, underscores, or hyphens")
		}
	}
	if *runID != "" && !validRunID.MatchString(*runID) {
		return cliOptions{}, fmt.Errorf("run-id must be 1-64 letters, digits, dots, underscores, or hyphens")
	}
	if *parentID < 0 {
		return cliOptions{}, fmt.Errorf("parent-pid must be zero or a positive process identifier")
	}
	modes := 0
	if *selfTest {
		modes++
	}
	if *recordPath != "" {
		modes++
	}
	if *replayPath != "" {
		modes++
	}
	if modes > 1 {
		return cliOptions{}, fmt.Errorf("self-test, record, and replay modes are mutually exclusive")
	}
	if *recordPath != "" && !filepath.IsAbs(*recordPath) {
		return cliOptions{}, fmt.Errorf("record path must be absolute")
	}
	if *replayPath != "" && !filepath.IsAbs(*replayPath) {
		return cliOptions{}, fmt.Errorf("replay path must be absolute")
	}
	if (*runID != "" || *replayStrict) && *replayPath == "" && !*selfTest {
		return cliOptions{}, fmt.Errorf("run-id and replay-strict require self-test or replay mode")
	}
	if *replayStrict && *replayPath == "" {
		return cliOptions{}, fmt.Errorf("replay-strict requires replay mode")
	}
	if *replaySpeed < 0 || *replaySpeed > 16 {
		return cliOptions{}, fmt.Errorf("replay-speed must be between 0 and 16")
	}
	if len(*appVersion) == 0 || len(*appVersion) > 64 {
		return cliOptions{}, fmt.Errorf("app-version must be 1-64 characters")
	}
	return cliOptions{hz: *hz, selfTest: *selfTest, frames: *frames, runID: *runID, parentID: *parentID, recordPath: *recordPath, replayPath: *replayPath, replaySpeed: *replaySpeed, replayStrict: *replayStrict, appVersion: *appVersion}, nil
}

func runSelfTest(writer io.Writer, options cliOptions) error {
	encoder := json.NewEncoder(writer)
	start := message{
		ProtocolVersion: protocolVersion,
		Source:          selfTestSource,
		RunID:           options.runID,
		Fixture:         selfTestFixtureID,
		Type:            "status",
		State:           "self-test-starting",
		Message:         "Emitting deterministic bridge contract fixture; LMU shared memory is not being read",
	}
	if err := emit(encoder, start); err != nil {
		return fmt.Errorf("encode self-test start: %w", err)
	}

	baseTime := time.Date(2026, time.January, 1, 12, 0, 0, 0, time.UTC)
	interval := time.Second / time.Duration(options.hz)
	for index := 0; index < options.frames; index++ {
		frame := selfTestFrame(index+1, baseTime.Add(time.Duration(index)*interval), options.runID)
		if err := emit(encoder, frame); err != nil {
			return fmt.Errorf("encode self-test frame %d: %w", index+1, err)
		}
	}

	complete := message{
		ProtocolVersion: protocolVersion,
		Source:          selfTestSource,
		RunID:           options.runID,
		Fixture:         selfTestFixtureID,
		Type:            "status",
		State:           "self-test-complete",
		Message:         "Bridge transport fixture completed; LMU shared memory was not tested",
		Frames:          options.frames,
	}
	if err := emit(encoder, complete); err != nil {
		return fmt.Errorf("encode self-test completion: %w", err)
	}
	return nil
}

func selfTestFrame(sequence int, capturedAt time.Time, runID string) message {
	progress := float64(sequence - 1)
	wheels := [4]wheel{
		selfTestWheel("FL", 24.0, 88.0, 0.87),
		selfTestWheel("FR", 24.1, 89.0, 0.88),
		selfTestWheel("RL", 23.7, 86.0, 0.89),
		selfTestWheel("RR", 23.8, 87.0, 0.90),
	}
	return message{
		ProtocolVersion: protocolVersion,
		Source:          selfTestSource,
		RunID:           runID,
		Fixture:         selfTestFixtureID,
		Type:            "telemetry",
		CapturedAt:      capturedAt.Format(time.RFC3339Nano),
		Sequence:        uint64(sequence),
		Session: &session{
			Track: "Circuit de la Sarthe", Layout: "Le Mans", ElapsedSeconds: 900 + progress/50,
			EndSeconds: float64Pointer(7200), MaximumLaps: 0, TrackLengthM: 13626, Phase: 5, InRealtime: true,
			AirTempC: 18, TrackTempC: 27, Rain: 0, Wetness: 0.10, WindSpeedMps: 3.2, YellowState: 0,
		},
		Player: &vehicle{
			ID: 6, Driver: "Apex Self-Test", Name: "Porsche 963", Class: "Hypercar", Position: 3,
			Lap: 8, Sector: 2, LapDistanceM: float64Pointer(6813 + progress*1.5), LapDistanceRawM: 6813 + progress*1.5, SpeedKph: 271.4 + progress*0.2,
			RPM: 8021 + progress*5, MaximumRPM: 9000, Gear: 6, Throttle: 0.92, Brake: 0,
			Steering: -0.08, Clutch: 0, FuelL: 48.2 - progress*0.01, FuelCapacityL: 90,
			BatteryFraction: 0.64, RearBrakeBias: 0.47, DeltaBestSeconds: 0.12,
			BestLapSeconds: 205.2, LastLapSeconds: 206.1, TimeBehindLeaderSec: float64Pointer(6.1),
			TimeBehindNextSec: float64Pointer(2.8), InPits: false, PitState: 0, FrontCompound: "Mediums",
			RearCompound: "Mediums", Wheels: wheels,
		},
		Opponents: []opponent{
			{ID: 51, Driver: "Fixture Leader", Name: "Ferrari 499P", Class: "Hypercar", Position: 1, Laps: 8, LapDistanceM: float64Pointer(7000 + progress), BestLapSeconds: 204.8, LastLapSeconds: 205.4, BehindLeaderSec: float64Pointer(0), BehindNextSec: float64Pointer(0)},
			{ID: 22, Driver: "Fixture LMP2", Name: "Oreca 07", Class: "LMP2", Position: 8, Laps: 7, LapDistanceM: float64Pointer(3000 + progress), BestLapSeconds: 212, LastLapSeconds: 213, BehindLeaderSec: float64Pointer(35), BehindNextSec: float64Pointer(4), LapsBehindLeader: 1, InPits: true, PitState: 3},
		},
	}
}

func selfTestWheel(position string, pressurePSI, carcassTempC, wearRemaining float64) wheel {
	return wheel{
		Position: position, PressurePsi: pressurePSI, SurfaceTempC: [3]float64{90, 91, 92},
		CarcassTempC: carcassTempC, BrakeTempC: 420, WearRemaining: wearRemaining,
		RideHeightM: 0.061, SuspensionM: 0.02, RotationRadSec: 70,
	}
}
