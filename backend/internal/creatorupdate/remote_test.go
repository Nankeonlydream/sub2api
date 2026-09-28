package creatorupdate

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestSupervisorClientDispatchesAndRestoresStatus(t *testing.T) {
	config, _ := fixture(t, false)
	m, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	m.validate = func(_ context.Context, _ string, artifact string, _ io.Writer) error {
		return os.WriteFile(artifact, []byte("binary"), 0700)
	}
	dir, err := os.MkdirTemp("/tmp", "creator-socket-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	socket := filepath.Join(dir, "rpc.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: supervisorHandler(m)}
	go server.Serve(listener)
	defer server.Close()
	config.AutoDeploy, config.SupervisorSocket = true, socket
	data, _ := json.Marshal(config)
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CREATOR_UPDATE_CONFIG", path)
	client := FromEnv()
	s, err := client.Start()
	if err != nil || s.State != "running" {
		t.Fatalf("dispatch: %+v %v", s, err)
	}
	result := waitResult(t, m)
	if result.State != "ready" {
		t.Fatalf("worker: %+v", result)
	}
	if got := FromEnv().Status(); got.JobID != s.JobID || got.State != "ready" {
		t.Fatalf("restored client: %+v", got)
	}
	server.Close()
	if _, err := client.Start(); err == nil {
		t.Fatal("unavailable supervisor silently fell back to local runner")
	}
}
