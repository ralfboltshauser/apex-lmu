package main

import "encoding/json"

const (
	protocolVersion   = 1
	liveSource        = "lmu-shared-memory"
	selfTestSource    = "self-test"
	selfTestFixtureID = "bridge-contract-v1"
)

type message struct {
	ProtocolVersion int        `json:"protocolVersion"`
	Source          string     `json:"source"`
	RunID           string     `json:"runId,omitempty"`
	Fixture         string     `json:"fixture,omitempty"`
	Type            string     `json:"type"`
	State           string     `json:"state,omitempty"`
	Message         string     `json:"message,omitempty"`
	Frames          int        `json:"frames,omitempty"`
	GameVersion     int32      `json:"gameVersion,omitempty"`
	CapturedAt      string     `json:"capturedAt,omitempty"`
	Sequence        uint64     `json:"sequence,omitempty"`
	Session         *session   `json:"session,omitempty"`
	Player          *vehicle   `json:"player,omitempty"`
	Opponents       []opponent `json:"opponents,omitempty"`
}

type session struct {
	Track          string  `json:"track"`
	Layout         string  `json:"layout,omitempty"`
	ElapsedSeconds float64 `json:"elapsedSeconds"`
	EndSeconds     float64 `json:"endSeconds"`
	MaximumLaps    int32   `json:"maximumLaps"`
	TrackLengthM   float64 `json:"trackLengthM"`
	Phase          uint8   `json:"phase"`
	InRealtime     bool    `json:"inRealtime"`
	AirTempC       float64 `json:"airTempC"`
	TrackTempC     float64 `json:"trackTempC"`
	Rain           float64 `json:"rain"`
	Wetness        float64 `json:"wetness"`
	WindSpeedMps   float64 `json:"windSpeedMps"`
	YellowState    int8    `json:"yellowState"`
}

type wheel struct {
	Position       string     `json:"position"`
	PressurePsi    float64    `json:"pressurePsi"`
	SurfaceTempC   [3]float64 `json:"surfaceTempC"` // inner, center, outer
	CarcassTempC   float64    `json:"carcassTempC"`
	BrakeTempC     float64    `json:"brakeTempC"`
	WearRemaining  float64    `json:"wearRemaining"`
	RideHeightM    float64    `json:"rideHeightM"`
	SuspensionM    float64    `json:"suspensionM"`
	RotationRadSec float64    `json:"rotationRadSec"`
	Flat           bool       `json:"flat"`
	Detached       bool       `json:"detached"`
}

type vehicle struct {
	ID                  int32    `json:"id"`
	Driver              string   `json:"driver"`
	Name                string   `json:"name"`
	Class               string   `json:"class"`
	Position            uint8    `json:"position"`
	Lap                 int32    `json:"lap"`
	Sector              int32    `json:"sector"`
	LapDistanceM        float64  `json:"lapDistanceM"`
	SpeedKph            float64  `json:"speedKph"`
	RPM                 float64  `json:"rpm"`
	MaximumRPM          float64  `json:"maximumRpm"`
	Gear                int32    `json:"gear"`
	Throttle            float64  `json:"throttle"`
	Brake               float64  `json:"brake"`
	Steering            float64  `json:"steering"`
	Clutch              float64  `json:"clutch"`
	FuelL               float64  `json:"fuelL"`
	FuelCapacityL       float64  `json:"fuelCapacityL"`
	BatteryFraction     float64  `json:"batteryFraction"`
	RearBrakeBias       float64  `json:"rearBrakeBias"`
	DeltaBestSeconds    float64  `json:"deltaBestSeconds"`
	BestLapSeconds      float64  `json:"bestLapSeconds"`
	LastLapSeconds      float64  `json:"lastLapSeconds"`
	TimeBehindLeaderSec float64  `json:"timeBehindLeaderSeconds"`
	TimeBehindNextSec   float64  `json:"timeBehindNextSeconds"`
	InPits              bool     `json:"inPits"`
	PitState            uint8    `json:"pitState"`
	FrontCompound       string   `json:"frontCompound"`
	RearCompound        string   `json:"rearCompound"`
	Wheels              [4]wheel `json:"wheels"`
}

type opponent struct {
	ID               int32   `json:"id"`
	Driver           string  `json:"driver"`
	Name             string  `json:"name"`
	Class            string  `json:"class"`
	Position         uint8   `json:"position"`
	Laps             int16   `json:"laps"`
	LapDistanceM     float64 `json:"lapDistanceM"`
	BestLapSeconds   float64 `json:"bestLapSeconds"`
	LastLapSeconds   float64 `json:"lastLapSeconds"`
	BehindLeaderSec  float64 `json:"behindLeaderSeconds"`
	BehindNextSec    float64 `json:"behindNextSeconds"`
	LapsBehindLeader int32   `json:"lapsBehindLeader"`
	InPits           bool    `json:"inPits"`
	PitState         uint8   `json:"pitState"`
}

func emit(encoder *json.Encoder, value message) error {
	if value.ProtocolVersion == 0 {
		value.ProtocolVersion = protocolVersion
	}
	if value.Source == "" {
		value.Source = liveSource
	}
	return encoder.Encode(value)
}
