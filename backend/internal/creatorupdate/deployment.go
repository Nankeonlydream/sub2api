package creatorupdate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type release struct {
	Binary     string `json:"binary"`
	Directory  string `json:"directory"`
	SHA256     string `json:"sha256"`
	Migrations string `json:"migrations"`
	Version    string `json:"version"`
}

type pendingDeployment struct {
	JobID     string  `json:"job_id"`
	Previous  release `json:"previous"`
	Candidate release `json:"candidate"`
}

type applicationRuntime interface {
	Start(release) error
	Stop() error
	Healthy(context.Context) error
	Alive() bool
}

type deployment struct {
	mu            sync.Mutex
	manager       *Manager
	active        release
	runtime       applicationRuntime
	backup        func(context.Context, string) error
	healthTimeout time.Duration
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// Include migration SQL and implementation, excluding test-only files. An
// automatic binary rollback cannot safely undo an unknown schema migration.
func migrationHash(dir string) (string, error) {
	h := sha256.New()
	count := 0
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if strings.HasSuffix(path, "_test.go") || (filepath.Ext(path) != ".go" && filepath.Ext(path) != ".sql") {
			return nil
		}
		if !entry.Type().IsRegular() {
			return errors.New("migration must be a regular file")
		}
		rel, _ := filepath.Rel(dir, path)
		digest, err := hashFile(path)
		if err != nil {
			return err
		}
		fmt.Fprintf(h, "%s\x00%s\n", filepath.ToSlash(rel), digest)
		count++
		return nil
	})
	if err != nil {
		return "", err
	}
	if count == 0 {
		return "", errors.New("migration manifest is empty")
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func writeJSON(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.OpenFile(path+".tmp", os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err := os.Rename(path+".tmp", path); err != nil {
		return err
	}
	dir, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func (d *deployment) path(name string) string { return filepath.Join(d.manager.config.WorkDir, name) }

func (d *deployment) checkHealth(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, d.healthTimeout)
	defer cancel()
	return d.runtime.Healthy(ctx)
}

func (d *deployment) apply(ctx context.Context, job string, log io.Writer) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	s := d.manager.Status()
	candidate := release{Binary: filepath.Join(job, "sub2api"), Directory: filepath.Join(job, "source/backend"), SHA256: s.SHA256, Version: s.Version}
	var err error
	candidate.Migrations, err = migrationHash(filepath.Join(candidate.Directory, "migrations"))
	if err != nil {
		return err
	}
	if candidate.Migrations != d.active.Migrations {
		return errors.New("database migrations changed; automatic deployment stopped before replacing the running version; review the migration and rollback plan")
	}
	actual, err := hashFile(candidate.Binary)
	if err != nil || actual != candidate.SHA256 {
		return errors.New("candidate binary checksum mismatch; deployment stopped")
	}
	if err := os.Chmod(candidate.Binary, 0700); err != nil {
		return err
	}
	// Keep the previous release immutable and available across container restarts.
	previous := d.active
	if err := verifyRelease(previous); err != nil {
		return fmt.Errorf("previous release: %w", err)
	}
	d.manager.change(func(s *Status) { s.Stage = "backup" })
	backup := filepath.Join(job, "database.dump")
	if err := d.backup(ctx, backup); err != nil {
		return fmt.Errorf("database backup failed; running version unchanged: %w", err)
	}
	d.manager.change(func(s *Status) { s.Backup = backup })
	pending := pendingDeployment{JobID: s.JobID, Previous: previous, Candidate: candidate}
	if err := writeJSON(d.path("deployment-pending.json"), pending); err != nil {
		return err
	}
	d.manager.change(func(s *Status) { s.Stage = "deploying" })
	_, _ = fmt.Fprintln(log, "\n[deploying] backup verified; switching local application")
	if err := d.runtime.Stop(); err != nil {
		return d.rollback(previous, fmt.Errorf("stop previous application: %w", err))
	}
	if err := ctx.Err(); err != nil {
		return d.rollback(previous, err)
	}
	if err := d.runtime.Start(candidate); err != nil {
		return d.rollback(previous, err)
	}
	d.manager.change(func(s *Status) { s.Stage = "health_check" })
	if err := d.checkHealth(ctx); err != nil {
		return d.rollback(previous, err)
	}
	if err := writeJSON(d.path("active-release.json"), candidate); err != nil {
		return d.rollback(previous, err)
	}
	d.active = candidate
	// The journal is removed only after the active release has been persisted.
	// Any remaining journal causes conservative recovery to the previous release.
	if err := os.Remove(d.path("deployment-pending.json")); err != nil {
		return d.rollback(previous, err)
	}
	d.manager.change(func(s *Status) {
		s.State, s.Stage, s.Message = "deployed", "deployed", "Custom version deployed and health check passed"
		s.DeployedAt = time.Now().UTC().Format(time.RFC3339)
	})
	return nil
}

func verifyRelease(r release) error {
	actual, err := hashFile(r.Binary)
	if err != nil {
		return err
	}
	if actual != r.SHA256 {
		return errors.New("release checksum mismatch")
	}
	return nil
}

func (d *deployment) rollback(previous release, cause error) error {
	d.manager.change(func(s *Status) { s.Stage = "rolling_back" })
	// Recovery gets its own deadline even when the build/deploy timeout expired.
	ctx, cancel := context.WithTimeout(context.Background(), d.healthTimeout)
	defer cancel()
	err := d.runtime.Stop()
	if err == nil {
		err = writeJSON(d.path("active-release.json"), previous)
	}
	d.active = previous
	if err == nil {
		err = verifyRelease(previous)
	}
	if err == nil {
		err = d.runtime.Start(previous)
	}
	if err == nil {
		err = d.runtime.Healthy(ctx)
	}
	if err != nil {
		d.manager.change(func(s *Status) {
			s.State, s.Message = "recovery_required", "Update failed and previous version could not restart: "+err.Error()
		})
		return err
	}
	if err := os.Remove(d.path("deployment-pending.json")); err != nil {
		d.manager.change(func(s *Status) {
			s.State, s.Message = "recovery_required", "Previous version restored but deployment journal could not be cleared: "+err.Error()
		})
		return err
	}
	d.manager.change(func(s *Status) {
		s.State, s.Stage, s.Message = "rolled_back", "rolled_back", "New version failed; previous version restored: "+cause.Error()
	})
	return cause
}

// recoverPending is called under the supervisor's exclusive process lock,
// before any child starts. An interrupted switch falls back to the saved
// previous release, even if the active pointer was already written.
func (d *deployment) recoverPending() error {
	data, err := os.ReadFile(d.path("deployment-pending.json"))
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var pending pendingDeployment
	if err := json.Unmarshal(data, &pending); err != nil {
		return err
	}
	if err := verifyRelease(pending.Previous); err != nil {
		return err
	}
	d.active = pending.Previous
	if err := writeJSON(d.path("active-release.json"), d.active); err != nil {
		return err
	}
	d.manager.change(func(s *Status) {
		s.State, s.Stage, s.Message = "recovery_required", "rolling_back", "Interrupted deployment; restoring previous version"
	})
	return nil
}

func (d *deployment) finishRecovery() error {
	if _, err := os.Stat(d.path("deployment-pending.json")); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return err
	}
	if err := os.Remove(d.path("deployment-pending.json")); err != nil {
		return err
	}
	d.manager.change(func(s *Status) {
		s.State, s.Stage, s.Message = "rolled_back", "rolled_back", "Interrupted deployment recovered; previous version is healthy"
		s.FinishedAt = time.Now().UTC().Format(time.RFC3339)
	})
	return os.Remove(d.path("run.lock"))
}
