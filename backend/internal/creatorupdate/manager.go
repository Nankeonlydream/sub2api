// Package creatorupdate builds custom releases and optionally deploys them via
// a local supervisor that survives application restarts.
package creatorupdate

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

type Config struct {
	Repository         string `json:"repository"`
	WorkDir            string `json:"work_dir"`
	UpstreamURL        string `json:"upstream_url"`
	UpstreamRef        string `json:"upstream_ref"`
	PNPM               string `json:"pnpm"`
	IncludeWorkingTree bool   `json:"include_working_tree"`
	AutoDeploy         bool   `json:"auto_deploy"`
	SupervisorSocket   string `json:"supervisor_socket"`
}

type Status struct {
	State           string   `json:"state"`
	Stage           string   `json:"stage,omitempty"`
	Message         string   `json:"message,omitempty"`
	JobID           string   `json:"job_id,omitempty"`
	StartedAt       string   `json:"started_at,omitempty"`
	FinishedAt      string   `json:"finished_at,omitempty"`
	SourceCommit    string   `json:"source_commit,omitempty"`
	UpstreamCommit  string   `json:"upstream_commit,omitempty"`
	CandidateCommit string   `json:"candidate_commit,omitempty"`
	Artifact        string   `json:"artifact,omitempty"`
	SHA256          string   `json:"sha256,omitempty"`
	Version         string   `json:"version,omitempty"`
	Conflicts       []string `json:"conflicts,omitempty"`
	LocalOnly       bool     `json:"local_only"`
	AutoDeploy      bool     `json:"auto_deploy"`
	Backup          string   `json:"backup,omitempty"`
	DeployedAt      string   `json:"deployed_at,omitempty"`
}

type Manager struct {
	mu       sync.Mutex
	config   Config
	status   Status
	validate func(context.Context, string, string, io.Writer) error
	deploy   func(context.Context, string, io.Writer) error
	remote   string
	lifetime context.Context
	jobs     sync.WaitGroup
}

// FromEnv is disabled unless an operator supplies an on-disk configuration.
// No repository, ref, path or command is accepted from an HTTP request.
func FromEnv() *Manager {
	path := os.Getenv("CREATOR_UPDATE_CONFIG")
	if path == "" {
		return disabled("Set CREATOR_UPDATE_CONFIG to enable local custom builds")
	}
	data, err := os.ReadFile(path) //nolint:gosec // G703: operator-owned CREATOR_UPDATE_CONFIG, never an HTTP parameter.
	if err != nil {
		return disabled("Cannot read CREATOR_UPDATE_CONFIG")
	}
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return disabled("Invalid CREATOR_UPDATE_CONFIG JSON")
	}
	if config.AutoDeploy {
		if !filepath.IsAbs(config.SupervisorSocket) {
			return disabled("auto_deploy requires an absolute supervisor_socket")
		}
		return &Manager{remote: config.SupervisorSocket}
	}
	m, err := New(config)
	if err != nil {
		return disabled(err.Error())
	}
	return m
}

func disabled(message string) *Manager {
	return &Manager{status: Status{State: "disabled", Message: message, LocalOnly: true}}
}

