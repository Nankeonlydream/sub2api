//go:build !darwin && !linux

package creatorupdate

import "os/exec"

// New rejects unsupported local runner platforms; the server still builds.
func configureCommand(*exec.Cmd) {}
