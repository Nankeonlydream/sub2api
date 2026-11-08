import { shallowRef } from 'vue'

export interface SeedanceVideoTier {
  resolution: '480p' | '720p' | '1080p'
  minSeconds: number
  maxSeconds: number
  // Set when only specific lengths are sold (e.g. 10 or 30 seconds).
  allowedSeconds?: number[]
  // Per-request tiers charge the group price once; others per second.
  perRequest: boolean
  aspectRatios: string[]
  // False for text-only lines, which refuse reference images.
  supportsUploadedReferences: boolean
  maxReferenceImages: number
  label: string
  // User-facing name and one-line explanation of the upstream line, since the
  // same model is sold on several lines.
  name: string
  note: string
}

const SEEDANCE_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
const ZHONGHENG_RATIOS = ['16:9', '9:16', '1:1']

function tier(resolution: SeedanceVideoTier['resolution'], minSeconds: number, maxSeconds: number, perRequest: boolean, maxReferenceImages: number, label: string, name: string, note: string, allowedSeconds?: number[]): SeedanceVideoTier {
  return { resolution, minSeconds, maxSeconds, perRequest, aspectRatios: SEEDANCE_RATIOS, supportsUploadedReferences: false, maxReferenceImages, label, name, note, ...(allowedSeconds ? { allowedSeconds } : {}) }
}

// Zhongheng sells minSeconds–maxSeconds except the skipped lengths its
// /v1/models duration_options leave out; the gateway uploads Creator images.
function zhTier(resolution: SeedanceVideoTier['resolution'], minSeconds: number, maxSeconds: number, perRequest: boolean, maxReferenceImages: number, name: string, note: string, skipped: number[] = []): SeedanceVideoTier {
  const allowed = skipped.length
    ? Array.from({ length: maxSeconds - minSeconds + 1 }, (_, i) => minSeconds + i).filter(n => !skipped.includes(n))
    : undefined
  return { ...tier(resolution, minSeconds, maxSeconds, perRequest, maxReferenceImages, '纵横', name, note, allowed), aspectRatios: ZHONGHENG_RATIOS, supportsUploadedReferences: true }
}

