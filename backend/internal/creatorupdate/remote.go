package creatorupdate

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"time"
)

// Only the authenticated admin handler forwards requests to this private Unix
// socket. Neither endpoint accepts paths, commands, refs, or deployment options.
func remoteRequest(socket, method, path string) (Status, error) {
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socket)
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 5 * time.Second}
	req, err := http.NewRequest(method, "http://supervisor"+path, nil)
	if err != nil {
		return Status{}, err
	}
	res, err := client.Do(req)
	if err != nil {
		return Status{}, errors.New("local deployment supervisor is unavailable")
	}
	defer func() { _ = res.Body.Close() }()
	var body struct {
		Status Status `json:"status"`
		Error  string `json:"error,omitempty"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&body); err != nil {
		return Status{}, err
	}
	if res.StatusCode != http.StatusOK {
		return body.Status, errors.New(body.Error)
	}
	return body.Status, nil
}

func supervisorHandler(m *Manager) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var s Status
		var err error
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/status":
			s = m.Status()
		case r.Method == http.MethodPost && r.URL.Path == "/start":
			s, err = m.Start()
		default:
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		message := ""
		if err != nil {
			w.WriteHeader(http.StatusConflict)
			message = err.Error()
		}
		_ = json.NewEncoder(w).Encode(struct {
			Status Status `json:"status"`
			Error  string `json:"error,omitempty"`
		}{s, message})
	})
}
