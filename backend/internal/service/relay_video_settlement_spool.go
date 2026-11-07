package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// The existing persistent data volume is a fallback for a SQL outage after
// upstream acceptance. It contains the same credential-free billing envelope.
func relayVideoSpoolDir() string {
	base := strings.TrimSpace(os.Getenv("DATA_DIR"))
	if base == "" {
		if st, err := os.Stat("/app/data"); err == nil && st.IsDir() {
			base = "/app/data"
		}
	}
	if base == "" {
		return ""
	}
	return filepath.Join(base, "relay-video-settlements")
}
func prepareRelayVideoSpool() error {
	dir := relayVideoSpoolDir()
	if dir == "" {
		return nil
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".probe-")
	if err != nil {
		return err
	}
	name := f.Name()
	err = f.Sync()
	err = errors.Join(err, f.Close())
	_ = os.Remove(name)
	return err
}
func saveRelayVideoSpool(task *RelayVideoSettlement) (string, error) {
	dir := relayVideoSpoolDir()
	if dir == "" {
		return "", nil
	}
	if err := task.Validate(); err != nil {
		return "", err
	}
	raw, err := json.Marshal(task)
	if err != nil {
		return "", err
	}
	key := sha256.Sum256([]byte(task.SubmissionID))
	dest := filepath.Join(dir, hex.EncodeToString(key[:])+".json")
	f, err := os.CreateTemp(dir, ".accept-")
	if err != nil {
		return "", err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if _, err = f.Write(raw); err != nil {
		_ = f.Close()
		return "", err
	}
	if err = f.Sync(); err != nil {
		_ = f.Close()
		return "", err
	}
	if err = f.Close(); err != nil {
		return "", err
	}
	if err = os.Rename(tmp, dest); err != nil {
		return "", err
	}
	d, err := os.Open(dir)
	if err != nil {
		return "", err
	}
	defer d.Close()
	if err = d.Sync(); err != nil {
		return "", err
	}
	return dest, nil
}
func recoverRelayVideoSpool(ctx context.Context, repo RelayVideoSettlementRepository) error {
	dir := relayVideoSpoolDir()
	if dir == "" {
		return nil
	}
	d, err := os.Open(dir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	defer d.Close()
	entries, err := d.ReadDir(32)
	if err != nil && err != io.EOF {
		return err
	}
	var failures error
	for _, entry := range entries {
		if ctx.Err() != nil {
			return errors.Join(failures, ctx.Err())
		}
		if !strings.HasSuffix(entry.Name(), ".json") || !entry.Type().IsRegular() {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		f, e := os.Open(path)
		if e != nil {
			failures = errors.Join(failures, e)
			continue
		}
		raw, e := io.ReadAll(io.LimitReader(f, 1<<20))
		_ = f.Close()
		var task RelayVideoSettlement
		if e == nil {
			e = json.Unmarshal(raw, &task)
		}
		if e == nil {
			e = task.Validate()
		}
		if e == nil {
			e = repo.StoreRelayVideoSettlement(ctx, &task)
		}
		if e == nil {
			_ = os.Remove(path)
		} else {
			failures = errors.Join(failures, e)
		}
	}
	return failures
}
