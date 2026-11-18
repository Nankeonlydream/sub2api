package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
)

// The MiniMax-H3 model catalog works like the Seedance one (seedance_catalog.go):
// the built-in tiers (miniMaxH3Tiers) apply until an administrator saves a
// replacement, stored as JSON in the settings table. The saved catalog decides
// which model IDs can be priced, requested and billed; names and notes are
// shown to users in Creator Studio.
const (
	miniMaxCatalogSettingKey  = "minimax_h3_video_catalog_v1"
	miniMaxCatalogMaxEntries  = 100
	miniMaxCatalogMaxSeconds  = 60
	miniMaxCatalogMaxRefImage = 9
)

// MiniMaxCatalogEntry is one relay H3 model ID as sold to Creator Studio users.
// Entry order is the Creator Studio list order.
type MiniMaxCatalogEntry struct {
	Model string `json:"model"`
	Name  string `json:"name"`
	Note  string `json:"note"`
	// Resolution is 768p, 1080p or 1440p (sent upstream as 2k).
	Resolution     string `json:"resolution"`
	MinSeconds     int    `json:"min_seconds"`
	MaxSeconds     int    `json:"max_seconds"`
	AllowedSeconds []int  `json:"allowed_seconds,omitempty"`
	// PerRequest charges the group price once per video; otherwise per second.
	PerRequest bool `json:"per_request"`
	// MaxReferenceImages is how many reference images Creator Studio lets a
	// user attach. Zero means text-to-video only.
	MaxReferenceImages int `json:"max_reference_images"`
	// RequiresReference rejects prompt-only jobs the upstream would fail.
	RequiresReference bool `json:"requires_reference"`
	// AspectRatios in display order; empty means 16:9, 9:16 and 1:1.
	AspectRatios []string `json:"aspect_ratios,omitempty"`
}

var miniMaxCatalogResolutions = []string{"768p", "1080p", "1440p"}

// MiniMaxCatalogState is what the admin panel and Creator Studio read.
// Customized is false while the built-in catalog applies; clients then use
// their own copy of it, which carries the display names and notes.
type MiniMaxCatalogState struct {
	Customized bool                  `json:"customized"`
	Entries    []MiniMaxCatalogEntry `json:"entries"`
}

type miniMaxCatalogSnapshot struct {
	entries []MiniMaxCatalogEntry
	tiers   map[string]miniMaxH3Tier
}

var (
	// activeMiniMaxCatalog is the saved catalog; nil means the built-in tiers.
	activeMiniMaxCatalog atomic.Pointer[miniMaxCatalogSnapshot]
	// miniMaxCatalogMu serializes saves and refreshes, so a refresh that read
	// the database before a save cannot overwrite the saved catalog.
	miniMaxCatalogMu         sync.Mutex
	miniMaxCatalogSource     atomic.Pointer[SettingService]
	miniMaxCatalogSyncedAt   atomic.Int64 // unix nanoseconds
	miniMaxCatalogRefreshing atomic.Bool
)

// refreshMiniMaxCatalogIfStale re-reads the catalog in the background once it
// is older than the Seedance refresh interval, so catalogs saved on another
// node reach this one. No request waits on the database.
func refreshMiniMaxCatalogIfStale() {
	source := miniMaxCatalogSource.Load()
	if source == nil || time.Since(time.Unix(0, miniMaxCatalogSyncedAt.Load())) < seedanceCatalogRefreshInterval {
		return
	}
	if !miniMaxCatalogRefreshing.CompareAndSwap(false, true) {
		return
	}
	go func() {
		defer miniMaxCatalogRefreshing.Store(false)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := source.syncMiniMaxCatalog(ctx); err != nil {
			slog.Warn("minimax_catalog_refresh_failed", "error", err)
		}
	}()
}

func (s *SettingService) syncMiniMaxCatalog(ctx context.Context) error {
	miniMaxCatalogMu.Lock()
	defer miniMaxCatalogMu.Unlock()
	// A failed read also waits a full interval before the next attempt.
	miniMaxCatalogSyncedAt.Store(time.Now().UnixNano())
	state, err := s.GetMiniMaxCatalog(ctx)
	if err != nil {
		return err
	}
	applyMiniMaxCatalogState(state)
	return nil
}

func emptyMiniMaxCatalogState() MiniMaxCatalogState {
	return MiniMaxCatalogState{Entries: []MiniMaxCatalogEntry{}}
}

