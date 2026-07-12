//go:build windows

// lmu-fixture is a disposable test producer for an isolated Windows VM. Build
// it as "Le Mans Ultimate.exe" so the bridge's producer-process liveness check
// exercises the same executable-name path as the game. It is never packaged.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"time"

	"github.com/ralfboltshauser/apex-lmu/bridge/internal/lmutestfixture"
)

const (
	minimumDuration = time.Second
	maximumDuration = 5 * time.Minute
	minimumHz       = 1
	maximumHz       = 100
)

type status struct {
	Type       string  `json:"type"`
	State      string  `json:"state"`
	Mapping    string  `json:"mapping"`
	Event      string  `json:"event"`
	PID        int     `json:"pid"`
	Hz         int     `json:"hz"`
	DurationMS int64   `json:"durationMs"`
	Sequence   uint64  `json:"sequence,omitempty"`
	Elapsed    float64 `json:"elapsedSeconds,omitempty"`
}

func main() {
	duration := flag.Duration("duration", 12*time.Second, "bounded fixture lifetime (1s-5m)")
	hz := flag.Int("hz", 20, "shared-memory update rate (1-100 Hz)")
	flag.Parse()
	if flag.NArg() != 0 {
		fatalf("unexpected positional arguments: %v", flag.Args())
	}
	if *duration < minimumDuration || *duration > maximumDuration {
		fatalf("duration must be between %s and %s", minimumDuration, maximumDuration)
	}
	if *hz < minimumHz || *hz > maximumHz {
		fatalf("hz must be between %d and %d", minimumHz, maximumHz)
	}

	producer, err := lmutestfixture.OpenProducer()
	if err != nil {
		fatalf("open LMU fixture producer: %v", err)
	}
	defer producer.Close()

	const initialElapsed = 901.25
	if err := producer.Publish(initialElapsed, 0); err != nil {
		fatalf("publish initial fixture: %v", err)
	}

	encoder := json.NewEncoder(os.Stdout)
	_ = encoder.Encode(status{
		Type: "fixture", State: "ready", Mapping: lmutestfixture.MappingName,
		Event: lmutestfixture.DataEventName, PID: os.Getpid(), Hz: *hz,
		DurationMS: duration.Milliseconds(), Elapsed: initialElapsed,
	})

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	started := time.Now()
	ticker := time.NewTicker(time.Second / time.Duration(*hz))
	defer ticker.Stop()
	timer := time.NewTimer(*duration)
	defer timer.Stop()
	var sequence uint64

	for {
		select {
		case <-ctx.Done():
			_ = encoder.Encode(status{Type: "fixture", State: "interrupted", Mapping: lmutestfixture.MappingName, PID: os.Getpid(), Sequence: sequence})
			return
		case <-timer.C:
			_ = encoder.Encode(status{Type: "fixture", State: "complete", Mapping: lmutestfixture.MappingName, PID: os.Getpid(), Sequence: sequence})
			return
		case <-ticker.C:
			sequence++
			elapsed := initialElapsed + time.Since(started).Seconds()
			if err := producer.Publish(elapsed, sequence); err != nil {
				fatalf("publish fixture frame %d: %v", sequence, err)
			}
		}
	}
}

func fatalf(format string, arguments ...any) {
	_, _ = fmt.Fprintf(os.Stderr, "lmu-fixture: "+format+"\n", arguments...)
	os.Exit(1)
}
