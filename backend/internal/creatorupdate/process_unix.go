//go:build darwin || linux

package creatorupdate

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
)

// Killing only pnpm/go would leave their workers running after the job timeout.
func configureCommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		if errors.Is(err, syscall.ESRCH) {
			return os.ErrProcessDone
		}
		return err
	}
}