func (e MiniMaxCatalogEntry) tier() miniMaxH3Tier {
	return miniMaxH3Tier{
		Resolution: e.Resolution, MinSeconds: e.MinSeconds, MaxSeconds: e.MaxSeconds,
		AllowedSeconds: slices.Clone(e.AllowedSeconds), PerRequest: e.PerRequest, RequiresReference: e.RequiresReference,
	}
}

func applyMiniMaxCatalogState(state MiniMaxCatalogState) {
	if !state.Customized {
		activeMiniMaxCatalog.Store(nil)
		return
	}
	tiers := make(map[string]miniMaxH3Tier, len(state.Entries))
	for _, entry := range state.Entries {
		tiers[entry.Model] = entry.tier()
	}
	activeMiniMaxCatalog.Store(&miniMaxCatalogSnapshot{entries: slices.Clone(state.Entries), tiers: tiers})
}

// CurrentMiniMaxCatalog reports the catalog this process is using. It reads
// memory only, so Creator Studio can call it freely.
func CurrentMiniMaxCatalog() MiniMaxCatalogState {
	refreshMiniMaxCatalogIfStale()
	snapshot := activeMiniMaxCatalog.Load()
	if snapshot == nil {
		return emptyMiniMaxCatalogState()
	}
	return MiniMaxCatalogState{Customized: true, Entries: slices.Clone(snapshot.entries)}
}

func miniMaxCatalogError(index int, format string, args ...any) error {
	return infraerrors.BadRequest("INVALID_MINIMAX_CATALOG", fmt.Sprintf("entry %d: %s", index+1, fmt.Sprintf(format, args...)))
}

// NormalizeMiniMaxCatalog validates and canonicalizes an administrator's
// catalog. Model IDs are lowercased because lookups are case-insensitive.
func NormalizeMiniMaxCatalog(in []MiniMaxCatalogEntry) ([]MiniMaxCatalogEntry, error) {
	if len(in) == 0 {
		return nil, infraerrors.BadRequest("INVALID_MINIMAX_CATALOG", "catalog must contain at least one model; reset it to restore the built-in catalog")
	}
	if len(in) > miniMaxCatalogMaxEntries {
		return nil, infraerrors.BadRequest("INVALID_MINIMAX_CATALOG", fmt.Sprintf("catalog supports at most %d models", miniMaxCatalogMaxEntries))
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]MiniMaxCatalogEntry, 0, len(in))
	for i, entry := range in {
		entry.Model = strings.ToLower(strings.TrimSpace(entry.Model))
		if !validAPIKeyModelID(entry.Model) {
			return nil, miniMaxCatalogError(i, "model ID must contain 1 to 200 bytes without whitespace or control characters")
		}
		if IsSeedanceVideoModel(entry.Model) {
			return nil, miniMaxCatalogError(i, "model ID %q belongs to the Seedance relay", entry.Model)
		}
		if _, dup := seen[entry.Model]; dup {
			return nil, miniMaxCatalogError(i, "model ID %q is listed twice", entry.Model)
		}
		seen[entry.Model] = struct{}{}

		entry.Name, entry.Note = strings.TrimSpace(entry.Name), strings.TrimSpace(entry.Note)
		if utf8.RuneCountInString(entry.Name) > seedanceCatalogMaxNameRunes {
			return nil, miniMaxCatalogError(i, "name must be at most %d characters", seedanceCatalogMaxNameRunes)
		}
		if utf8.RuneCountInString(entry.Note) > seedanceCatalogMaxNoteRunes {
			return nil, miniMaxCatalogError(i, "description must be at most %d characters", seedanceCatalogMaxNoteRunes)
		}

		entry.Resolution = strings.ToLower(strings.TrimSpace(entry.Resolution))
		if entry.Resolution == "2k" {
			entry.Resolution = "1440p"
		}
		if !slices.Contains(miniMaxCatalogResolutions, entry.Resolution) {
			return nil, miniMaxCatalogError(i, "resolution must be 768p, 1080p or 1440p")
		}

		if len(entry.AllowedSeconds) > 0 {
			allowed := slices.Clone(entry.AllowedSeconds)
			slices.Sort(allowed)
			allowed = slices.Compact(allowed)
			if allowed[0] < 1 || allowed[len(allowed)-1] > miniMaxCatalogMaxSeconds {
				return nil, miniMaxCatalogError(i, "allowed seconds must be between 1 and %d", miniMaxCatalogMaxSeconds)
			}
			entry.MinSeconds, entry.MaxSeconds = allowed[0], allowed[len(allowed)-1]
			// A list with no gaps is just a range.
			entry.AllowedSeconds = nil
			if len(allowed) != entry.MaxSeconds-entry.MinSeconds+1 {
				entry.AllowedSeconds = allowed
			}
		} else if entry.MinSeconds < 1 || entry.MaxSeconds < entry.MinSeconds || entry.MaxSeconds > miniMaxCatalogMaxSeconds {
			return nil, miniMaxCatalogError(i, "seconds must satisfy 1 <= min <= max <= %d", miniMaxCatalogMaxSeconds)
		}

		if entry.MaxReferenceImages < 0 || entry.MaxReferenceImages > miniMaxCatalogMaxRefImage {
			return nil, miniMaxCatalogError(i, "reference images must be between 0 and %d", miniMaxCatalogMaxRefImage)
		}
		if entry.RequiresReference && entry.MaxReferenceImages == 0 {
			return nil, miniMaxCatalogError(i, "a model that requires a reference image must accept at least one")
		}

		var ratios []string
		for _, ratio := range entry.AspectRatios {
			ratio = strings.TrimSpace(ratio)
			if !slices.Contains(seedanceCatalogAspectRatios, ratio) {
				return nil, miniMaxCatalogError(i, "aspect ratio %q must be one of %s", ratio, strings.Join(seedanceCatalogAspectRatios, ", "))
			}
			if !slices.Contains(ratios, ratio) {
				ratios = append(ratios, ratio)
			}
		}
		entry.AspectRatios = ratios
		out = append(out, entry)
	}
	return out, nil
}

