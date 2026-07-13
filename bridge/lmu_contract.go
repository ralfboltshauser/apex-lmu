package main

// This file decodes the byte contract published in Studio 397's
// SharedMemoryInterface.hpp and InternalsPlugin.hpp. The Windows producer uses
// little-endian scalars and #pragma pack(push, 4); using explicit offsets keeps
// the wire layout independent from Go's native struct alignment.

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"unicode/utf8"
)

var errLMUPlayerHasNoVehicle = errors.New("LMU player does not currently have a vehicle")

const (
	lmuSharedMemoryName = "LMU_Data"
	// InternalsPlugin.hpp packs its payload structs to 4 bytes, while the outer
	// SharedMemoryInterface.hpp wrappers use the Windows default packing. That
	// gives ScoringData its 8-byte size_t alignment and leaves four bytes of
	// final tail padding in sizeof(SharedMemoryLayout).
	lmuSharedMemoryPayloadSize    = 324820
	lmuSharedMemoryAllocationSize = 324824
	lmuMaximumVehicles            = 104

	lmuScoringOffset        = 1632
	lmuScoringInfoSize      = 548
	lmuVehicleScoringBase   = lmuScoringOffset + lmuScoringInfoSize + 12 // 4-byte outer padding + 8-byte size_t
	lmuVehicleScoringSize   = 584
	lmuTelemetryOffset      = 128464
	lmuTelemetryArrayBase   = 128468
	lmuVehicleTelemetrySize = 1888
	lmuWheelOffset          = 848
	lmuWheelSize            = 260
)

const kilopascalToPSI = 0.14503773773020923

const (
	// LMU inherits rFactor's convention of putting timed/unlimited session
	// metadata near MaxInt32 in the maximum-laps field. For example, an
	// eight-hour-twenty-minute session is reported as MaxInt32 - 30000.
	// These values are not lap counts; EndSeconds remains the duration source.
	lmuTimedSessionMaximumLapsFloor int32 = 2_000_000_000
	lmuPlausibleMaximumLaps         int32 = 1_000_000
)

type decodedSnapshot struct {
	GameVersion              int32
	Session                  session
	Player                   vehicle
	Opponents                []opponent
	PlayerTelemetryAvailable bool
}

type packedView struct {
	data []byte
}

func (view packedView) slice(offset, size int) ([]byte, error) {
	if offset < 0 || size < 0 || offset > len(view.data)-size {
		return nil, fmt.Errorf("LMU field [%d:%d] is outside %d-byte snapshot", offset, offset+size, len(view.data))
	}
	return view.data[offset : offset+size], nil
}

func (view packedView) u8(offset int) (uint8, error) {
	value, err := view.slice(offset, 1)
	if err != nil {
		return 0, err
	}
	return value[0], nil
}

func (view packedView) boolean(offset int) (bool, error) {
	value, err := view.u8(offset)
	if err != nil {
		return false, err
	}
	if value > 1 {
		return false, fmt.Errorf("LMU bool at byte %d has invalid representation %d", offset, value)
	}
	return value == 1, nil
}

func (view packedView) i8(offset int) (int8, error) {
	value, err := view.u8(offset)
	return int8(value), err
}

func (view packedView) i16(offset int) (int16, error) {
	value, err := view.slice(offset, 2)
	if err != nil {
		return 0, err
	}
	return int16(binary.LittleEndian.Uint16(value)), nil
}

func (view packedView) i32(offset int) (int32, error) {
	value, err := view.slice(offset, 4)
	if err != nil {
		return 0, err
	}
	return int32(binary.LittleEndian.Uint32(value)), nil
}

func (view packedView) finite64(offset int, field string) (float64, error) {
	value, err := view.slice(offset, 8)
	if err != nil {
		return 0, err
	}
	decoded := math.Float64frombits(binary.LittleEndian.Uint64(value))
	if math.IsNaN(decoded) || math.IsInf(decoded, 0) || math.Abs(decoded) > 1e12 {
		return 0, fmt.Errorf("LMU %s at byte %d is not a finite, plausible number", field, offset)
	}
	return decoded, nil
}

