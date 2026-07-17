package main

import (
	"errors"
	"time"
)

const dataStaleAfter = time.Second

// decodeIssueTracker separates a transient bad snapshot from a stale stream.
// The distinction is based on source time so accelerated replay behaves exactly
// like the recorded live session instead of depending on replay wall-clock time.
type decodeIssueTracker struct {
	invalidSince time.Duration
	hasInvalid   bool
}

func (tracker *decodeIssueTracker) classify(sourceElapsed time.Duration, err error) string {
	if err == nil {
		tracker.reset()
		return ""
	}
	if errors.Is(err, errLMUPlayerHasNoVehicle) {
		tracker.reset()
		return "waiting-for-vehicle"
	}
	if !tracker.hasInvalid || sourceElapsed < tracker.invalidSince {
		tracker.invalidSince = sourceElapsed
		tracker.hasInvalid = true
	}
	if sourceElapsed-tracker.invalidSince >= dataStaleAfter {
		return "stale-data"
	}
	return "invalid-data"
}

func (tracker *decodeIssueTracker) reset() {
	tracker.invalidSince = 0
	tracker.hasInvalid = false
}
