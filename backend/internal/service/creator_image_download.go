package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/servertiming"
)

const (
	defaultCreatorImageDownloadMaxBytes = 32 << 20
	creatorImageDownloadTimeout         = 60 * time.Second
	creatorImageDownloadMaxRedirects    = 3
)

var (
	ErrCreatorImageDownloadInvalidURL     = errors.New("invalid creator image URL")
	ErrCreatorImageDownloadBlockedURL     = errors.New("creator image URL is not publicly routable")
	ErrCreatorImageDownloadFailed         = errors.New("creator image download failed")
	ErrCreatorImageDownloadTooLarge       = errors.New("creator image is too large")
	ErrCreatorImageDownloadInvalidContent = errors.New("creator image response is not a supported image")
)

type CreatorImageDownload struct {
	Data        []byte
	ContentType string
	Extension   string
}

type CreatorImageDownloader struct {
	client      *http.Client
	maxBytes    int64
	validateURL func(context.Context, string) error
}

func NewCreatorImageDownloader(client *http.Client, maxBytes int64) *CreatorImageDownloader {
	if maxBytes <= 0 {
		maxBytes = defaultCreatorImageDownloadMaxBytes
	}
	downloader := &CreatorImageDownloader{
		maxBytes:    maxBytes,
		validateURL: validateCreatorImageDownloadURL,
	}
	if client == nil {
		transport := &http.Transport{
			DialContext:         safeDialContext,
			ForceAttemptHTTP2:   true,
			MaxIdleConns:        16,
			IdleConnTimeout:     90 * time.Second,
			TLSHandshakeTimeout: 10 * time.Second,
		}
		client = &http.Client{
			Timeout:   creatorImageDownloadTimeout,
			Transport: servertiming.WrapRoundTripper(transport),
		}
	}
	clientCopy := *client
	previousRedirectPolicy := client.CheckRedirect
	clientCopy.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) > creatorImageDownloadMaxRedirects {
			return fmt.Errorf("%w: too many redirects", ErrCreatorImageDownloadFailed)
		}
		if err := downloader.validateURL(req.Context(), req.URL.String()); err != nil {
			return err
		}
		if previousRedirectPolicy != nil {
			return previousRedirectPolicy(req, via)
		}
		return nil
	}
	downloader.client = &clientCopy
	return downloader
}

func (d *CreatorImageDownloader) Download(ctx context.Context, rawURL string) (*CreatorImageDownload, error) {
	if d == nil {
		return nil, ErrCreatorImageDownloadFailed
	}
	if err := d.validateURL(ctx, rawURL); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, ErrCreatorImageDownloadInvalidURL
	}
	req.Header.Set("Accept", "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1")

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCreatorImageDownloadFailed, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("%w: upstream returned HTTP %d", ErrCreatorImageDownloadFailed, resp.StatusCode)
	}
	if resp.ContentLength > d.maxBytes {
		return nil, ErrCreatorImageDownloadTooLarge
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, d.maxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCreatorImageDownloadFailed, err)
	}
	if int64(len(data)) > d.maxBytes {
		return nil, ErrCreatorImageDownloadTooLarge
	}
	if len(data) == 0 {
		return nil, ErrCreatorImageDownloadInvalidContent
	}
	contentType, extension := creatorImageContentType(data, resp.Header.Get("Content-Type"))
	if contentType == "" {
		return nil, ErrCreatorImageDownloadInvalidContent
	}
	return &CreatorImageDownload{Data: data, ContentType: contentType, Extension: extension}, nil
}

func validateCreatorImageDownloadURL(ctx context.Context, rawURL string) error {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" {
		return ErrCreatorImageDownloadInvalidURL
	}
	blocked, err := isPrivateOrLoopbackHost(ctx, parsed.Hostname())
	if err != nil {
		return fmt.Errorf("%w: hostname could not be resolved", ErrCreatorImageDownloadFailed)
	}
	if blocked {
		return ErrCreatorImageDownloadBlockedURL
	}
	return nil
}

func creatorImageContentType(data []byte, declared string) (string, string) {
	detected := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(data), ";")[0]))
	declared = strings.ToLower(strings.TrimSpace(strings.Split(declared, ";")[0]))
	if contentType, extension, ok := supportedCreatorImageType(detected); ok {
		return contentType, extension
	}
	if detected == "application/octet-stream" {
		if contentType, extension, ok := supportedCreatorImageType(declared); ok {
			return contentType, extension
		}
	}
	return "", ""
}

func supportedCreatorImageType(contentType string) (string, string, bool) {
	switch contentType {
	case "image/png":
		return contentType, "png", true
	case "image/jpeg":
		return contentType, "jpg", true
	case "image/webp":
		return contentType, "webp", true
	case "image/gif":
		return contentType, "gif", true
	case "image/avif":
		return contentType, "avif", true
	default:
		return "", "", false
	}
}