func (view packedView) bounded64(offset int, field string, minimum, maximum float64) (float64, error) {
	value, err := view.finite64(offset, field)
	if err != nil {
		return 0, err
	}
	if value < minimum || value > maximum {
		return 0, fmt.Errorf("LMU %s at byte %d is %g; expected [%g, %g]", field, offset, value, minimum, maximum)
	}
	return value, nil
}

func (view packedView) worldPosition(offset int, field string) (*worldPositionM, error) {
	values := [3]float64{}
	for index := range values {
		value, err := view.bounded64(offset+index*8, fmt.Sprintf("%s axis %d", field, index), -1e7, 1e7)
		if err != nil {
			return nil, err
		}
		values[index] = value
	}
	return &worldPositionM{X: values[0], Y: values[1], Z: values[2]}, nil
}

func (view packedView) cString(offset, size int) (string, error) {
	value, err := view.slice(offset, size)
	if err != nil {
		return "", err
	}
	if end := bytes.IndexByte(value, 0); end >= 0 {
		value = value[:end]
	}
	text := strings.TrimSpace(string(value))
	if !utf8.ValidString(text) {
		text = strings.ToValidUTF8(text, "�")
	}
	return text, nil
}

func decodeSnapshot(data []byte) (*decodedSnapshot, error) {
	if len(data) < lmuSharedMemoryPayloadSize {
		return nil, fmt.Errorf("LMU shared-memory snapshot is %d bytes; contract requires %d", len(data), lmuSharedMemoryPayloadSize)
	}
	view := packedView{data: data[:lmuSharedMemoryPayloadSize]}
	gameVersion, err := view.i32(64)
	if err != nil {
		return nil, err
	}

	activeVehicles, err := view.u8(lmuTelemetryOffset)
	if err != nil {
		return nil, err
	}
	playerIndex, err := view.u8(lmuTelemetryOffset + 1)
	if err != nil {
		return nil, err
	}
	playerHasVehicle, err := view.boolean(lmuTelemetryOffset + 2)
	if err != nil {
		return nil, err
	}
	numScoringVehicles, err := view.i32(lmuScoringOffset + 104)
	if err != nil {
		return nil, err
	}
	if numScoringVehicles < 0 || numScoringVehicles > lmuMaximumVehicles {
		return nil, fmt.Errorf("LMU reports invalid scoring vehicle count %d", numScoringVehicles)
	}

	decodedSession, err := decodeSession(view)
	if err != nil {
		return nil, err
	}
	playerName, err := view.cString(lmuScoringOffset+116, 32)
	if err != nil {
		return nil, err
	}
	opponents := make([]opponent, 0, max(0, int(numScoringVehicles)-1))
	var playerScore *decodedVehicleScoring
	playerNameMatches := make([]decodedVehicleScoring, 0, 1)
	for index := 0; index < int(numScoringVehicles); index++ {
		score, decodeErr := decodeVehicleScoring(view, lmuVehicleScoringBase+index*lmuVehicleScoringSize)
		if decodeErr != nil {
			return nil, fmt.Errorf("decode scoring vehicle %d: %w", index, decodeErr)
		}
		if playerName != "" && strings.EqualFold(score.Driver, playerName) {
			playerNameMatches = append(playerNameMatches, score)
		}
		if score.IsPlayer {
			if playerScore == nil {
				copy := score
				playerScore = &copy
			}
			continue
		}
		opponents = append(opponents, score.Opponent)
	}
	// LMU can publish the selected car in scoring before it sets either the
	// per-row player flag or the telemetry playerHasVehicle flag. The scoring
	// header's player name is available in that gap and identifies the row.
	if playerScore == nil && len(playerNameMatches) == 1 {
		copy := playerNameMatches[0]
		playerScore = &copy
	}

	var decodedPlayer vehicle
	if playerHasVehicle {
		if activeVehicles > lmuMaximumVehicles {
			return nil, fmt.Errorf("LMU reports %d active telemetry vehicles; maximum is %d", activeVehicles, lmuMaximumVehicles)
		}
		if activeVehicles == 0 || playerIndex >= activeVehicles || playerIndex >= lmuMaximumVehicles {
			return nil, fmt.Errorf("LMU player telemetry index %d is outside active vehicle count %d", playerIndex, activeVehicles)
		}
		playerTelemetryOffset := lmuTelemetryArrayBase + int(playerIndex)*lmuVehicleTelemetrySize
		decodedPlayer, err = decodePlayerTelemetry(view, playerTelemetryOffset)
		if err != nil {
			return nil, err
		}
		// Some SDK builds do not reliably set IsPlayer in scoring once live
		// telemetry starts, so retain the ID correlation used by the full path.
		if playerScore == nil {
			for index := 0; index < int(numScoringVehicles); index++ {
				score, scoreErr := decodeVehicleScoring(view, lmuVehicleScoringBase+index*lmuVehicleScoringSize)
				if scoreErr != nil {
					return nil, scoreErr
				}
				if score.ID == decodedPlayer.ID {
					copy := score
					playerScore = &copy
					break
				}
			}
		}
	} else {
		if playerScore == nil {
			return nil, fmt.Errorf("%w: no scoring row is marked as the player; session player name %q matched %d of %d scoring vehicles", errLMUPlayerHasNoVehicle, playerName, len(playerNameMatches), numScoringVehicles)
		}
		// Garage and pre-race pit-lane snapshots still expose the selected car
		// through scoring, plus complete session/weather data. Emit those facts
		// without pretending that the per-wheel telemetry array is available.
		decodedPlayer = vehicle{ID: playerScore.ID, Lap: int32(playerScore.Opponent.Laps) + 1, Sector: 1}
	}
	if playerScore != nil {
		applyPlayerScoring(&decodedPlayer, *playerScore)
	}
	filteredOpponents := opponents[:0]
	for _, current := range opponents {
		if current.ID != decodedPlayer.ID {
			filteredOpponents = append(filteredOpponents, current)
		}
	}
	opponents = filteredOpponents
	sort.SliceStable(opponents, func(left, right int) bool {
		return opponents[left].Position < opponents[right].Position
	})

	return &decodedSnapshot{GameVersion: gameVersion, Session: decodedSession, Player: decodedPlayer, Opponents: opponents, PlayerTelemetryAvailable: playerHasVehicle}, nil
}