func New(config Config) (*Manager, error) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		return nil, errors.New("local custom builds currently require macOS or Linux")
	}
	if !filepath.IsAbs(config.Repository) || !filepath.IsAbs(config.WorkDir) {
		return nil, errors.New("repository and work_dir must be absolute paths")
	}
	repo, err := filepath.EvalSymlinks(config.Repository)
	if err != nil {
		return nil, fmt.Errorf("repository: %w", err)
	}
	if err := os.MkdirAll(config.WorkDir, 0700); err != nil {
		return nil, err
	}
	work, err := filepath.EvalSymlinks(config.WorkDir)
	if err != nil {
		return nil, err
	}
	if inside(repo, work) || inside(work, repo) {
		return nil, errors.New("work_dir and repository must be separate, non-nested directories")
	}
	config.Repository, config.WorkDir = repo, work
	if config.UpstreamURL == "" {
		config.UpstreamURL = "https://github.com/Wei-Shaw/sub2api.git"
	}
	if config.UpstreamRef == "" || strings.HasPrefix(config.UpstreamRef, "-") || strings.ContainsAny(config.UpstreamRef, "\r\n:") {
		return nil, errors.New("upstream_ref must be an explicit branch or release tag")
	}
	if strings.HasPrefix(config.UpstreamURL, "-") {
		return nil, errors.New("invalid upstream_url")
	}
	if config.PNPM == "" {
		config.PNPM = "pnpm"
	}
	m := &Manager{config: config, status: Status{State: "idle", LocalOnly: true}}
	m.validate = m.build
	// Restore completed results. A leftover lock requires an operator to check
	// the previous process; never guess that it is safe to start another build.
	if data, err := os.ReadFile(filepath.Join(work, "status.json")); err == nil {
		_ = json.Unmarshal(data, &m.status)
		if m.status.State == "running" {
			m.status.State = "failed"
			m.status.Message = "Previous build was interrupted; inspect run.lock and build.log before retrying"
		}
	}
	m.status.LocalOnly = true
	m.status.AutoDeploy = config.AutoDeploy
	return m, nil
}

