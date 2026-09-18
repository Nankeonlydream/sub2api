//go:build !darwin && !linux

package creatorupdate

import (
	"context"
	"errors"
)

func RunSupervisor(context.Context, string, string, string, string) error {
	return errors.New("automatic deployment requires Linux or macOS")
}
