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

// The Seedance model catalog is built in (seedanceVideoTiers), but upstreams
// rename, add and retire models without notice. An administrator can replace
// the whole catalog from the admin panel. The replacement is stored as JSON in
// the settings table and, once saved or loaded at startup, decides which model
// IDs can be priced, requested and billed. Names and notes are shown to users
// in Creator Studio.
const (
	seedanceCatalogSettingKey         = "seedance_video_catalog_v1"
	seedanceCatalogMaxEntries         = 200
	seedanceCatalogMaxSeconds         = 120
	seedanceCatalogMaxReferenceImages = 100
	seedanceCatalogMaxNameRunes       = 100
	seedanceCatalogMaxNoteRunes       = 300
)

// SeedanceCatalogEntry is one relay model ID as sold to Creator Studio users.
// Entry order is the Creator Studio list order.
type SeedanceCatalogEntry struct {
	Model string `json:"model"`
	Name  string `json:"name"`
	Note  string `json:"note"`
	// Resolution is 480p, 720p or 1080p: the relay fixes it per model ID.
	Resolution string `json:"resolution"`
	MinSeconds int    `json:"min_seconds"`
	MaxSeconds int    `json:"max_seconds"`
	// AllowedSeconds lists the only lengths sold when they are not every second
	// from MinSeconds to MaxSeconds.
	AllowedSeconds []int `json:"allowed_seconds,omitempty"`
	// PerRequest charges the group price once per video; otherwise per second.
	PerRequest bool `json:"per_request"`
	// MaxReferenceImages is how many reference images Creator Studio lets a
	// user attach. Zero means the model only does text-to-video.
	MaxReferenceImages int `json:"max_reference_images"`
}

// SeedanceCatalogState is what the admin panel and Creator Studio read.
// Customized is false while the built-in catalog applies; clients then use
// their own copy of it, which carries the display names and notes.
type SeedanceCatalogState struct {
	Customized bool                   `json:"customized"`
	Entries    []SeedanceCatalogEntry `json:"entries"`
}

type seedanceCatalogSnapshot struct {
	entries []SeedanceCatalogEntry
	tiers   map[string]seedanceVideoTier
}

// seedanceCatalogRefreshInterval bounds how long another node can lag behind a
// saved catalog, like the other cached settings.
const seedanceCatalogRefreshInterval = 30 * time.Second

var (
	// activeSeedanceCatalog is the saved catalog. Nil means the built-in
	// seedanceVideoTiers apply.
	activeSeedanceCatalog atomic.Pointer[seedanceCatalogSnapshot]
	// seedanceCatalogMu serializes saves and refreshes, so a refresh that read
	// the database before a save cannot overwrite the saved catalog.
	seedanceCatalogMu sync.Mutex
	// seedanceCatalogSource keeps this process in step with catalogs saved by
	// other nodes. Nil until LoadSeedanceCatalog runs.
	seedanceCatalogSource     atomic.Pointer[SettingService]
	seedanceCatalogSyncedAt   atomic.Int64 // unix nanoseconds
	seedanceCatalogRefreshing atomic.Bool
)

// refreshSeedanceCatalogIfStale re-reads the catalog in the background once it
// is older than the interval. Callers keep using the current catalog meanwhile,
// so no request waits on the database.
func refreshSeedanceCatalogIfStale() {
	source := seedanceCatalogSource.Load()
	if source == nil || time.Since(time.Unix(0, seedanceCatalogSyncedAt.Load())) < seedanceCatalogRefreshInterval {
		return
	}
	if !seedanceCatalogRefreshing.CompareAndSwap(false, true) {
		return
	}
	go func() {
		defer seedanceCatalogRefreshing.Store(false)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := source.syncSeedanceCatalog(ctx); err != nil {
			slog.Warn("seedance_catalog_refresh_failed", "error", err)
		}
	}()
}

// syncSeedanceCatalog applies whatever the database holds. On a read error the
// current catalog stays in force.
func (s *SettingService) syncSeedanceCatalog(ctx context.Context) error {
	seedanceCatalogMu.Lock()
	defer seedanceCatalogMu.Unlock()
	// A failed read also waits a full interval before the next attempt.
	seedanceCatalogSyncedAt.Store(time.Now().UnixNano())
	state, err := s.GetSeedanceCatalog(ctx)
	if err != nil {
		return err
	}
	if state.Customized {
		applySeedanceCatalog(state.Entries)
	} else {
		applySeedanceCatalog(nil)
	}
	return nil
}