// Mirrors the backend catalog (backend/internal/service/seedance_video.go).
// Entry order is the Creator Studio list order. label is the upstream's own
// annotation; name/note explain it to users.
export const SEEDANCE_VIDEO_TIERS: Record<string, SeedanceVideoTier> = {
  // Listed first: the cheapest line.
  '00sd2.0': { ...zhTier('720p', 5, 15, true, 9, 'Seedance 2.0 720p · 低价按条', '价格最低；上游提示不要频繁提交，降低频率时成功率高'), allowedSeconds: [5, 10, 15] },
  // Zhongheng /v1/models?include_capabilities=1 observed 2026-10-30. Models
  // offering several resolutions are sold at the highest one.
  'xseadanco2.0': zhTier('720p', 5, 15, true, 9, 'Seedance 2.0 720p · 满血 · 按条', '满血不卡脸，可大并发'),
  'aseedance2.0': zhTier('720p', 5, 15, true, 9, 'Seedance 2.0 720p · 满血 · 全天有货', '满血，全天有货'),
  'xxseadanco2.0m': zhTier('720p', 5, 15, false, 9, 'Seedance 2.0 720p · 满血 · 按秒', '原生不卡脸满血'),
  'ttsedanco2.0-720': zhTier('720p', 5, 15, false, 9, 'Seedance 2.0 720p · 官转 · 按秒', '官转真实满血，原生不卡脸'),
  'a-sd2.0': { ...zhTier('720p', 5, 15, true, 9, 'Seedance 2.0 Fast 720p · 按条', 'Fast 版，原生不卡脸，长期稳定'), allowedSeconds: [5, 10, 15] },
  'fseadanco2.0mini': zhTier('720p', 5, 15, true, 9, 'Seedance 2.0 Mini 720p · 按条', 'Mini 版，稳定大并发'),
  'ttsedanco2.0-480': zhTier('480p', 5, 15, false, 9, 'Seedance 2.0 480p · 官转 · 按秒', '官转真实满血，全天稳定'),
  'sedanco2.0-300秒必出': zhTier('480p', 15, 15, true, 9, 'Seedance 2.0 480p · 300 秒必出', '固定 15 秒，上游承诺 300 秒内出片'),
  'oosd2.5': zhTier('720p', 15, 15, true, 9, 'Seedance 2.5 720p · 固定 15 秒', '含真人面部的内容容易被拦截'),
  'xxseedacn2.5': zhTier('720p', 5, 30, false, 30, 'Seedance 2.5 720p · 满血 · 按秒', '原生不卡脸满血'),
  'ttseadanco2.5-720': zhTier('720p', 5, 30, false, 30, 'Seedance 2.5 720p · 高并发 · 按秒', '原生不卡脸，高并发'),
  'tseadanco2.5-720yt': zhTier('720p', 5, 30, true, 30, 'Seedance 2.5 720p · 满参 · 按条', '原生不卡脸；失败可重新提交', [12]),
  'bbseadanco-720': zhTier('720p', 5, 30, false, 30, 'Seedance 2.5 720p · 卡脸 · 按秒', '含真人面部的内容容易被拦截'),
  'oosd2.5-30秒': zhTier('720p', 30, 30, true, 9, 'Seedance 2.5 720p · 固定 30 秒', '上游测试中'),
  'ttsedanco2.5-480': zhTier('480p', 5, 30, false, 30, 'Seedance 2.5 480p · 稳定 · 按秒', '稳定大并发'),
  'tseadanco2.5-480yt': zhTier('480p', 5, 30, true, 30, 'Seedance 2.5 480p · 满参 · 按条', '原生不卡脸；失败可重新提交', [17]),
  'bbseadanco-480': zhTier('480p', 5, 30, false, 30, 'Seedance 2.5 480p · 卡脸 · 按秒', '含真人面部的内容容易被拦截'),
  '特价seadanco2.5-1080': zhTier('1080p', 5, 30, true, 9, 'Seedance 2.5 1080p · 特价 · 按条', '原生不卡脸；凌晨大并发', [19, 20]),
  'tseadanco2.5-1080yt': zhTier('1080p', 5, 30, true, 30, 'Seedance 2.5 1080p · 满参 · 按条', '原生不卡脸；失败可重新提交'),
  'ttseadanco2.5-1080': zhTier('1080p', 5, 30, false, 30, 'Seedance 2.5 1080p · 稳定 · 按秒', '稳定大并发'),
  'bbseadanco-1080': zhTier('1080p', 5, 30, false, 30, 'Seedance 2.5 1080p · 卡脸 · 按秒', '含真人面部的内容容易被拦截'),
}

// Fallback list when the key's model list cannot be read.
export const SEEDANCE_FALLBACK_MODELS = ['00sd2.0']

// The built-in catalog above applies until an administrator saves their own
// (backend/internal/service/seedance_catalog.go). Maps keep entry order.
const builtinTiers = new Map<string, SeedanceVideoTier>(Object.entries(SEEDANCE_VIDEO_TIERS))
const activeTiers = shallowRef<Map<string, SeedanceVideoTier>>(builtinTiers)

// One model of the saved catalog, as the backend stores and serves it.
export interface SeedanceCatalogEntry {
  model: string
  name: string
  note: string
  resolution: SeedanceVideoTier['resolution']
  min_seconds: number
  max_seconds: number
  allowed_seconds?: number[]
  per_request: boolean
  max_reference_images: number
}

export interface SeedanceCatalogState {
  customized: boolean
  entries: SeedanceCatalogEntry[]
}

export function seedanceEntryToTier(entry: SeedanceCatalogEntry): SeedanceVideoTier {
  const refs = Math.max(0, Number(entry.max_reference_images) || 0)
  return {
    resolution: entry.resolution,
    minSeconds: entry.min_seconds,
    maxSeconds: entry.max_seconds,
    ...(entry.allowed_seconds?.length ? { allowedSeconds: [...entry.allowed_seconds] } : {}),
    perRequest: entry.per_request,
    aspectRatios: ZHONGHENG_RATIOS,
    supportsUploadedReferences: refs > 0,
    maxReferenceImages: refs,
    label: '纵横',
    name: entry.name || entry.model,
    note: entry.note,
  }
}

