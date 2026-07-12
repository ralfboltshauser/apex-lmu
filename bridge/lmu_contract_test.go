package main

import (
	"encoding/binary"
	"errors"
	"math"
	"testing"
)

func TestDecodeSnapshotReadsPackedLMUContract(t *testing.T) {
	raw := makeContractFixture()

	decoded, err := decodeSnapshot(raw)
	if err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	if decoded.GameVersion != 130 || decoded.Session.Track != "Circuit de la Sarthe" || decoded.Session.ElapsedSeconds != 901.25 {
		t.Fatalf("unexpected session: %#v", decoded.Session)
	}
	if decoded.Player.ControlOwner != "local-player" {
		t.Fatalf("control owner = %q", decoded.Player.ControlOwner)
	}
	if decoded.Session.Rain != 0.2 || decoded.Session.Wetness != 0.35 || decoded.Session.WindSpeedMps != 5 {
		t.Fatalf("weather offsets decoded incorrectly: %#v", decoded.Session)
	}
	if decoded.Player.ID != 42 || decoded.Player.Driver != "Apex Driver" || decoded.Player.Class != "Hypercar" {
		t.Fatalf("player correlation failed: %#v", decoded.Player)
	}
	if decoded.Player.Name != "Porsche 963" || decoded.Player.Sector != 3 || decoded.Player.SpeedKph != 180 {
		t.Fatalf("telemetry offsets decoded incorrectly: %#v", decoded.Player)
	}
	if decoded.Player.WorldPositionM == nil || *decoded.Player.WorldPositionM != (worldPositionM{X: 1200, Y: 4.5, Z: -800}) {
		t.Fatalf("player world-position offsets decoded incorrectly: %#v", decoded.Player.WorldPositionM)
	}
	if decoded.Player.GameElapsedSeconds == nil || *decoded.Player.GameElapsedSeconds != 901.25 || decoded.Player.LapStartSeconds == nil || *decoded.Player.LapStartSeconds != 695.15 {
		t.Fatalf("player time offsets decoded incorrectly: elapsed=%v lapStart=%v", decoded.Player.GameElapsedSeconds, decoded.Player.LapStartSeconds)
	}
	if decoded.Player.FrontCompound != "Medium" || decoded.Player.RearCompound != "Soft" {
		t.Fatalf("compound strings decoded incorrectly: %q/%q", decoded.Player.FrontCompound, decoded.Player.RearCompound)
	}
	if got := decoded.Player.Wheels[0].PressurePsi; math.Abs(got-24.00374559434963) > 1e-12 {
		t.Fatalf("pressure conversion = %.15f", got)
	}
	if got := decoded.Player.Wheels[0].SurfaceTempC; math.Abs(got[0]-82) > 1e-12 || math.Abs(got[2]-80) > 1e-12 {
		t.Fatalf("wheel temperature offsets decoded incorrectly: %v", got)
	}
	if got := decoded.Player.Wheels[1].SurfaceTempC; math.Abs(got[0]-80) > 1e-12 || math.Abs(got[2]-82) > 1e-12 {
		t.Fatalf("right-side tyre temperatures should retain left/right order: %v", got)
	}
	if decoded.Player.Wheels[0].Flat || !decoded.Player.Wheels[0].Detached {
		t.Fatalf("packed bool offsets decoded incorrectly: %#v", decoded.Player.Wheels[0])
	}
	if len(decoded.Opponents) != 2 || decoded.Opponents[0].Position != 1 || decoded.Opponents[1].Position != 3 {
		t.Fatalf("opponents were not sorted: %#v", decoded.Opponents)
	}
	if decoded.Opponents[0].WorldPositionM == nil || decoded.Opponents[0].WorldPositionM.X != 1000 {
		t.Fatalf("opponent scoring position was not decoded: %#v", decoded.Opponents[0].WorldPositionM)
	}
}

func TestControlOwnerMapsEveryDocumentedSDKValue(t *testing.T) {
	cases := []struct {
		value int8
		want  string
	}{
		{-1, "unknown"},
		{0, "local-player"},
		{1, "ai"},
		{2, "remote"},
		{3, "replay"},
		{4, "unknown"},
	}
	for _, tc := range cases {
		if got := controlOwner(tc.value); got != tc.want {
			t.Fatalf("controlOwner(%d) = %q, want %q", tc.value, got, tc.want)
		}
	}
}