func emptySeedanceCatalogState() SeedanceCatalogState {
	return SeedanceCatalogState{Entries: []SeedanceCatalogEntry{}}
}

func (e SeedanceCatalogEntry) tier() seedanceVideoTier {
	return seedanceVideoTier{
		Resolution: e.Resolution, MinSeconds: e.MinSeconds, MaxSeconds: e.MaxSeconds,
		AllowedSeconds: slices.Clone(e.AllowedSeconds), PerRequest: e.PerRequest, Zhongheng: true,
	}
}

// applySeedanceCatalog makes entries (already normalized) the active catalog,
// or restores the built-in one when entries is nil.
func applySeedanceCatalog(entries []SeedanceCatalogEntry) {
	if entries == nil {
		activeSeedanceCatalog.Store(nil)
		return
	}
	tiers := make(map[string]seedanceVideoTier, len(entries))
	for _, entry := range entries {
		tiers[entry.Model] = entry.tier()
	}
	activeSeedanceCatalog.Store(&seedanceCatalogSnapshot{entries: slices.Clone(entries), tiers: tiers})
}

// CurrentSeedanceCatalog reports the catalog this process is using. It reads
// memory only, so Creator Studio can call it freely.
func CurrentSeedanceCatalog() SeedanceCatalogState {
	refreshSeedanceCatalogIfStale()
	snapshot := activeSeedanceCatalog.Load()
	if snapshot == nil {
		return emptySeedanceCatalogState()
	}
	return SeedanceCatalogState{Customized: true, Entries: slices.Clone(snapshot.entries)}
}

func seedanceCatalogError(index int, format string, args ...any) error {
	return infraerrors.BadRequest("INVALID_SEEDANCE_CATALOG", fmt.Sprintf("entry %d: %s", index+1, fmt.Sprintf(format, args...)))
}

// NormalizeSeedanceCatalog validates and canonicalizes an administrator's
// catalog. Model IDs are lowercased because lookups are case-insensitive.
func NormalizeSeedanceCatalog(in []SeedanceCatalogEntry) ([]SeedanceCatalogEntry, error) {
	if len(in) == 0 {
		return nil, infraerrors.BadRequest("INVALID_SEEDANCE_CATALOG", "catalog must contain at least one model; reset it to restore the built-in catalog")
	}
	if len(in) > seedanceCatalogMaxEntries {
		return nil, infraerrors.BadRequest("INVALID_SEEDANCE_CATALOG", fmt.Sprintf("catalog supports at most %d models", seedanceCatalogMaxEntries))
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]SeedanceCatalogEntry, 0, len(in))
	for i, entry := range in {
		entry.Model = strings.ToLower(strings.TrimSpace(entry.Model))
		if !validAPIKeyModelID(entry.Model) {
			return nil, seedanceCatalogError(i, "model ID must contain 1 to 200 bytes without whitespace or control characters")
		}
		if _, isH3 := lookupMiniMaxH3Tier(entry.Model); isH3 {
			return nil, seedanceCatalogError(i, "model ID %q belongs to the MiniMax-H3 relay", entry.Model)
		}
		if _, dup := seen[entry.Model]; dup {
			return nil, seedanceCatalogError(i, "model ID %q is listed twice", entry.Model)
		}
		seen[entry.Model] = struct{}{}

		entry.Name, entry.Note = strings.TrimSpace(entry.Name), strings.TrimSpace(entry.Note)
		if utf8.RuneCountInString(entry.Name) > seedanceCatalogMaxNameRunes {
			return nil, seedanceCatalogError(i, "name must be at most %d characters", seedanceCatalogMaxNameRunes)
		}
		if utf8.RuneCountInString(entry.Note) > seedanceCatalogMaxNoteRunes {
			return nil, seedanceCatalogError(i, "description must be at most %d characters", seedanceCatalogMaxNoteRunes)
		}

		resolution, ok := LookupVideoBillingResolution(entry.Resolution)
		if !ok {
			return nil, seedanceCatalogError(i, "resolution must be 480p, 720p or 1080p")
		}
		entry.Resolution = resolution

		if len(entry.AllowedSeconds) > 0 {
			allowed := slices.Clone(entry.AllowedSeconds)
			slices.Sort(allowed)
			allowed = slices.Compact(allowed)
			if allowed[0] < 1 || allowed[len(allowed)-1] > seedanceCatalogMaxSeconds {
				return nil, seedanceCatalogError(i, "allowed seconds must be between 1 and %d", seedanceCatalogMaxSeconds)
			}
			entry.MinSeconds, entry.MaxSeconds = allowed[0], allowed[len(allowed)-1]
			// A list with no gaps is just a range.
			entry.AllowedSeconds = nil
			if len(allowed) != entry.MaxSeconds-entry.MinSeconds+1 {
				entry.AllowedSeconds = allowed
			}
		} else if entry.MinSeconds < 1 || entry.MaxSeconds < entry.MinSeconds || entry.MaxSeconds > seedanceCatalogMaxSeconds {
			return nil, seedanceCatalogError(i, "seconds must satisfy 1 <= min <= max <= %d", seedanceCatalogMaxSeconds)
		}

		if entry.MaxReferenceImages < 0 || entry.MaxReferenceImages > seedanceCatalogMaxReferenceImages {
			return nil, seedanceCatalogError(i, "reference images must be between 0 and %d", seedanceCatalogMaxReferenceImages)
		}
		out = append(out, entry)
	}
	return out, nil
}

