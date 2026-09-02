package service

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

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