func TestDecodeSnapshotKeepsSessionAndSelectedCarBeforeVehicleTelemetry(t *testing.T) {
	raw := makeContractFixture()
	raw[lmuTelemetryOffset] = 0
	raw[lmuTelemetryOffset+1] = 0
	raw[lmuTelemetryOffset+2] = 0

	decoded, err := decodeSnapshot(raw)
	if err != nil {
		t.Fatalf("decode pre-race snapshot: %v", err)
	}
	if decoded.PlayerTelemetryAvailable {
		t.Fatal("pre-race snapshot must not claim per-vehicle telemetry")
	}
	if decoded.Player.ID != 42 || decoded.Player.Name != "Porsche 963" || decoded.Player.Driver != "Apex Driver" {
		t.Fatalf("selected car was not recovered from scoring: %#v", decoded.Player)
	}
	if decoded.Session.Track != "Circuit de la Sarthe" || decoded.Session.TrackTempC != 24.25 || decoded.Session.AirTempC != 19.5 {
		t.Fatalf("session environment was lost: %#v", decoded.Session)
	}
	if len(decoded.Opponents) != 2 {
		t.Fatalf("player must not be duplicated in standings: %#v", decoded.Opponents)
	}
}

func TestDecodeSnapshotMatchesSessionPlayerNameBeforeVehicleTelemetry(t *testing.T) {
	raw := makeContractFixture()
	raw[lmuTelemetryOffset] = 0
	raw[lmuTelemetryOffset+1] = 0
	raw[lmuTelemetryOffset+2] = 0
	raw[lmuVehicleScoringBase+lmuVehicleScoringSize+196] = 0

	decoded, err := decodeSnapshot(raw)
	if err != nil {
		t.Fatalf("decode pre-race snapshot without player flag: %v", err)
	}
	if decoded.PlayerTelemetryAvailable {
		t.Fatal("player-name correlation must not claim per-vehicle telemetry")
	}
	if decoded.Player.ID != 42 || decoded.Player.Name != "Porsche 963" || decoded.Player.Driver != "Apex Driver" {
		t.Fatalf("selected car was not correlated by session player name: %#v", decoded.Player)
	}
	if len(decoded.Opponents) != 2 {
		t.Fatalf("matched player must not be duplicated in standings: %#v", decoded.Opponents)
	}
}

func TestDecodeSnapshotWaitsWhenNeitherTelemetryNorSelectedCarExists(t *testing.T) {
	raw := makeContractFixture()
	raw[lmuTelemetryOffset] = 0
	raw[lmuTelemetryOffset+1] = 0
	raw[lmuTelemetryOffset+2] = 0
	raw[lmuVehicleScoringBase+196] = 0
	raw[lmuVehicleScoringBase+lmuVehicleScoringSize+196] = 0
	raw[lmuVehicleScoringBase+2*lmuVehicleScoringSize+196] = 0
	clear(raw[lmuScoringOffset+116 : lmuScoringOffset+148])

	if _, err := decodeSnapshot(raw); !errors.Is(err, errLMUPlayerHasNoVehicle) {
		t.Fatalf("expected no-vehicle sentinel, got %v", err)
	}
}

func TestDecodeSnapshotDoesNotGuessWhenSessionPlayerNameIsAmbiguous(t *testing.T) {
	raw := makeContractFixture()
	raw[lmuTelemetryOffset] = 0
	raw[lmuTelemetryOffset+1] = 0
	raw[lmuTelemetryOffset+2] = 0
	raw[lmuVehicleScoringBase+lmuVehicleScoringSize+196] = 0
	clear(raw[lmuVehicleScoringBase+2*lmuVehicleScoringSize+4 : lmuVehicleScoringBase+2*lmuVehicleScoringSize+36])
	putText(raw, lmuVehicleScoringBase+2*lmuVehicleScoringSize+4, 32, "Apex Driver")

	if _, err := decodeSnapshot(raw); !errors.Is(err, errLMUPlayerHasNoVehicle) {
		t.Fatalf("ambiguous player name must remain unresolved, got %v", err)
	}
}