func decodeSession(view packedView) (session, error) {
	base := lmuScoringOffset
	track, err := view.cString(base, 64)
	if err != nil {
		return session{}, err
	}
	elapsed, err := view.bounded64(base+68, "session elapsed time", -1, 1e9)
	if err != nil {
		return session{}, err
	}
	end, err := view.bounded64(base+76, "session end time", -1, 1e9)
	if err != nil {
		return session{}, err
	}
	maximumLaps, err := view.i32(base + 84)
	if err != nil {
		return session{}, err
	}
	if maximumLaps >= lmuTimedSessionMaximumLapsFloor {
		maximumLaps = 0
	} else if maximumLaps < -1 || maximumLaps > lmuPlausibleMaximumLaps {
		return session{}, fmt.Errorf("LMU maximum lap count is invalid: %d", maximumLaps)
	} else if maximumLaps < 0 {
		maximumLaps = 0
	}
	trackLength, err := view.bounded64(base+88, "track length", 0, 1e7)
	if err != nil {
		return session{}, err
	}
	phase, err := view.u8(base + 108)
	if err != nil {
		return session{}, err
	}
	yellow, err := view.i8(base + 109)
	if err != nil {
		return session{}, err
	}
	inRealtime, err := view.boolean(base + 115)
	if err != nil {
		return session{}, err
	}
	rain, err := view.bounded64(base+220, "rain intensity", 0, 1)
	if err != nil {
		return session{}, err
	}
	airTemperature, err := view.bounded64(base+228, "ambient temperature", -200, 1000)
	if err != nil {
		return session{}, err
	}
	trackTemperature, err := view.bounded64(base+236, "track temperature", -200, 1000)
	if err != nil {
		return session{}, err
	}
	windX, err := view.bounded64(base+244, "wind X", -1000, 1000)
	if err != nil {
		return session{}, err
	}
	windY, err := view.bounded64(base+252, "wind Y", -1000, 1000)
	if err != nil {
		return session{}, err
	}
	windZ, err := view.bounded64(base+260, "wind Z", -1000, 1000)
	if err != nil {
		return session{}, err
	}
	wetness, err := view.bounded64(base+332, "average path wetness", 0, 1)
	if err != nil {
		return session{}, err
	}

	return session{
		Track: track, ElapsedSeconds: elapsed, EndSeconds: end, MaximumLaps: maximumLaps,
		TrackLengthM: trackLength, Phase: phase, InRealtime: inRealtime,
		AirTempC: airTemperature, TrackTempC: trackTemperature,
		Rain: clamp01(rain), Wetness: clamp01(wetness),
		WindSpeedMps: math.Sqrt(windX*windX + windY*windY + windZ*windZ), YellowState: yellow,
	}, nil
}