// GetMiniMaxCatalog reads the saved catalog from the database.
func (s *SettingService) GetMiniMaxCatalog(ctx context.Context) (MiniMaxCatalogState, error) {
	value, err := s.settingRepo.GetValue(ctx, miniMaxCatalogSettingKey)
	if errors.Is(err, ErrSettingNotFound) || (err == nil && strings.TrimSpace(value) == "") {
		return emptyMiniMaxCatalogState(), nil
	}
	if err != nil {
		return emptyMiniMaxCatalogState(), err
	}
	var entries []MiniMaxCatalogEntry
	if err := json.Unmarshal([]byte(value), &entries); err != nil {
		return emptyMiniMaxCatalogState(), fmt.Errorf("invalid MiniMax catalog setting: %w", err)
	}
	entries, err = NormalizeMiniMaxCatalog(entries)
	if err != nil {
		return emptyMiniMaxCatalogState(), err
	}
	return MiniMaxCatalogState{Customized: true, Entries: entries}, nil
}

// SetMiniMaxCatalog saves the catalog and applies it to this process at once.
func (s *SettingService) SetMiniMaxCatalog(ctx context.Context, entries []MiniMaxCatalogEntry) (MiniMaxCatalogState, error) {
	entries, err := NormalizeMiniMaxCatalog(entries)
	if err != nil {
		return emptyMiniMaxCatalogState(), err
	}
	raw, err := json.Marshal(entries)
	if err != nil {
		return emptyMiniMaxCatalogState(), err
	}
	miniMaxCatalogMu.Lock()
	defer miniMaxCatalogMu.Unlock()
	if err := s.settingRepo.Set(ctx, miniMaxCatalogSettingKey, string(raw)); err != nil {
		return emptyMiniMaxCatalogState(), err
	}
	state := MiniMaxCatalogState{Customized: true, Entries: entries}
	applyMiniMaxCatalogState(state)
	return state, nil
}

// ResetMiniMaxCatalog removes the saved catalog so the built-in one applies.
func (s *SettingService) ResetMiniMaxCatalog(ctx context.Context) (MiniMaxCatalogState, error) {
	miniMaxCatalogMu.Lock()
	defer miniMaxCatalogMu.Unlock()
	if err := s.settingRepo.Delete(ctx, miniMaxCatalogSettingKey); err != nil && !errors.Is(err, ErrSettingNotFound) {
		return emptyMiniMaxCatalogState(), err
	}
	state := emptyMiniMaxCatalogState()
	applyMiniMaxCatalogState(state)
	return state, nil
}

// LoadMiniMaxCatalog applies the saved catalog at startup, before requests are
// served: while a custom model ID is unknown, group prices for it are dropped
// whenever a group is read.
func (s *SettingService) LoadMiniMaxCatalog(ctx context.Context) error {
	state, err := s.GetMiniMaxCatalog(ctx)
	if err != nil {
		return err
	}
	miniMaxCatalogMu.Lock()
	defer miniMaxCatalogMu.Unlock()
	applyMiniMaxCatalogState(state)
	miniMaxCatalogSyncedAt.Store(time.Now().UnixNano())
	miniMaxCatalogSource.Store(s)
	return nil
}
