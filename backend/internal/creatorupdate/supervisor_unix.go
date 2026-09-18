//go:build darwin || linux

package creatorupdate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	appconfig "github.com/Wei-Shaw/sub2api/internal/config"
	"golang.org/x/sys/unix"
)

type processRuntime struct {
	cmd       *exec.Cmd
	done      chan struct{}
	healthURL string
}

func (p *processRuntime) Alive() bool {
	if p.cmd == nil {
		return false
	}
	select {
	case <-p.done:
		return false
	default:
		return true
	}
}

func (p *processRuntime) Start(r release) error {
	if p.Alive() {
		return errors.New("application is already running")
	}
	if err := verifyRelease(r); err != nil {
		return err
	}
	cmd := exec.Command(r.Binary)
	cmd.Dir, cmd.Env, cmd.Stdout, cmd.Stderr = r.Directory, os.Environ(), os.Stdout, os.Stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	p.cmd, p.done = cmd, make(chan struct{})
	done := p.done
	go func() { _ = cmd.Wait(); close(done) }()
	return nil
}

func (p *processRuntime) Stop() error {
	if p.cmd == nil {
		return nil
	}
	if !p.Alive() {
		p.cmd = nil
		return nil
	}
	if err := syscall.Kill(-p.cmd.Process.Pid, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
		return err
	}
	select {
	case <-p.done:
		p.cmd = nil
		return nil
	case <-time.After(30 * time.Second):
		if err := syscall.Kill(-p.cmd.Process.Pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
			return err
		}
		select {
		case <-p.done:
			p.cmd = nil
			return nil
		case <-time.After(5 * time.Second):
			return errors.New("application did not stop")
		}
	}
}

func (p *processRuntime) Healthy(ctx context.Context) error {
	client := &http.Client{Timeout: 2 * time.Second, Transport: &http.Transport{Proxy: nil}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	consecutive := 0
	for {
		if !p.Alive() {
			return errors.New("application exited before health check passed")
		}
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, p.healthURL, nil)
		res, err := client.Do(req)
		ok := false
		if err == nil {
			var body struct {
				Status string `json:"status"`
			}
			ok = res.StatusCode == http.StatusOK && json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&body) == nil && body.Status == "ok"
			_ = res.Body.Close()
		}
		if ok {
			consecutive++
		} else {
			consecutive = 0
		}
		if consecutive >= 3 && p.Alive() {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("application health check timed out: %w", ctx.Err())
		case <-time.After(time.Second):
		}
	}
}

// Database credentials stay in the supervisor and pg_dump's environment. They
// are never supplied to build/test commands or written to the build log.
func databaseBackup(cfg appconfig.DatabaseConfig) func(context.Context, string) error {
	return func(ctx context.Context, path string) error {
		ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
		f, err := os.OpenFile(path+".tmp", os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return err
		}
		defer func() { _ = os.Remove(path + ".tmp") }()
		cmd := exec.CommandContext(ctx, "pg_dump", "--host", cfg.Host, "--port", strconv.Itoa(cfg.Port), "--username", cfg.User, "--dbname", cfg.DBName, "--format=custom", "--no-password")
		configureCommand(cmd)
		cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "PGPASSWORD=" + cfg.Password, "PGSSLMODE=" + cfg.SSLMode, "PGCONNECT_TIMEOUT=10"}
		cmd.Stdout, cmd.Stderr = f, io.Discard
		err = cmd.Run()
		if err == nil {
			err = f.Sync()
		}
		closeErr := f.Close()
		if err != nil {
			return errors.New("pg_dump failed; check database connectivity and permissions")
		}
		if closeErr != nil {
			return closeErr
		}
		check := exec.CommandContext(ctx, "pg_restore", "--list", path+".tmp")
		configureCommand(check)
		check.Stdout, check.Stderr = io.Discard, io.Discard
		if err := check.Run(); err != nil {
			return errors.New("database backup verification failed")
		}
		return os.Rename(path+".tmp", path)
	}
}

