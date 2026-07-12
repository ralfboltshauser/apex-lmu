// Package lmutestfixture implements a deterministic, test-only producer for
// the LMU shared-memory byte contract. It is not imported by release code.
package lmutestfixture

import (
	"encoding/binary"
	"fmt"
	"math"
)

const (
	MappingName   = "LMU_Data"
	DataEventName = "LMU_Data_Event"
	LockDataName  = "LMU_SharedMemoryLockData"
	LockEventName = "LMU_SharedMemoryLockEvent"

	// PayloadSize is the interpreted byte prefix. AllocationSize includes the
	// x64 C++ outer-structure tail padding used by the SDK producer.
	PayloadSize    = 324820
	AllocationSize = 324824

	scoringOffset   = 1632
	vehicleOffset   = 2192
	vehicleStride   = 584
	telemetryOffset = 128464
)

// Populate overwrites a complete mapping with a deterministic multiclass
// session. elapsedSeconds and sequence make periodic producer updates visible.
func Populate(raw []byte, elapsedSeconds float64, sequence uint64) error {
	if len(raw) < AllocationSize {
		return fmt.Errorf("fixture mapping is %d bytes; need %d", len(raw), AllocationSize)
	}
	clear(raw)
	putInt32(raw, 40, 1) // SME_UPDATE_SCORING
	putInt32(raw, 44, 1) // SME_UPDATE_TELEMETRY
	putInt32(raw, 64, 130)

	scoring := scoringOffset
	putCString(raw, scoring+0, 64, "Circuit de la Sarthe")
	putInt32(raw, scoring+64, 10)
	putFloat64(raw, scoring+68, elapsedSeconds)
	putFloat64(raw, scoring+76, 7200)
	putInt32(raw, scoring+84, 0)
	putFloat64(raw, scoring+88, 13626)
	putInt32(raw, scoring+104, 2)
	raw[scoring+108] = 5
	raw[scoring+109] = 2
	raw[scoring+115] = 1
	putFloat64(raw, scoring+220, 0.25)
	putFloat64(raw, scoring+228, 18.5)
	putFloat64(raw, scoring+236, 27.75)
	putFloat64(raw, scoring+244, 3)
	putFloat64(raw, scoring+252, 4)
	putFloat64(raw, scoring+260, 0)
	putFloat64(raw, scoring+332, 0.12)

	progress := float64(sequence%1000) * 0.5
	populateVehicleScoring(raw, vehicleOffset, 6, "Fixture Driver", "Porsche 963", "Hypercar", 3, true, 6813+progress)
	populateVehicleScoring(raw, vehicleOffset+vehicleStride, 51, "Fixture Leader", "Ferrari 499P", "Hypercar", 1, false, 7000+progress)

	telemetry := telemetryOffset
	raw[telemetry+0] = 1
	raw[telemetry+1] = 0
	raw[telemetry+2] = 1
	player := telemetry + 4
	putInt32(raw, player+0, 6)
	putFloat64(raw, player+4, 0.02)
	putFloat64(raw, player+12, elapsedSeconds)
	putInt32(raw, player+20, 8)
	putFloat64(raw, player+24, elapsedSeconds-206.15)
	putCString(raw, player+32, 64, "Porsche 963")
	putCString(raw, player+96, 64, "Circuit de la Sarthe")
	putFloat64(raw, player+184, 0)
	putFloat64(raw, player+192, 0)
	putFloat64(raw, player+200, 75.3888888889)
	putInt32(raw, player+352, 6)
	putFloat64(raw, player+356, 8021+float64(sequence%20))
	putFloat64(raw, player+388, 0.92)
	putFloat64(raw, player+396, 0.10)
	putFloat64(raw, player+404, -0.08)
	putFloat64(raw, player+412, 0)
	putFloat64(raw, player+524, 48.2-progress/1000)
	putFloat64(raw, player+532, 9000)
	putInt32(raw, player+600, 2)
	raw[player+606] = 0
	raw[player+607] = 0
	putFloat64(raw, player+608, 90)
	putCString(raw, player+620, 18, "Medium")
	putCString(raw, player+638, 18, "Medium")
	putFloat64(raw, player+664, 0.47)
	putFloat64(raw, player+696, 0.12)
	putFloat64(raw, player+704, 0.64)

	for wheelIndex := 0; wheelIndex < 4; wheelIndex++ {
		wheel := player + 848 + wheelIndex*260
		putFloat64(raw, wheel+0, 0.02)
		putFloat64(raw, wheel+8, 0.061)
		putFloat64(raw, wheel+24, 420+float64(wheelIndex))
		putFloat64(raw, wheel+40, 70)
		putFloat64(raw, wheel+120, 165.474)
		putFloat64(raw, wheel+128, 363.15)
		putFloat64(raw, wheel+136, 364.15)
		putFloat64(raw, wheel+144, 365.15)
		putFloat64(raw, wheel+152, 0.13+float64(wheelIndex)*0.01)
		raw[wheel+177] = 0
		raw[wheel+178] = 0
		putFloat64(raw, wheel+204, 361.15+float64(wheelIndex))
	}
	return nil
}

func populateVehicleScoring(raw []byte, offset int, id int32, driver, name, class string, place byte, isPlayer bool, lapDistance float64) {
	putInt32(raw, offset+0, id)
	putCString(raw, offset+4, 32, driver)
	putCString(raw, offset+36, 64, name)
	putInt16(raw, offset+100, 8)
	raw[offset+102] = 2
	putFloat64(raw, offset+104, lapDistance)
	putFloat64(raw, offset+144, 205.2)
	putFloat64(raw, offset+168, 206.1)
	if isPlayer {
		raw[offset+196] = 1
	}
	raw[offset+198] = 0
	raw[offset+199] = place
	putCString(raw, offset+200, 32, class)
	putFloat64(raw, offset+232, 2.8)
	putInt32(raw, offset+240, 0)
	putFloat64(raw, offset+244, 6.1)
	putInt32(raw, offset+252, 0)
	raw[offset+457] = 0
}

func putCString(raw []byte, offset, capacity int, value string) {
	if len(value) >= capacity {
		panic("fixture C string does not fit")
	}
	copy(raw[offset:offset+capacity], value)
}

func putInt16(raw []byte, offset int, value int16) {
	binary.LittleEndian.PutUint16(raw[offset:offset+2], uint16(value))
}

func putInt32(raw []byte, offset int, value int32) {
	binary.LittleEndian.PutUint32(raw[offset:offset+4], uint32(value))
}

func putFloat64(raw []byte, offset int, value float64) {
	binary.LittleEndian.PutUint64(raw[offset:offset+8], math.Float64bits(value))
}
