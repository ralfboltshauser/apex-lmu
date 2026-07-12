//go:build !windows

package main

import (
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	options, err := parseCLIOptions(os.Args[1:])
	if err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if options.selfTest {
		if err := runSelfTest(os.Stdout, options); err != nil {
			_, _ = fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	_ = emit(json.NewEncoder(os.Stdout), message{
		Type: "status", State: "unsupported", Message: "LMU live shared memory is available on Windows only",
	})
}