func TestDecodeSnapshotRejectsTruncationCountsAndNonFiniteData(t *testing.T) {
	if _, err := decodeSnapshot(make([]byte, lmuSharedMemoryPayloadSize-1)); err == nil {
		t.Fatal("expected truncated snapshot rejection")
	}

	raw := makeContractFixture()
	raw[lmuTelemetryOffset] = lmuMaximumVehicles + 1
	if _, err := decodeSnapshot(raw); err == nil {
		t.Fatal("expected invalid active vehicle count rejection")
	}

	raw = makeContractFixture()
	putF64(raw, lmuScoringOffset+220, math.NaN())
	if _, err := decodeSnapshot(raw); err == nil {
		t.Fatal("expected NaN rejection")
	}

	raw = makeContractFixture()
	raw[lmuTelemetryOffset+2] = 2
	if _, err := decodeSnapshot(raw); err == nil {
		t.Fatal("expected invalid C++ bool representation rejection")
	}

	raw = makeContractFixture()
	player := lmuTelemetryArrayBase + lmuVehicleTelemetrySize
	putF64(raw, player+388, 1.01)
	if _, err := decodeSnapshot(raw); err == nil {
		t.Fatal("expected out-of-contract throttle rejection")
	}

	raw = makeContractFixture()
	putF64(raw, player+160, math.NaN())
	if _, err := decodeSnapshot(raw); err == nil {
		t.Fatal("expected non-finite world-position rejection")
	}
}

func TestDecodeSnapshotReportsButDoesNotRejectUnknownGameVersion(t *testing.T) {
	raw := makeContractFixture()
	putI32(raw, 64, 987654)
	decoded, err := decodeSnapshot(raw)
	if err != nil {
		t.Fatalf("unknown game version should remain observable: %v", err)
	}
	if decoded.GameVersion != 987654 {
		t.Fatalf("game version = %d", decoded.GameVersion)
	}
}

func TestDecodeSnapshotNormalizesTimedSessionMaximumLapsSentinel(t *testing.T) {
	raw := makeContractFixture()
	putI32(raw, lmuScoringOffset+84, math.MaxInt32-30000)

	decoded, err := decodeSnapshot(raw)
	if err != nil {
		t.Fatalf("timed-session sentinel should not reject the snapshot: %v", err)
	}
	if decoded.Session.MaximumLaps != 0 {
		t.Fatalf("maximum laps = %d, want 0 for a timed session", decoded.Session.MaximumLaps)
	}
	if decoded.Session.EndSeconds != 21600 {
		t.Fatalf("end seconds = %g; timed-session duration was lost", decoded.Session.EndSeconds)
	}
}

func TestDecodeSnapshotStillRejectsImplausibleMaximumLaps(t *testing.T) {
	raw := makeContractFixture()
	putI32(raw, lmuScoringOffset+84, lmuPlausibleMaximumLaps+1)

	if _, err := decodeSnapshot(raw); err == nil {
		t.Fatal("expected non-sentinel implausible maximum laps to be rejected")
	}
}

func TestNormalizeSectorRemovesPitBitAndConvertsToOneBased(t *testing.T) {
	for raw, want := range map[int32]int32{0: 1, 1: 2, 2: 3, -2147483646: 3, 8: 1} {
		if got := normalizeSector(raw); got != want {
			t.Errorf("normalizeSector(%d) = %d, want %d", raw, got, want)
		}
	}
}

func TestContractDistinguishesPayloadFromCXXTailPadding(t *testing.T) {
	if lmuSharedMemoryPayloadSize != 324820 || lmuSharedMemoryAllocationSize != 324824 {
		t.Fatalf("unexpected payload/allocation sizes: %d/%d", lmuSharedMemoryPayloadSize, lmuSharedMemoryAllocationSize)
	}
	if lmuVehicleScoringBase != 2192 || lmuTelemetryOffset != 128464 {
		t.Fatalf("unexpected packed section offsets: %d/%d", lmuVehicleScoringBase, lmuTelemetryOffset)
	}
}