func bootstrapRelease(work, binary, resources, migrations string) (release, error) {
	hash, err := hashFile(binary)
	if err != nil {
		return release{}, err
	}
	dir := filepath.Join(work, "bootstrap-"+hash[:16])
	if err := os.MkdirAll(dir, 0700); err != nil {
		return release{}, err
	}
	if _, err := os.Stat(filepath.Join(dir, "resources")); os.IsNotExist(err) {
		if err := os.CopyFS(filepath.Join(dir, "resources"), os.DirFS(resources)); err != nil {
			return release{}, err
		}
	}
	target := filepath.Join(dir, "sub2api")
	if existing, err := hashFile(target); err != nil || existing != hash {
		in, err := os.Open(binary)
		if err != nil {
			return release{}, err
		}
		defer func() { _ = in.Close() }()
		out, err := os.OpenFile(target+".tmp", os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0700)
		if err != nil {
			return release{}, err
		}
		_, err = io.Copy(out, in)
		if err == nil {
			err = out.Sync()
		}
		closeErr := out.Close()
		if err != nil {
			return release{}, err
		}
		if closeErr != nil {
			return release{}, closeErr
		}
		if err := os.Rename(target+".tmp", target); err != nil {
			return release{}, err
		}
	}
	manifest, err := migrationHash(migrations)
	return release{Binary: target, Directory: dir, SHA256: hash, Migrations: manifest, Version: "bootstrap." + hash[:12]}, err
}

// RunSupervisor manages only its own application child. It has no Docker socket,
// host command endpoint, or ability to recreate the database/Redis containers.
func RunSupervisor(ctx context.Context, configPath, binary, resources, migrations string) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	data, err := os.ReadFile(configPath)
	if err != nil {
		return err
	}
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return err
	}
	if !config.AutoDeploy || !filepath.IsAbs(config.SupervisorSocket) {
		return errors.New("supervisor requires auto_deploy and absolute supervisor_socket")
	}
	if err := os.MkdirAll(config.WorkDir, 0700); err != nil {
		return err
	}
	lock, err := os.OpenFile(filepath.Join(config.WorkDir, "supervisor.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer func() { _ = lock.Close() }()
	if err := unix.Flock(int(lock.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		return errors.New("another supervisor is running")
	}
	defer func() { _ = unix.Flock(int(lock.Fd()), unix.LOCK_UN) }()
	m, err := New(config)
	if err != nil {
		return err
	}
	m.lifetime = ctx
	cfg, err := appconfig.LoadForBootstrap()
	if err != nil {
		return err
	}
	host := cfg.Server.Host
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	p := &processRuntime{healthURL: "http://" + net.JoinHostPort(host, strconv.Itoa(cfg.Server.Port)) + "/health"}
	d := &deployment{manager: m, runtime: p, backup: databaseBackup(cfg.Database), healthTimeout: 120 * time.Second}
	activeData, err := os.ReadFile(d.path("active-release.json"))
	if err == nil {
		err = json.Unmarshal(activeData, &d.active)
	} else if os.IsNotExist(err) {
		d.active, err = bootstrapRelease(config.WorkDir, binary, resources, migrations)
		if err == nil {
			err = writeJSON(d.path("active-release.json"), d.active)
		}
	}
	if err != nil {
		return err
	}
	if err := d.recoverPending(); err != nil {
		return err
	}
	if err := p.Start(d.active); err != nil {
		return err
	}
	defer func() {
		cancel()
		m.jobs.Wait()
		d.mu.Lock()
		defer d.mu.Unlock()
		_ = p.Stop()
	}()
	if err := d.checkHealth(ctx); err != nil {
		return err
	}
	if err := d.finishRecovery(); err != nil && !os.IsNotExist(err) {
		return err
	}
	// Our exclusive supervisor lock establishes that no managed worker from a
	// previous container process survives. Release interrupted build locks.
	if err := os.Remove(d.path("run.lock")); err != nil && !os.IsNotExist(err) {
		return err
	}
	if d.active.Version == m.Status().Version && d.active.Version != "" {
		m.change(func(s *Status) {
			s.State, s.Stage, s.Message = "deployed", "deployed", "Custom version deployed and health check passed"
		})
	}
	m.deploy = d.apply
	if err := os.MkdirAll(filepath.Dir(config.SupervisorSocket), 0700); err != nil {
		return err
	}
	if err := os.Remove(config.SupervisorSocket); err != nil && !os.IsNotExist(err) {
		return err
	}
	listener, err := net.Listen("unix", config.SupervisorSocket)
	if err != nil {
		return err
	}
	defer func() { _ = listener.Close() }()
	defer func() { _ = os.Remove(config.SupervisorSocket) }()
	if err := os.Chmod(config.SupervisorSocket, 0600); err != nil {
		return err
	}
	server := &http.Server{Handler: supervisorHandler(m), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second}
	defer func() {
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	errorsCh := make(chan error, 1)
	go func() { errorsCh <- server.Serve(listener) }()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case err := <-errorsCh:
			return err
		case <-ticker.C:
			// Deployment holds this lock during the planned restart. A crashed
			// child outside deployment makes Docker restart the supervisor cleanly.
			if d.mu.TryLock() {
				alive := p.Alive()
				d.mu.Unlock()
				if !alive {
					return errors.New("application exited; supervisor restarting")
				}
			}
		}
	}
}