func decodePlayerTelemetry(view packedView, base int) (vehicle, error) {
	id, err := view.i32(base)
	if err != nil {
		return vehicle{}, err
	}
	lap, err := view.i32(base + 20)
	if err != nil {
		return vehicle{}, err
	}
	if lap < -1 || lap > 1_000_000 {
		return vehicle{}, fmt.Errorf("LMU lap number is invalid: %d", lap)
	}
	name, err := view.cString(base+32, 64)
	if err != nil {
		return vehicle{}, err
	}
	gameElapsed, err := view.bounded64(base+12, "vehicle elapsed time", -1, 1e9)
	if err != nil {
		return vehicle{}, err
	}
	lapStart, err := view.bounded64(base+24, "vehicle lap start time", -1, 1e9)
	if err != nil {
		return vehicle{}, err
	}
	worldPosition, err := view.worldPosition(base+160, "vehicle world position")
	if err != nil {
		return vehicle{}, err
	}
	velocity := [3]float64{}
	for index := range velocity {
		velocity[index], err = view.bounded64(base+184+index*8, fmt.Sprintf("local velocity %d", index), -2000, 2000)
		if err != nil {
			return vehicle{}, err
		}
	}
	gear, err := view.i32(base + 352)
	if err != nil {
		return vehicle{}, err
	}
	if gear < -1 || gear > 32 {
		return vehicle{}, fmt.Errorf("LMU gear is invalid: %d", gear)
	}
	rpm, err := view.bounded64(base+356, "engine RPM", 0, 100000)
	if err != nil {
		return vehicle{}, err
	}
	maximumRPM, err := view.bounded64(base+532, "maximum engine RPM", 0, 100000)
	if err != nil {
		return vehicle{}, err
	}
	throttle, err := view.bounded64(base+388, "throttle", 0, 1)
	if err != nil {
		return vehicle{}, err
	}
	brake, err := view.bounded64(base+396, "brake", 0, 1)
	if err != nil {
		return vehicle{}, err
	}
	steering, err := view.bounded64(base+404, "steering", -1, 1)
	if err != nil {
		return vehicle{}, err
	}
	clutch, err := view.bounded64(base+412, "clutch", 0, 1)
	if err != nil {
		return vehicle{}, err
	}
	fuel, err := view.bounded64(base+524, "fuel", 0, 100000)
	if err != nil {
		return vehicle{}, err
	}
	fuelCapacity, err := view.bounded64(base+608, "fuel capacity", 0, 100000)
	if err != nil {
		return vehicle{}, err
	}
	rearBrakeBias, err := view.bounded64(base+664, "rear brake bias", 0, 1)
	if err != nil {
		return vehicle{}, err
	}
	deltaBest, err := view.bounded64(base+696, "delta best", -1e6, 1e6)
	if err != nil {
		return vehicle{}, err
	}
	battery, err := view.bounded64(base+704, "battery charge fraction", 0, 1)
	if err != nil {
		return vehicle{}, err
	}
	sector, err := view.i32(base + 600)
	if err != nil {
		return vehicle{}, err
	}
	if uint32(sector)&0x7fffffff > 2 {
		return vehicle{}, fmt.Errorf("LMU current sector is invalid: %#x", uint32(sector))
	}
	frontCompoundName, err := view.cString(base+620, 18)
	if err != nil {
		return vehicle{}, err
	}
	rearCompoundName, err := view.cString(base+638, 18)
	if err != nil {
		return vehicle{}, err
	}
	frontIndex, err := view.u8(base + 606)
	if err != nil {
		return vehicle{}, err
	}
	rearIndex, err := view.u8(base + 607)
	if err != nil {
		return vehicle{}, err
	}

	result := vehicle{
		ID: id, Name: name, Lap: lap, Sector: normalizeSector(sector), WorldPositionM: worldPosition,
		GameElapsedSeconds: &gameElapsed, LapStartSeconds: &lapStart,
		SpeedKph: math.Sqrt(velocity[0]*velocity[0]+velocity[1]*velocity[1]+velocity[2]*velocity[2]) * 3.6,
		RPM:      rpm, MaximumRPM: maximumRPM, Gear: gear,
		Throttle: clamp01(throttle), Brake: clamp01(brake), Steering: clamp(steering, -1, 1), Clutch: clamp01(clutch),
		FuelL: fuel, FuelCapacityL: fuelCapacity, BatteryFraction: clamp01(battery), RearBrakeBias: clamp01(rearBrakeBias),
		DeltaBestSeconds: deltaBest, FrontCompound: compoundName(frontCompoundName, frontIndex), RearCompound: compoundName(rearCompoundName, rearIndex),
	}
	wheelNames := [4]string{"FL", "FR", "RL", "RR"}
	for index, wheelName := range wheelNames {
		decodedWheel, decodeErr := decodeWheel(view, base+lmuWheelOffset+index*lmuWheelSize, wheelName)
		if decodeErr != nil {
			return vehicle{}, fmt.Errorf("decode %s wheel: %w", wheelName, decodeErr)
		}
		result.Wheels[index] = decodedWheel
	}
	return result, nil
}