export function seedanceTierToEntry(model: string, tier: SeedanceVideoTier): SeedanceCatalogEntry {
  return {
    model,
    name: tier.name,
    note: tier.note,
    resolution: tier.resolution,
    min_seconds: tier.minSeconds,
    max_seconds: tier.maxSeconds,
    ...(tier.allowedSeconds?.length ? { allowed_seconds: [...tier.allowedSeconds] } : {}),
    per_request: tier.perRequest,
    max_reference_images: tier.supportsUploadedReferences ? tier.maxReferenceImages : 0,
  }
}

// The built-in catalog in saved form: the starting point for editing.
export function builtinSeedanceCatalogEntries(): SeedanceCatalogEntry[] {
  return [...builtinTiers].map(([model, tier]) => seedanceTierToEntry(model, tier))
}

// Switch the whole app to the saved catalog, or back to the built-in one.
export function applySeedanceCatalog(state: SeedanceCatalogState | null | undefined) {
  activeTiers.value = state?.customized && state.entries?.length
    ? new Map(state.entries.map(entry => [entry.model.toLowerCase(), seedanceEntryToTier(entry)]))
    : builtinTiers
}

// Model IDs and tiers in catalog order. Reactive, so views follow a new catalog.
export function seedanceCatalogModels(): Array<[string, SeedanceVideoTier]> {
  return [...activeTiers.value]
}

export function seedanceFallbackModels(): string[] {
  const first = activeTiers.value.keys().next().value
  return first ? [first] : [...SEEDANCE_FALLBACK_MODELS]
}

// One line under the model picker: what the line is, how it bills, its length.
export function seedanceTierHint(tier: SeedanceVideoTier): string {
  const seconds = tier.allowedSeconds?.length
    ? `${tier.allowedSeconds.join(' / ')} 秒`
    : `${tier.minSeconds}–${tier.maxSeconds} 秒`
  return [
    tier.note,
    tier.perRequest ? '按条计费' : '按秒计费',
    seconds,
    ...(tier.supportsUploadedReferences ? [] : ['仅文生视频']),
  ].join(' · ')
}

export const SEEDANCE_VIDEO_PRICE_FAMILY = 'seedance'

export function seedanceVideoTier(model: string): SeedanceVideoTier | null {
  return activeTiers.value.get(model.trim().replace(/^models\//i, '').toLowerCase()) || null
}

export function isSeedanceVideoModel(model: string): boolean {
  return seedanceVideoTier(model) !== null
}

// Relay catalog models that Grok groups sell (e.g. heavy-grok-720p) belong to
// Creator Studio's Grok tab; the rest of the catalog is Seedance.
export function isGrokRelayVideoModel(model: string): boolean {
  return isSeedanceVideoModel(model) && /grok/i.test(model)
}

// Snap a duration to the tier: clamp to its range, then to the nearest sold
// length in the requested direction when only specific lengths exist.
export function snapSeedanceSeconds(tier: Pick<SeedanceVideoTier, 'minSeconds' | 'maxSeconds' | 'allowedSeconds'>, value: number, direction: -1 | 0 | 1 = 0): number {
  const clamped = Math.max(tier.minSeconds, Math.min(tier.maxSeconds, Math.round(Number(value) || tier.minSeconds)))
  const allowed = tier.allowedSeconds
  if (!allowed?.length || allowed.includes(clamped)) return clamped
  if (direction > 0) return allowed.find(n => n >= clamped) ?? allowed[allowed.length - 1]
  if (direction < 0) return [...allowed].reverse().find(n => n <= clamped) ?? allowed[0]
  return allowed.reduce((best, n) => Math.abs(n - clamped) < Math.abs(best - clamped) ? n : best)
}
