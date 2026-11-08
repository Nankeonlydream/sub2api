import { afterEach, describe, expect, it } from 'vitest'
import {
  applySeedanceCatalog,
  builtinSeedanceCatalogEntries,
  isGrokRelayVideoModel,
  isSeedanceVideoModel,
  seedanceCatalogModels,
  seedanceFallbackModels,
  seedanceVideoTier,
  SEEDANCE_VIDEO_TIERS,
} from '../seedanceVideo'

const custom = {
  customized: true,
  entries: [
    { model: 'New-Model-1', name: '新模型', note: '上游新增', resolution: '1080p' as const, min_seconds: 4, max_seconds: 12, per_request: true, max_reference_images: 0 },
    { model: 'second', name: '', note: '', resolution: '480p' as const, min_seconds: 5, max_seconds: 15, allowed_seconds: [5, 10, 15], per_request: false, max_reference_images: 9 },
  ],
}

describe('Seedance catalog', () => {
  afterEach(() => applySeedanceCatalog(null))

  it('uses the built-in catalog until a saved one is applied', () => {
    expect(seedanceCatalogModels().map(([model]) => model)).toEqual(Object.keys(SEEDANCE_VIDEO_TIERS))
    expect(isSeedanceVideoModel('00sd2.0')).toBe(true)
  })

  it('assigns relay Grok lines to the Grok tab', () => {
    applySeedanceCatalog({ customized: true, entries: [
      ...custom.entries,
      { model: 'heavy-grok-720p', name: 'Grok Heavy', note: '', resolution: '720p' as const, min_seconds: 4, max_seconds: 15, per_request: false, max_reference_images: 6 },
    ] })
    expect(isGrokRelayVideoModel('heavy-grok-720P')).toBe(true)
    expect(isGrokRelayVideoModel('second')).toBe(false)
    // Native xAI models are not relay catalog lines.
    expect(isGrokRelayVideoModel('grok-imagine-video')).toBe(false)
  })

  it('replaces the catalog, keeping its order, names and limits', () => {
    applySeedanceCatalog(custom)
    expect(seedanceCatalogModels().map(([model]) => model)).toEqual(['new-model-1', 'second'])
    expect(isSeedanceVideoModel('00sd2.0')).toBe(false)
    const tier = seedanceVideoTier('NEW-MODEL-1')!
    expect(tier).toMatchObject({ name: '新模型', note: '上游新增', resolution: '1080p', perRequest: true, supportsUploadedReferences: false })
    expect(seedanceVideoTier('second')).toMatchObject({ name: 'second', allowedSeconds: [5, 10, 15], maxReferenceImages: 9, supportsUploadedReferences: true })
    expect(seedanceFallbackModels()).toEqual(['new-model-1'])
  })

  it('returns to the built-in catalog when not customized', () => {
    applySeedanceCatalog(custom)
    applySeedanceCatalog({ customized: false, entries: [] })
    expect(isSeedanceVideoModel('00sd2.0')).toBe(true)
  })

  it('exports the built-in catalog in the saved shape', () => {
    const entries = builtinSeedanceCatalogEntries()
    expect(entries).toHaveLength(Object.keys(SEEDANCE_VIDEO_TIERS).length)
    expect(entries[0]).toMatchObject({ model: '00sd2.0', per_request: true, allowed_seconds: [5, 10, 15], max_reference_images: 9 })
  })
})