func decodeWheel(view packedView, base int, position string) (wheel, error) {
	read := func(relative int, field string, minimum, maximum float64) (float64, error) {
		return view.bounded64(base+relative, position+" "+field, minimum, maximum)
	}
	suspension, err := read(0, "suspension deflection", -10, 10)
	if err != nil {
		return wheel{}, err
	}
	rideHeight, err := read(8, "ride height", -10, 10)
	if err != nil {
		return wheel{}, err
	}
	brakeTemperature, err := read(24, "brake temperature", -200, 5000)
	if err != nil {
		return wheel{}, err
	}
	rotation, err := read(40, "rotation", -1e6, 1e6)
	if err != nil {
		return wheel{}, err
	}
	pressureKPa, err := read(120, "pressure", 0, 5000)
	if err != nil {
		return wheel{}, err
	}
	wear, err := read(152, "wear", 0, 1)
	if err != nil {
		return wheel{}, err
	}
	carcassKelvin, err := read(204, "carcass temperature", 0, 2000)
	if err != nil {
		return wheel{}, err
	}
	flat, err := view.boolean(base + 177)
	if err != nil {
		return wheel{}, err
	}
	detached, err := view.boolean(base + 178)
	if err != nil {
		return wheel{}, err
	}
	temperatures := [3]float64{}
	for index := range temperatures {
		kelvin, readErr := read(128+index*8, fmt.Sprintf("surface temperature %d", index), 0, 2000)
		if readErr != nil {
			return wheel{}, readErr
		}
		temperatures[index] = kelvinToCelsius(kelvin)
	}
	// The SDK publishes physical left/center/right samples. Apex's transport
	// contract is inner/center/outer, so left-side tyres must be mirrored.
	if position == "FL" || position == "RL" {
		temperatures[0], temperatures[2] = temperatures[2], temperatures[0]
	}
	return wheel{
		Position: position, PressurePsi: pressureKPa * kilopascalToPSI,
		SurfaceTempC: temperatures, CarcassTempC: kelvinToCelsius(carcassKelvin), BrakeTempC: brakeTemperature,
		WearRemaining: clamp01(1 - wear), RideHeightM: rideHeight, SuspensionM: suspension,
		RotationRadSec: rotation, Flat: flat, Detached: detached,
	}, nil
}

type decodedVehicleScoring struct {
	ID           int32
	IsPlayer     bool
	ControlOwner string
	PathLateralM float64
	TrackEdgeM   float64
	CountLapFlag uint8
	Opponent     opponent
	Driver       string
	Name         string
	Class        string
}