// GetSeedanceCatalog reads the saved catalog from the database.
func (s *SettingService) GetSeedanceCatalog(ctx context.Context) (SeedanceCatalogState, error) {
	value, err := s.settingRepo.GetValue(ctx, seedanceCatalogSettingKey)
	if errors.Is(err, ErrSettingNotFound) || (err == nil && strings.TrimSpace(value) == "") {
		return emptySeedanceCatalogState(), nil
	}
	if err != nil {
		return emptySeedanceCatalogState(), err
	}
	var entries []SeedanceCatalogEntry
	if err := json.Unmarshal([]byte(value), &entries); err != nil {
		return emptySeedanceCatalogState(), fmt.Errorf("invalid Seedance catalog setting: %w", err)
	}
	entries, err = NormalizeSeedanceCatalog(entries)
	if err != nil {
		return emptySeedanceCatalogState(), err
	}
	return SeedanceCatalogState{Customized: true, Entries: entries}, nil
}

// SetSeedanceCatalog saves the catalog and applies it to this process at once.
func (s *SettingService) SetSeedanceCatalog(ctx context.Context, entries []SeedanceCatalogEntry) (SeedanceCatalogState, error) {
	entries, err := NormalizeSeedanceCatalog(entries)
	if err != nil {
		return emptySeedanceCatalogState(), err
	}
	raw, err := json.Marshal(entries)
	if err != nil {
		return emptySeedanceCatalogState(), err
	}
	seedanceCatalogMu.Lock()
	defer seedanceCatalogMu.Unlock()
	if err := s.settingRepo.Set(ctx, seedanceCatalogSettingKey, string(raw)); err != nil {
		return emptySeedanceCatalogState(), err
	}
	applySeedanceCatalog(entries)
	return SeedanceCatalogState{Customized: true, Entries: entries}, nil
}

// ResetSeedanceCatalog removes the saved catalog so the built-in one applies.
func (s *SettingService) ResetSeedanceCatalog(ctx context.Context) (SeedanceCatalogState, error) {
	seedanceCatalogMu.Lock()
	defer seedanceCatalogMu.Unlock()
	if err := s.settingRepo.Delete(ctx, seedanceCatalogSettingKey); err != nil && !errors.Is(err, ErrSettingNotFound) {
		return emptySeedanceCatalogState(), err
	}
	applySeedanceCatalog(nil)
	return emptySeedanceCatalogState(), nil
}

// LoadSeedanceCatalog applies the saved catalog at startup, before requests are
// served: while a custom model ID is unknown, group prices for it are dropped
// whenever a group is read.
func (s *SettingService) LoadSeedanceCatalog(ctx context.Context) error {
	state, err := s.GetSeedanceCatalog(ctx)
	if err != nil {
		return err
	}
	seedanceCatalogMu.Lock()
	defer seedanceCatalogMu.Unlock()
	if state.Customized {
		applySeedanceCatalog(state.Entries)
	} else {
		applySeedanceCatalog(nil)
	}
	// From here on, CurrentSeedanceCatalog re-reads the database every interval
	// so catalogs saved on other nodes reach this one.
	seedanceCatalogSyncedAt.Store(time.Now().UnixNano())
	seedanceCatalogSource.Store(s)
	return nil
}