func inside(parent, child string) bool {
	rel, err := filepath.Rel(parent, child)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func (m *Manager) Status() Status {
	if m.remote != "" {
		s, err := remoteRequest(m.remote, "GET", "/status")
		if err != nil {
			return Status{State: "disabled", AutoDeploy: true, LocalOnly: true, Message: err.Error()}
		}
		return s
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.status
	s.Conflicts = append([]string(nil), s.Conflicts...)
	return s
}

// Start returns immediately. Work survives HTTP disconnects and repeated clicks
// return the same active job. The disk lock also excludes other app processes.
func (m *Manager) Start() (Status, error) {
	if m.remote != "" {
		return remoteRequest(m.remote, "POST", "/start")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.status.State == "disabled" {
		return m.status, errors.New(m.status.Message)
	}
	if m.lifetime != nil && m.lifetime.Err() != nil {
		return m.status, errors.New("supervisor is shutting down")
	}
	if m.status.State == "running" {
		return m.status, nil
	}
	if m.config.AutoDeploy && m.deploy == nil {
		return m.status, errors.New("automatic deployment requires the supervisor")
	}
	if m.status.State == "recovery_required" {
		return m.status, errors.New("deployment recovery is required before another update")
	}
	lock, err := os.OpenFile(filepath.Join(m.config.WorkDir, "run.lock"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return m.status, errors.New("another build holds run.lock; inspect it before retrying")
	}
	_, _ = fmt.Fprintf(lock, "pid=%d\n", os.Getpid())
	_ = lock.Close()
	id := make([]byte, 8)
	if _, err := rand.Read(id); err != nil {
		_ = os.Remove(filepath.Join(m.config.WorkDir, "run.lock"))
		return m.status, err
	}
	m.status = Status{State: "running", Stage: "snapshot", JobID: hex.EncodeToString(id), StartedAt: time.Now().UTC().Format(time.RFC3339), LocalOnly: true, AutoDeploy: m.config.AutoDeploy}
	if err := m.saveLocked(); err != nil {
		m.status.State = "failed"
		_ = os.Remove(filepath.Join(m.config.WorkDir, "run.lock"))
		return m.status, err
	}
	status := m.status
	m.jobs.Add(1)
	go func() { defer m.jobs.Done(); m.run(status.JobID) }()
	return status, nil
}

func (m *Manager) saveLocked() error {
	data, err := json.MarshalIndent(m.status, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(m.config.WorkDir, "status.json")
	if err := os.WriteFile(path+".tmp", data, 0600); err != nil {
		return err
	}
	if err := os.Rename(path+".tmp", path); err != nil {
		return err
	}
	if m.status.JobID != "" {
		jobPath := filepath.Join(m.config.WorkDir, m.status.JobID, "status.json")
		if _, err := os.Stat(filepath.Dir(jobPath)); err == nil {
			if err := os.WriteFile(jobPath+".tmp", data, 0600); err != nil {
				return err
			}
			return os.Rename(jobPath+".tmp", jobPath)
		}
	}
	return nil
}

func (m *Manager) change(fn func(*Status)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	fn(&m.status)
	if err := m.saveLocked(); err != nil {
		m.status.Message = "Cannot persist build status: " + err.Error()
	}
}

func command(ctx context.Context, dir string, log io.Writer, input io.Reader, name string, args ...string) (string, error) {
	return commandWithPath(ctx, dir, log, input, "", name, args...)
}

func commandWithPath(ctx context.Context, dir string, log io.Writer, input io.Reader, toolsPath, name string, args ...string) (string, error) {
	if name == "git" {
		args = append([]string{"-c", "core.hooksPath=/dev/null"}, args...)
	}
	cmd := exec.CommandContext(ctx, name, args...)
	configureCommand(cmd)
	cmd.Dir, cmd.Stdin = dir, input
	// Build tools inherit toolchain/network settings, never the application's
	// database, JWT, provider or payment credentials, nor Git index overrides.
	for _, key := range []string{"PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy", "GOPROXY", "GOSUMDB", "GOPRIVATE", "GONOSUMDB", "GONOPROXY", "GOTOOLCHAIN", "GOCACHE", "GOMODCACHE", "PNPM_HOME", "COREPACK_HOME", "NPM_CONFIG_REGISTRY"} {
		if value, ok := os.LookupEnv(key); ok {
			if key == "PATH" && toolsPath != "" {
				value = toolsPath + string(os.PathListSeparator) + value
			}
			cmd.Env = append(cmd.Env, key+"="+value)
		}
	}
	cmd.Env = append(cmd.Env, "GIT_TERMINAL_PROMPT=0", "GIT_OPTIONAL_LOCKS=0", "GIT_MERGE_AUTOEDIT=no", "GIT_LFS_SKIP_SMUDGE=1", "CI=true")
	cmd.Stderr = log
	cmd.WaitDelay = 5 * time.Second
	// git outputs refs/diffs needed by the pipeline. Build output goes directly
	// to disk to avoid holding unbounded install/test output in application RAM.
	if name != "git" {
		cmd.Stdout = log
		return "", cmd.Run()
	}
	output, err := cmd.Output()
	if err != nil {
		_, _ = log.Write(output)
	}
	return string(output), err
}

func (m *Manager) run(id string) {
	parent := m.lifetime
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithTimeout(parent, 90*time.Minute)
	defer cancel()
	job := filepath.Join(m.config.WorkDir, id)
	err := os.Mkdir(job, 0700)
	if err == nil {
		var log *os.File
		log, err = os.OpenFile(filepath.Join(job, "build.log"), os.O_CREATE|os.O_WRONLY, 0600)
		if err == nil {
			err = m.prepare(ctx, job, log)
			if err == nil && m.config.AutoDeploy {
				err = m.deploy(ctx, job, log)
			}
			_ = log.Close()
		}
	}
	// Finish and release the cross-process lock under the same local mutex so
	// a successful result can immediately be followed by another request.
	m.mu.Lock()
	defer m.mu.Unlock()
	func(s *Status) {
		s.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		if s.State == "deployed" || s.State == "rolled_back" || s.State == "recovery_required" {
			return
		}
		if err != nil {
			s.State, s.Message = "failed", err.Error()
		} else {
			s.State, s.Stage, s.Message = "ready", "ready", "Custom build validated locally; nothing has been deployed"
		}
	}(&m.status)
	if saveErr := m.saveLocked(); saveErr != nil {
		if m.config.AutoDeploy {
			m.status.State = "recovery_required"
		} else {
			m.status.State = "failed"
		}
		m.status.Message = "Cannot persist completed build status: " + saveErr.Error()
	}
	if m.status.State != "recovery_required" {
		_ = os.Remove(filepath.Join(m.config.WorkDir, "run.lock"))
	}
}

func (m *Manager) prepare(ctx context.Context, job string, log io.Writer) error {
	repo := m.config.Repository
	git := func(dir string, args ...string) (string, error) { return command(ctx, dir, log, nil, "git", args...) }
	head, err := git(repo, "rev-parse", "--verify", "HEAD^{commit}")
	if err != nil {
		return errors.New("cannot read source repository HEAD")
	}
	dirty, err := git(repo, "status", "--porcelain", "--untracked-files=all")
	if err != nil {
		return err
	}
	if dirty != "" && !m.config.IncludeWorkingTree {
		return errors.New("source has uncommitted changes; commit them or enable include_working_tree for local testing")
	}
	m.change(func(s *Status) { s.SourceCommit = strings.TrimSpace(head) })
	candidate := filepath.Join(job, "source")
	if _, err := git(job, "clone", "--no-local", "--no-hardlinks", "--no-checkout", "--", repo, candidate); err != nil {
		return fmt.Errorf("isolated clone failed: %w", err)
	}
	for _, args := range [][]string{
		{"checkout", "--detach", strings.TrimSpace(head)},
		{"config", "user.name", "CatBee Local Update"},
		{"config", "user.email", "local-update@localhost"},
		{"config", "core.hooksPath", "/dev/null"},
		{"remote", "remove", "origin"},
	} {
		if _, err := git(candidate, args...); err != nil {
			return err
		}
	}
	if dirty != "" {
		patch, err := git(repo, "diff", "--binary", "HEAD", "--")
		if err != nil {
			return err
		}
		if patch != "" {
			if _, err := command(ctx, candidate, log, strings.NewReader(patch), "git", "apply", "--index", "--binary"); err != nil {
				return errors.New("cannot snapshot working changes; see build.log")
			}
		}
		untracked, err := git(repo, "ls-files", "--others", "--exclude-standard", "-z")
		if err != nil {
			return err
		}
		for _, name := range strings.Split(untracked, "\x00") {
			if name == "" {
				continue
			}
			if err := copyUntracked(repo, candidate, name); err != nil {
				return err
			}
		}
		if _, err := git(candidate, "add", "-A"); err != nil {
			return err
		}
		if _, err := git(candidate, "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Snapshot local customizations for validation"); err != nil {
			return err
		}
	}
	m.change(func(s *Status) { s.Stage = "fetch" })
	if _, err := git(candidate, "-c", "protocol.file.allow=always", "fetch", "--no-tags", "--", m.config.UpstreamURL, m.config.UpstreamRef); err != nil {
		return errors.New("upstream fetch failed; see build.log")
	}
	upstream, err := git(candidate, "rev-parse", "--verify", "FETCH_HEAD^{commit}")
	if err != nil {
		return err
	}
	m.change(func(s *Status) { s.Stage, s.UpstreamCommit = "merge", strings.TrimSpace(upstream) })
	if _, err := git(candidate, "-c", "commit.gpgsign=false", "merge", "--no-ff", "--no-edit", strings.TrimSpace(upstream)); err != nil {
		conflicts, _ := git(candidate, "diff", "--name-only", "--diff-filter=U", "-z")
		m.change(func(s *Status) {
			for _, name := range strings.Split(conflicts, "\x00") {
				if name != "" {
					s.Conflicts = append(s.Conflicts, name)
				}
			}
		})
		return errors.New("merge failed; resolve conflicts in the isolated source directory; current checkout is unchanged")
	}
	merged, err := git(candidate, "rev-parse", "HEAD")
	if err != nil {
		return err
	}
	m.change(func(s *Status) { s.CandidateCommit = strings.TrimSpace(merged) })
	artifact := filepath.Join(job, "sub2api")
	if err := m.validate(ctx, candidate, artifact, log); err != nil {
		return err
	}
	f, err := os.Open(artifact)
	if err != nil {
		return fmt.Errorf("missing build artifact: %w", err)
	}
	defer func() { _ = f.Close() }()
	hash := sha256.New()
	if _, err := io.Copy(hash, f); err != nil {
		return err
	}
	m.change(func(s *Status) { s.Artifact, s.SHA256 = artifact, hex.EncodeToString(hash.Sum(nil)) })
	return nil
}

func copyUntracked(repo, candidate, name string) error {
	src, dst := filepath.Join(repo, name), filepath.Join(candidate, name)
	if !inside(repo, src) || !inside(candidate, dst) {
		return errors.New("invalid snapshot path")
	}
	info, err := os.Lstat(src)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("snapshot requires regular untracked files: %s", name)
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0700); err != nil {
		return err
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, info.Mode().Perm()) //nolint:gosec // G703: git-listed paths are confined to both repository roots above; untracked symlinks are rejected.
}

func (m *Manager) build(ctx context.Context, source, artifact string, log io.Writer) error {
	// package.json scripts invoke `pnpm` themselves. Make an explicitly
	// configured pnpm.cjs executable available by that name to child processes.
	pnpm, err := exec.LookPath(m.config.PNPM)
	if err != nil {
		return fmt.Errorf("pnpm is unavailable: %w", err)
	}
	pnpm, err = filepath.Abs(pnpm)
	if err != nil {
		return err
	}
	toolsPath := filepath.Join(filepath.Dir(artifact), "tools")
	if err := os.Mkdir(toolsPath, 0700); err != nil {
		return err
	}
	if err := os.Symlink(pnpm, filepath.Join(toolsPath, "pnpm")); err != nil {
		return err
	}
	versionData, err := os.ReadFile(filepath.Join(source, "backend/cmd/server/VERSION"))
	if err != nil {
		return err
	}
	baseVersion := strings.TrimSpace(string(versionData))
	if !regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+([.+-][A-Za-z0-9.+-]+)?$`).MatchString(baseVersion) {
		return errors.New("invalid candidate VERSION")
	}
	s := m.Status()
	version := strings.SplitN(baseVersion, "-", 2)[0] + "-creator.local." + s.JobID
	m.change(func(s *Status) { s.Version = version })
	ldflags := "-X main.Version=" + version + " -X main.Commit=" + s.CandidateCommit + " -X main.BuildType=source"
	steps := []struct {
		stage, dir, name string
		args             []string
	}{
		{"install", "frontend", m.config.PNPM, []string{"install", "--frozen-lockfile"}},
		{"test_frontend", "frontend", m.config.PNPM, []string{"test:run"}},
		{"build_frontend", "frontend", m.config.PNPM, []string{"build"}},
		{"test_backend", "backend", "go", []string{"test", "./..."}},
		{"test_backend", "backend", "go", []string{"test", "-tags=unit", "./internal/creatorupdate", "./internal/service", "./internal/handler/admin"}},
		{"test_backend", "backend", "go", []string{"vet", "./..."}},
		{"build_backend", "backend", "go", []string{"build", "-tags", "embed", "-ldflags", ldflags, "-trimpath", "-o", artifact, "./cmd/server"}},
	}
	for _, step := range steps {
		m.change(func(s *Status) { s.Stage = step.stage })
		commandName := step.name + " " + strings.Join(step.args, " ")
		_, _ = fmt.Fprintf(log, "\n[%s] %s\n", step.stage, commandName)
		if _, err := commandWithPath(ctx, filepath.Join(source, step.dir), log, nil, toolsPath, step.name, step.args...); err != nil {
			return fmt.Errorf("%s failed (%s); see build.log: %w", step.stage, commandName, err)
		}
	}
	return nil
}
