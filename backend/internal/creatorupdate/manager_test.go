package creatorupdate

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func gitTest(t *testing.T, repo string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Dir = repo
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %s: %v", args, out, err)
	}
	return strings.TrimSpace(string(out))
}

func writeTest(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
}

func fixture(t *testing.T, conflict bool) (Config, string) {
	t.Helper()
	repo := t.TempDir()
	gitTest(t, repo, "init", "-b", "main")
	gitTest(t, repo, "config", "user.email", "test@localhost")
	gitTest(t, repo, "config", "user.name", "Test")
	writeTest(t, repo, "shared.txt", "base\n")
	gitTest(t, repo, "add", ".")
	gitTest(t, repo, "commit", "-m", "base")
	gitTest(t, repo, "checkout", "-b", "official")
	if conflict {
		writeTest(t, repo, "shared.txt", "official change\n")
	} else {
		writeTest(t, repo, "official.txt", "new feature\n")
	}
	gitTest(t, repo, "add", ".")
	gitTest(t, repo, "commit", "-m", "official update")
	gitTest(t, repo, "checkout", "main")
	writeTest(t, repo, "custom.txt", "creator studio\n")
	if conflict {
		writeTest(t, repo, "shared.txt", "custom change\n")
	}
	gitTest(t, repo, "add", ".")
	gitTest(t, repo, "commit", "-m", "custom features")
	head := gitTest(t, repo, "rev-parse", "HEAD")
	return Config{Repository: repo, WorkDir: t.TempDir(), UpstreamURL: repo, UpstreamRef: "refs/heads/official"}, head
}

