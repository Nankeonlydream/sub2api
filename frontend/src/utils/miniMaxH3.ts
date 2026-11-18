import { shallowRef } from 'vue'

export interface MiniMaxH3Tier {
  resolution: '768p' | '1080p' | '1440p'
  minSeconds: number
  maxSeconds: number
  allowedSeconds?: number[]
  // Per-request tiers charge the group price once; others per second.
  perRequest: boolean
  aspectRatios: string[]
  maxReferenceImages: number
  // The upstream fails prompt-only jobs, so text-to-video is not offered.
  requiresReference: boolean
  // User-facing name and one-line explanation, both editable by the admin.
  name: string
  note: string
  // Name shown in history and pricing (same as name; kept for callers).
  label: string
  optionLabel: string
}

// Ratios an administrator may list (the backend checks the same set).
export const MINIMAX_H3_CATALOG_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '3:2', '2:3']
export const MINIMAX_H3_RESOLUTIONS: MiniMaxH3Tier['resolution'][] = ['768p', '1080p', '1440p']
const DEFAULT_RATIOS = ['16:9', '9:16', '1:1']
export const MINIMAX_H3_ASPECT_RATIOS = DEFAULT_RATIOS
export const MINIMAX_H3_MAX_REFERENCE_IMAGES = 9

// One model of the saved catalog, as the backend stores and serves it
// (backend/internal/service/minimax_catalog.go).
export interface MiniMaxCatalogEntry {
  model: string
  name: string
  note: string
  resolution: MiniMaxH3Tier['resolution']
  min_seconds: number
  max_seconds: number
  allowed_seconds?: number[]
  per_request: boolean
  max_reference_images: number
  requires_reference: boolean
  // Empty or missing means the default 16:9, 9:16 and 1:1.
  aspect_ratios?: string[]
}

export interface MiniMaxCatalogState {
  customized: boolean
  entries: MiniMaxCatalogEntry[]
}

// Built-in catalog, mirroring miniMaxH3Tiers in the backend: Zhongheng
// /v1/models?include_capabilities=1 observed 2026-10-30. Order is the Creator
// Studio list order.
const BUILTIN_ENTRIES: MiniMaxCatalogEntry[] = [
  { model: 'minimaxh3-768', name: 'MiniMax H3 标清版 768p · 高速并发', note: '高速并发', resolution: '768p', min_seconds: 5, max_seconds: 15, allowed_seconds: [5, 6, 7, 9, 10, 11, 12, 13, 14, 15], per_request: true, max_reference_images: 9, requires_reference: true },
  { model: 'xminimex-h3', name: 'MiniMax H3 高清版 2K · 原生不卡脸', note: '原生不卡脸', resolution: '1440p', min_seconds: 5, max_seconds: 15, per_request: false, max_reference_images: 9, requires_reference: false },
]

export function miniMaxEntryToTier(entry: MiniMaxCatalogEntry): MiniMaxH3Tier {
  const name = entry.name || entry.model
  return {
    resolution: entry.resolution,
    minSeconds: entry.min_seconds,
    maxSeconds: entry.max_seconds,
    ...(entry.allowed_seconds?.length ? { allowedSeconds: [...entry.allowed_seconds] } : {}),
    perRequest: entry.per_request,
    aspectRatios: entry.aspect_ratios?.length ? [...entry.aspect_ratios] : DEFAULT_RATIOS,
    maxReferenceImages: Math.max(0, Number(entry.max_reference_images) || 0),
    requiresReference: entry.requires_reference,
    name,
    note: entry.note,
    label: name,
    optionLabel: name,
  }
}

const builtinTiers = new Map(BUILTIN_ENTRIES.map(entry => [entry.model, miniMaxEntryToTier(entry)]))
const activeTiers = shallowRef<Map<string, MiniMaxH3Tier>>(builtinTiers)

// The built-in catalog in saved form: the starting point for editing.
export function builtinMiniMaxCatalogEntries(): MiniMaxCatalogEntry[] {
  return BUILTIN_ENTRIES.map(entry => ({ ...entry, ...(entry.allowed_seconds ? { allowed_seconds: [...entry.allowed_seconds] } : {}) }))
}

// Switch the whole app to the saved catalog, or back to the built-in one.
export function applyMiniMaxCatalog(state: MiniMaxCatalogState | null | undefined) {
  activeTiers.value = state?.customized && state.entries?.length
    ? new Map(state.entries.map(entry => [entry.model.toLowerCase(), miniMaxEntryToTier(entry)]))
    : builtinTiers
}

// Model IDs and tiers in catalog order. Reactive, so views follow a new catalog.
export function miniMaxCatalogModels(): Array<[string, MiniMaxH3Tier]> {
  return [...activeTiers.value]
}

export function miniMaxFallbackModels(): string[] {
  const first = activeTiers.value.keys().next().value
  return first ? [first] : []
}

export function miniMaxH3Tier(model: string): MiniMaxH3Tier | null {
  return activeTiers.value.get(model.trim().replace(/^models\//i, '').toLowerCase()) || null
}

export function isMiniMaxH3Model(model: string): boolean {
  return miniMaxH3Tier(model) !== null
}

// Retired DeepKey IDs (e.g. MiniMax-H3-933-1440p-10-15s) still name old works.
export function isLegacyMiniMaxH3Model(model: string): boolean {
  return /^minimax-h3-/i.test(model.trim().replace(/^models\//i, ''))
}

// One line under the model picker: the note, how it bills, its lengths.
export function miniMaxTierHint(tier: MiniMaxH3Tier): string {
  const seconds = tier.allowedSeconds?.length
    ? `${tier.allowedSeconds.join(' / ')} 秒`
    : `${tier.minSeconds}–${tier.maxSeconds} 秒`
  return [
    tier.note,
    tier.perRequest ? '按条计费' : '按秒计费',
    seconds,
    ...(tier.requiresReference ? ['需参考图'] : tier.maxReferenceImages ? [] : ['仅文生视频']),
  ].filter(Boolean).join(' · ')
}