func makeContractFixture() []byte {
	raw := make([]byte, lmuSharedMemoryPayloadSize)
	putI32(raw, 64, 130)
	raw[lmuTelemetryOffset] = 3
	raw[lmuTelemetryOffset+1] = 1
	raw[lmuTelemetryOffset+2] = 1

	putText(raw, lmuScoringOffset, 64, "Circuit de la Sarthe")
	putF64(raw, lmuScoringOffset+68, 901.25)
	putF64(raw, lmuScoringOffset+76, 21600)
	putI32(raw, lmuScoringOffset+84, 62)
	putF64(raw, lmuScoringOffset+88, 13626)
	putI32(raw, lmuScoringOffset+104, 3)
	raw[lmuScoringOffset+108] = 5
	raw[lmuScoringOffset+109] = 0xff
	raw[lmuScoringOffset+115] = 1
	putText(raw, lmuScoringOffset+116, 32, "Apex Driver")
	putF64(raw, lmuScoringOffset+220, 0.2)
	putF64(raw, lmuScoringOffset+228, 19.5)
	putF64(raw, lmuScoringOffset+236, 24.25)
	putF64(raw, lmuScoringOffset+244, 3)
	putF64(raw, lmuScoringOffset+252, 4)
	putF64(raw, lmuScoringOffset+260, 0)
	putF64(raw, lmuScoringOffset+332, 0.35)

	putScoringVehicle(raw, 0, 7, "Leader", "Ferrari 499P", "Hypercar", 1, false)
	putScoringVehicle(raw, 1, 42, "Apex Driver", "Porsche 963", "Hypercar", 2, true)
	putScoringVehicle(raw, 2, 90, "LMP Driver", "Oreca 07", "LMP2", 3, false)

	player := lmuTelemetryArrayBase + lmuVehicleTelemetrySize
	putI32(raw, player, 42)
	putF64(raw, player+12, 901.25)
	putI32(raw, player+20, 8)
	putF64(raw, player+24, 695.15)
	putText(raw, player+32, 64, "Porsche 963")
	putF64(raw, player+160, 1200)
	putF64(raw, player+168, 4.5)
	putF64(raw, player+176, -800)
	putF64(raw, player+184, 30)
	putF64(raw, player+192, 0)
	putF64(raw, player+200, 40)
	putI32(raw, player+352, 6)
	putF64(raw, player+356, 8200)
	putF64(raw, player+388, 0.8)
	putF64(raw, player+396, 0.1)
	putF64(raw, player+404, -0.15)
	putF64(raw, player+412, 0)
	putF64(raw, player+524, 45.5)
	putF64(raw, player+532, 9000)
	putI32(raw, player+600, 2)
	raw[player+606] = 6
	raw[player+607] = 9
	putF64(raw, player+608, 90)
	putText(raw, player+620, 18, "Medium")
	putText(raw, player+638, 18, "Soft")
	putF64(raw, player+664, 0.47)
	putF64(raw, player+696, -0.125)
	putF64(raw, player+704, 0.64)
	for index := 0; index < 4; index++ {
		wheel := player + lmuWheelOffset + index*lmuWheelSize
		putF64(raw, wheel, 0.02+float64(index)/1000)
		putF64(raw, wheel+8, 0.06)
		putF64(raw, wheel+24, 525)
		putF64(raw, wheel+40, 180)
		putF64(raw, wheel+120, 165.5)
		putF64(raw, wheel+128, 353.15)
		putF64(raw, wheel+136, 354.15)
		putF64(raw, wheel+144, 355.15)
		putF64(raw, wheel+152, 0.13)
		putF64(raw, wheel+204, 350.15)
	}
	raw[player+lmuWheelOffset+178] = 1
	return raw
}

func putScoringVehicle(raw []byte, index int, id int32, driver, name, class string, place byte, player bool) {
	base := lmuVehicleScoringBase + index*lmuVehicleScoringSize
	putI32(raw, base, id)
	putText(raw, base+4, 32, driver)
	putText(raw, base+36, 64, name)
	putI16(raw, base+100, int16(7-index))
	putF64(raw, base+104, 5000+float64(index)*100)
	putF64(raw, base+144, 205+float64(index))
	putF64(raw, base+168, 206+float64(index))
	if player {
		raw[base+196] = 1
	}
	raw[base+199] = place
	putText(raw, base+200, 32, class)
	putF64(raw, base+232, float64(index)*1.5)
	putI32(raw, base+240, 0)
	putF64(raw, base+244, float64(index)*3.5)
	putI32(raw, base+252, 0)
	putF64(raw, base+264, 1000+float64(index)*100)
	putF64(raw, base+272, 5+float64(index))
	putF64(raw, base+280, -900+float64(index)*50)
}

func putText(data []byte, offset, size int, value string) {
	copy(data[offset:offset+size], value)
}

func putI16(data []byte, offset int, value int16) {
	binary.LittleEndian.PutUint16(data[offset:offset+2], uint16(value))
}

func putI32(data []byte, offset int, value int32) {
	binary.LittleEndian.PutUint32(data[offset:offset+4], uint32(value))
}

func putF64(data []byte, offset int, value float64) {
	binary.LittleEndian.PutUint64(data[offset:offset+8], math.Float64bits(value))
}