func waitResult(t *testing.T, m *Manager) Status {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		s := m.Status()
		if s.State != "running" {
			return s
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("build did not finish")
	return Status{}
}

func TestMergePreservesCustomAndOfficialCodeWithoutChangingSource(t *testing.T) {
	config, head := fixture(t, false)
	config.IncludeWorkingTree = true
	writeTest(t, config.Repository, "custom.txt", "uncommitted creator fix\n")
	writeTest(t, config.Repository, "extra.txt", "untracked feature\n")
	before := gitTest(t, config.Repository, "status", "--porcelain")
	m, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	m.validate = func(_ context.Context, source, artifact string, _ io.Writer) error {
		for name, want := range map[string]string{"official.txt": "new feature\n", "custom.txt": "uncommitted creator fix\n", "extra.txt": "untracked feature\n"} {
			got, err := os.ReadFile(filepath.Join(source, name))
			if err != nil || string(got) != want {
				return errors.New("merged content missing: " + name)
			}
		}
		return os.WriteFile(artifact, []byte("test custom artifact"), 0700)
	}
	if _, err := m.Start(); err != nil {
		t.Fatal(err)
	}
	s := waitResult(t, m)
	if s.State != "ready" || s.SHA256 == "" || s.CandidateCommit == "" || !s.LocalOnly {
		t.Fatalf("unexpected result: %+v", s)
	}
	if got := gitTest(t, config.Repository, "rev-parse", "HEAD"); got != head {
		t.Fatal("source HEAD changed")
	}
	if got := gitTest(t, config.Repository, "status", "--porcelain"); got != before {
		t.Fatal("source index or worktree changed")
	}
	restored, err := New(config)
	if err != nil || restored.Status().Artifact != s.Artifact {
		t.Fatal("result not restored")
	}
	if _, err := os.Stat(filepath.Join(config.WorkDir, s.JobID, "status.json")); err != nil {
		t.Fatal("missing per-job audit record")
	}
}

func TestMergeConflictStopsBeforeValidationAndKeepsOriginal(t *testing.T) {
	config, head := fixture(t, true)
	m, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	called := false
	m.validate = func(context.Context, string, string, io.Writer) error { called = true; return nil }
	if _, err := m.Start(); err != nil {
		t.Fatal(err)
	}
	s := waitResult(t, m)
	if s.State != "failed" || called || len(s.Conflicts) != 1 || s.Conflicts[0] != "shared.txt" {
		t.Fatalf("unexpected conflict result: %+v", s)
	}
	if got := gitTest(t, config.Repository, "rev-parse", "HEAD"); got != head {
		t.Fatal("source HEAD changed")
	}
	if gitTest(t, config.Repository, "status", "--porcelain") != "" {
		t.Fatal("source worktree changed")
	}
}

func TestRepeatedClicksShareJobAndValidationFailureNeverReportsReady(t *testing.T) {
	config, _ := fixture(t, false)
	m, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	other, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	gate := make(chan struct{})
	m.validate = func(context.Context, string, string, io.Writer) error {
		<-gate
		return errors.New("custom feature regression")
	}
	first, err := m.Start()
	if err != nil {
		t.Fatal(err)
	}
	second, err := m.Start()
	if err != nil || first.JobID != second.JobID {
		t.Fatal("duplicate click started a different job")
	}
	if _, err := other.Start(); err == nil {
		t.Fatal("second process bypassed disk lock")
	}
	close(gate)
	s := waitResult(t, m)
	if s.State != "failed" || s.Artifact != "" || s.Message != "custom feature regression" {
		t.Fatalf("unexpected result: %+v", s)
	}
}

func TestDirtySourceRequiresExplicitSnapshotAndBadFetchDoesNotBuild(t *testing.T) {
	for _, dirty := range []bool{true, false} {
		config, head := fixture(t, false)
		if dirty {
			writeTest(t, config.Repository, "custom.txt", "local edits")
		} else {
			config.UpstreamRef = "refs/heads/missing"
		}
		m, err := New(config)
		if err != nil {
			t.Fatal(err)
		}
		called := false
		m.validate = func(context.Context, string, string, io.Writer) error { called = true; return nil }
		if _, err := m.Start(); err != nil {
			t.Fatal(err)
		}
		if s := waitResult(t, m); s.State != "failed" || called {
			t.Fatalf("unexpected result: %+v", s)
		}
		if gitTest(t, config.Repository, "rev-parse", "HEAD") != head {
			t.Fatal("source changed")
		}
	}
}

func TestDisabledAndNestedPathsCannotStart(t *testing.T) {
	t.Setenv("CREATOR_UPDATE_CONFIG", "")
	if _, err := FromEnv().Start(); err == nil {
		t.Fatal("unconfigured pipeline started")
	}
	config, _ := fixture(t, false)
	config.WorkDir = filepath.Join(config.Repository, "builds")
	if _, err := New(config); err == nil {
		t.Fatal("nested work directory accepted")
	}
}

func TestInterruptedBuildLockIsNotSilentlyRemoved(t *testing.T) {
	config, _ := fixture(t, false)
	writeTest(t, config.WorkDir, "status.json", `{"state":"running","local_only":true}`)
	writeTest(t, config.WorkDir, "run.lock", "pid=999999\n")
	m, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	if m.Status().State != "failed" {
		t.Fatal("interrupted build reported as running")
	}
	if _, err := m.Start(); err == nil {
		t.Fatal("stale lock removed without inspection")
	}
}

func TestBuildCommandsDoNotInheritAppSecretsOrGitOverrides(t *testing.T) {
	t.Setenv("DATABASE_PASSWORD", "do-not-pass")
	t.Setenv("JWT_SECRET", "do-not-pass")
	t.Setenv("GIT_INDEX_FILE", "/must-not-use-this-index")
	_, err := command(context.Background(), t.TempDir(), io.Discard, nil, "sh", "-c", `test -z "$DATABASE_PASSWORD" && test -z "$JWT_SECRET" && test -z "$GIT_INDEX_FILE" && test "$CI" = true`)
	if err != nil {
		t.Fatal("unsafe build environment")
	}
}

func TestCommandTimeoutStopsChildWorkers(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	started := time.Now()
	_, err := command(ctx, t.TempDir(), io.Discard, nil, "sh", "-c", "sleep 20 & wait")
	if err == nil || time.Since(started) > 3*time.Second {
		t.Fatal("command children survived timeout")
	}
}
