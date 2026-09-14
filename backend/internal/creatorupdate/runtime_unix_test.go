//go:build darwin || linux

package creatorupdate

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestManagedApplicationHelper(t *testing.T) {
	if os.Getenv("CREATOR_TEST_HELPER") != "1" {
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok"}`)
	})
	if err := http.ListenAndServe(os.Getenv("CREATOR_TEST_ADDRESS"), mux); err != nil {
		os.Exit(1)
	}
	os.Exit(0)
}

func TestProcessRuntimeStartsChecksStopsAndRecoversRealChild(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	listener.Close()
	t.Setenv("CREATOR_TEST_HELPER", "1")
	t.Setenv("CREATOR_TEST_ADDRESS", address)
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	script := filepath.Join(dir, "healthy")
	content := "#!/bin/sh\nexec '" + strings.ReplaceAll(binary, "'", "'\\''") + "' -test.run=^TestManagedApplicationHelper$\n"
	if err := os.WriteFile(script, []byte(content), 0700); err != nil {
		t.Fatal(err)
	}
	hash, _ := hashFile(script)
	good := release{Binary: script, Directory: dir, SHA256: hash}
	p := &processRuntime{healthURL: "http://" + address + "/health"}
	defer p.Stop()
	if err := p.Start(good); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := p.Healthy(ctx); err != nil {
		t.Fatal(err)
	}
	if err := p.Start(good); err == nil {
		t.Fatal("started duplicate child")
	}
	if err := p.Stop(); err != nil {
		t.Fatal(err)
	}
	if p.Alive() {
		t.Fatal("child survived stop")
	}
	badPath := filepath.Join(dir, "bad")
	if err := os.WriteFile(badPath, []byte("#!/bin/sh\nexit 1\n"), 0700); err != nil {
		t.Fatal(err)
	}
	badHash, _ := hashFile(badPath)
	if err := p.Start(release{Binary: badPath, Directory: dir, SHA256: badHash}); err != nil {
		t.Fatal(err)
	}
	if err := p.Healthy(ctx); err == nil {
		t.Fatal("dead child considered healthy")
	}
	if err := p.Stop(); err != nil {
		t.Fatal(err)
	}
	if err := p.Start(good); err != nil {
		t.Fatal(err)
	}
	recoveryCtx, recoveryCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer recoveryCancel()
	if err := p.Healthy(recoveryCtx); err != nil {
		t.Fatal("failed to restore healthy child", err)
	}
}