func decodeVehicleScoring(view packedView, base int) (decodedVehicleScoring, error) {
	id, err := view.i32(base)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	driver, err := view.cString(base+4, 32)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	name, err := view.cString(base+36, 64)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	laps, err := view.i16(base + 100)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	lapDistance, err := view.bounded64(base+104, "vehicle lap distance", -1, 1e8)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	pathLateral, err := view.bounded64(base+112, "vehicle path lateral", -1000, 1000)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	trackEdge, err := view.bounded64(base+120, "vehicle track edge", -1000, 1000)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	bestLap, err := view.bounded64(base+144, "vehicle best lap", -1, 1e7)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	lastLap, err := view.bounded64(base+168, "vehicle last lap", -1, 1e7)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	isPlayer, err := view.boolean(base + 196)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	control, err := view.i8(base + 197)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	inPits, err := view.boolean(base + 198)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	place, err := view.u8(base + 199)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	if place > lmuMaximumVehicles {
		return decodedVehicleScoring{}, fmt.Errorf("LMU vehicle place is invalid: %d", place)
	}
	class, err := view.cString(base+200, 32)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	behindNext, err := view.bounded64(base+232, "vehicle time behind next", -1, 1e7)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	lapsBehindNext, err := view.i32(base + 240)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	_ = lapsBehindNext // The public opponent contract does not currently expose it.
	behindLeader, err := view.bounded64(base+244, "vehicle time behind leader", -1, 1e7)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	lapsBehindLeader, err := view.i32(base + 252)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	worldPosition, err := view.worldPosition(base+264, "scoring world position")
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	pitState, err := view.u8(base + 457)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	countLapFlag, err := view.u8(base + 506)
	if err != nil {
		return decodedVehicleScoring{}, err
	}
	if countLapFlag > 2 {
		return decodedVehicleScoring{}, fmt.Errorf("LMU count-lap flag is invalid: %d", countLapFlag)
	}

	return decodedVehicleScoring{
		ID: id, IsPlayer: isPlayer, ControlOwner: controlOwner(control), PathLateralM: pathLateral, TrackEdgeM: trackEdge, CountLapFlag: countLapFlag, Driver: driver, Name: name, Class: class,
		Opponent: opponent{
			ID: id, Driver: driver, Name: name, Class: class, Position: place, Laps: laps,
			LapDistanceM: lapDistance, WorldPositionM: worldPosition, BestLapSeconds: bestLap, LastLapSeconds: lastLap,
			BehindLeaderSec: behindLeader, BehindNextSec: behindNext,
			LapsBehindLeader: lapsBehindLeader, InPits: inPits, PitState: pitState,
		},
	}, nil
}

func applyPlayerScoring(player *vehicle, score decodedVehicleScoring) {
	player.Driver = score.Driver
	player.Name = firstNonempty(score.Name, player.Name)
	player.Class = score.Class
	player.ControlOwner = score.ControlOwner
	player.Position = score.Opponent.Position
	player.LapDistanceM = score.Opponent.LapDistanceM
	player.PathLateralM = score.PathLateralM
	player.TrackEdgeM = score.TrackEdgeM
	player.CountLapFlag = score.CountLapFlag
	player.BestLapSeconds = score.Opponent.BestLapSeconds
	player.LastLapSeconds = score.Opponent.LastLapSeconds
	player.TimeBehindLeaderSec = score.Opponent.BehindLeaderSec
	player.TimeBehindNextSec = score.Opponent.BehindNextSec
	player.InPits = score.Opponent.InPits
	player.PitState = score.Opponent.PitState
	if player.WorldPositionM == nil {
		player.WorldPositionM = score.Opponent.WorldPositionM
	}
}

func controlOwner(value int8) string {
	// VehicleScoringInfoV01::mControl is a signed byte in the SDK contract:
	// -1 nobody, 0 local player, 1 local AI, 2 remote, 3 replay.
	switch value {
	case 0:
		return "local-player"
	case 1:
		return "ai"
	case 2:
		return "remote"
	case 3:
		return "replay"
	default:
		return "unknown"
	}
}

func firstNonempty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func compoundName(name string, index uint8) string {
	if name != "" {
		return name
	}
	return fmt.Sprintf("Compound %d", index)
}

func normalizeSector(value int32) int32 {
	// The high bit marks pit lane; the remaining value is zero-based.
	sector := int32(uint32(value) & 0x7fffffff)
	if sector < 0 || sector > 2 {
		return 1
	}
	return sector + 1
}

func kelvinToCelsius(value float64) float64 {
	if value == 0 {
		return 0
	}
	return value - 273.15
}

func clamp01(value float64) float64 {
	return clamp(value, 0, 1)
}

func clamp(value, minimum, maximum float64) float64 {
	return math.Max(minimum, math.Min(maximum, value))
}
