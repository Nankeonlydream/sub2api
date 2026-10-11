package service

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type creatorImageRoundTripFunc func(*http.Request) (*http.Response, error)

func (f creatorImageRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestCreatorImageDownloaderDownloadsSupportedImage(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\npayload")
	client := &http.Client{Transport: creatorImageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		require.Equal(t, "https://cdn.example.test/result.png?token=secret", req.URL.String())
		require.Contains(t, req.Header.Get("Accept"), "image/png")
		return &http.Response{
			StatusCode:    http.StatusOK,
			Header:        http.Header{"Content-Type": []string{"application/octet-stream"}},
			Body:          io.NopCloser(strings.NewReader(string(png))),
			ContentLength: int64(len(png)),
			Request:       req,
		}, nil
	})}
	downloader := NewCreatorImageDownloader(client, 1024)
	downloader.validateURL = func(context.Context, string) error { return nil }

	result, err := downloader.Download(context.Background(), "https://cdn.example.test/result.png?token=secret")

	require.NoError(t, err)
	require.Equal(t, png, result.Data)
	require.Equal(t, "image/png", result.ContentType)
	require.Equal(t, "png", result.Extension)
}

func TestCreatorImageDownloaderStreamsSupportedImage(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\npayload")
	client := &http.Client{Transport: creatorImageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/octet-stream"}}, Body: io.NopCloser(strings.NewReader(string(png))), ContentLength: int64(len(png)), Request: req}, nil
	})}
	downloader := NewCreatorImageDownloader(client, 1024)
	downloader.validateURL = func(context.Context, string) error { return nil }
	var got []byte
	err := downloader.Stream(context.Background(), "https://cdn.example.test/result.png", func(response *http.Response, body io.Reader) error {
		require.Equal(t, "image/png", response.Header.Get("Content-Type"))
		require.Equal(t, "png", response.Header.Get("X-Creator-Image-Extension"))
		var err error
		got, err = io.ReadAll(body)
		return err
	})
	require.NoError(t, err)
	require.Equal(t, png, got)
}

func TestCreatorImageDownloaderEnforcesBodyLimit(t *testing.T) {
	client := &http.Client{Transport: creatorImageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode:    http.StatusOK,
			Header:        http.Header{"Content-Type": []string{"image/png"}},
			Body:          io.NopCloser(strings.NewReader("12345")),
			ContentLength: -1,
			Request:       req,
		}, nil
	})}
	downloader := NewCreatorImageDownloader(client, 4)
	downloader.validateURL = func(context.Context, string) error { return nil }

	_, err := downloader.Download(context.Background(), "https://cdn.example.test/result.png")

	require.ErrorIs(t, err, ErrCreatorImageDownloadTooLarge)
}

func TestCreatorImageDownloaderRejectsNonImageContent(t *testing.T) {
	client := &http.Client{Transport: creatorImageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/html"}},
			Body:       io.NopCloser(strings.NewReader("<!doctype html><title>not an image</title>")),
			Request:    req,
		}, nil
	})}
	downloader := NewCreatorImageDownloader(client, 1024)
	downloader.validateURL = func(context.Context, string) error { return nil }

	_, err := downloader.Download(context.Background(), "https://cdn.example.test/result.png")

	require.ErrorIs(t, err, ErrCreatorImageDownloadInvalidContent)
}

func TestValidateCreatorImageDownloadURLRejectsUnsafeTargets(t *testing.T) {
	for _, rawURL := range []string{
		"http://images.example.test/result.png",
		"https://user:password@images.example.test/result.png",
		"https://images.example.test/result.png#fragment",
	} {
		err := validateCreatorImageDownloadURL(context.Background(), rawURL)
		require.ErrorIs(t, err, ErrCreatorImageDownloadInvalidURL, rawURL)
	}

	err := validateCreatorImageDownloadURL(context.Background(), "https://127.0.0.1/result.png")
	require.True(t, errors.Is(err, ErrCreatorImageDownloadBlockedURL))
}

func TestCreatorImageDownloaderStreamLimits(t *testing.T) {
	for _, tc := range []struct {
		name       string
		limit      int64
		size       int
		advertised int64
		wantError  bool
	}{
		{"unknown_over_limit", 600, 601, -1, true},
		{"unknown_exact_limit", 600, 600, -1, false},
		{"limit_smaller_than_probe", 8, 20, -1, true},
		{"advertised_over_limit", 600, 601, 601, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			data := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, tc.size-8)...)
			body := &creatorImageTrackedBody{Reader: bytes.NewReader(data)}
			client := &http.Client{Transport: creatorImageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: body, ContentLength: tc.advertised}, nil
			})}
			d := NewCreatorImageDownloader(client, tc.limit)
			d.validateURL = func(context.Context, string) error { return nil }
			var got []byte
			err := d.Stream(context.Background(), "https://cdn.example.test/result.png", func(_ *http.Response, r io.Reader) error {
				var err error
				got, err = io.ReadAll(r)
				return err
			})
			if tc.wantError {
				require.ErrorIs(t, err, ErrCreatorImageDownloadTooLarge)
			} else {
				require.NoError(t, err)
				require.Equal(t, data, got)
			}
			require.LessOrEqual(t, int64(len(got)), tc.limit)
			require.True(t, body.closed)
		})
	}
}

type creatorImageTrackedBody struct {
	io.Reader
	closed bool
}

func (b *creatorImageTrackedBody) Close() error { b.closed = true; return nil }

func TestCreatorImageDownloaderStreamsBeforeUpstreamCompletes(t *testing.T) {
	upstream, producer := io.Pipe()
	defer upstream.Close()
	defer producer.Close()
	client := &http.Client{Transport: creatorImageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: upstream, ContentLength: -1}, nil
	})}
	d := NewCreatorImageDownloader(client, 2048)
	d.validateURL = func(context.Context, string) error { return nil }
	prefix := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 504)...)
	done := make(chan error, 1)
	started := make(chan []byte, 1)
	go func() {
		done <- d.Stream(context.Background(), "https://cdn.example.test/result.png", func(_ *http.Response, r io.Reader) error {
			initial := make([]byte, 512)
			if _, err := io.ReadFull(r, initial); err != nil {
				return err
			}
			started <- initial
			_, err := io.Copy(io.Discard, r)
			return err
		})
	}()
	_, err := producer.Write(prefix)
	require.NoError(t, err)
	select {
	case got := <-started:
		require.Equal(t, prefix, got)
	case <-time.After(3 * time.Second):
		t.Fatal("stream waits for upstream completion")
	}
	_, err = producer.Write([]byte("tail"))
	require.NoError(t, err)
	require.NoError(t, producer.Close())
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(3 * time.Second):
		t.Fatal("stream did not finish")
	}
}
