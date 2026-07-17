package main

import (
	"errors"
	"testing"
	"time"
)

func TestDecodeIssueTrackerDistinguishesTransientStaleWaitingAndRecovery(t *testing.T) {
	var tracker decodeIssueTracker
	bad := errors.New("bad snapshot")
	if got := tracker.classify(5*time.Second, bad); got != "invalid-data" {
		t.Fatalf("first issue = %q", got)
	}
	if got := tracker.classify(5*time.Second+999*time.Millisecond, bad); got != "invalid-data" {
		t.Fatalf("sub-second issue = %q", got)
	}
	if got := tracker.classify(6*time.Second, bad); got != "stale-data" {
		t.Fatalf("persistent issue = %q", got)
	}
	if got := tracker.classify(7*time.Second, nil); got != "" {
		t.Fatalf("recovery = %q", got)
	}
	if got := tracker.classify(8*time.Second, errLMUPlayerHasNoVehicle); got != "waiting-for-vehicle" {
		t.Fatalf("waiting = %q", got)
	}
	if got := tracker.classify(9*time.Second, bad); got != "invalid-data" {
		t.Fatalf("issue after waiting = %q", got)
	}
}
