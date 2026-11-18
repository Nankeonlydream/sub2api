import { describe, expect, it } from 'vitest'
import { orderImageFallbackModels } from '../imageFallbackModels'

const image2Models = [
  'gpt-image-2',
  'gpt-image-2-超分',
  'gpt-image-2.5',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-flare-超分',
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-sunburst-超分',
  'gpt-image-2.5-超分',
  'gpt-image-2.6',
  'gpt-image-2.6-flare',
  'gpt-image-2.6-flare-超分',
  'gpt-image-2.6-sunburst',
  'gpt-image-2.6-sunburst-超分',
  'gpt-image-2.6-超分',
]

describe('orderImageFallbackModels', () => {
  it('tries the same series first, then every other model of the list', () => {
    expect(orderImageFallbackModels('gpt-image-2.6-flare', image2Models)).toEqual([
      'gpt-image-2.6',
      'gpt-image-2.6-sunburst',
      'gpt-image-2.6-flare-超分',
      'gpt-image-2.6-sunburst-超分',
      'gpt-image-2.6-超分',
      'gpt-image-2.5-flare',
      'gpt-image-2.5',
      'gpt-image-2.5-sunburst',
      'gpt-image-2',
      'gpt-image-2.5-flare-超分',
      'gpt-image-2.5-sunburst-超分',
      'gpt-image-2.5-超分',
      'gpt-image-2-超分',
    ])
  })

  it('keeps the upscale setting of the selected model before switching it', () => {
    expect(orderImageFallbackModels('gpt-image-2-超分', image2Models).slice(0, 4)).toEqual([
      'gpt-image-2',
      'gpt-image-2.5-超分',
      'gpt-image-2.5-flare-超分',
      'gpt-image-2.5-sunburst-超分',
    ])
  })

  it('orders models without a version by the model list', () => {
    expect(orderImageFallbackModels('grok-imagine-image', ['grok-imagine-image', 'grok-imagine-image-quality', 'grok-imagine-image-fast']))
      .toEqual(['grok-imagine-image-quality', 'grok-imagine-image-fast'])
  })
})
