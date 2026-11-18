import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MiniMaxH3VideoPricing from '../MiniMaxH3VideoPricing.vue'
import { createVideoModelPricesForm, serializeVideoModelPrices } from '../groupsVideoModelPricing'
import { applyMiniMaxCatalog } from '@/utils/miniMaxH3'

const getMiniMaxCatalog = vi.fn()
vi.mock('@/api/admin/miniMaxCatalog', () => ({
  getMiniMaxCatalog: () => getMiniMaxCatalog(),
  saveMiniMaxCatalog: vi.fn(),
  resetMiniMaxCatalog: vi.fn(),
}))

type Form = ReturnType<typeof createVideoModelPricesForm>

function render(prices: Record<string, Record<string, number>> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })
  return mount(MiniMaxH3VideoPricing, {
    props: { modelValue: createVideoModelPricesForm(prices), multiplier: 0.1 },
    global: { plugins: [i18n], stubs: { SeedanceCatalogEditor: true } },
  })
}

afterEach(() => {
  applyMiniMaxCatalog(null)
  getMiniMaxCatalog.mockReset()
})

describe('MiniMax-H3 video pricing', () => {
  it('does not enable video or change existing Grok prices by default', async () => {
    getMiniMaxCatalog.mockResolvedValue({ customized: false, entries: [] })
    const existing = { 'grok-imagine-video': { '720p': 0.07 } }
    const wrapper = render(existing)
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)
    await wrapper.get('input[type="checkbox"]').setValue(true)
    const next = wrapper.emitted('update:modelValue')![0][0] as Form
    expect(next['minimax-h3']).toEqual({})
    expect(serializeVideoModelPrices(next)).toEqual(existing)
  })

  it('prices each catalog model, keeps decimal input editable and drops retired DeepKey keys', async () => {
    getMiniMaxCatalog.mockResolvedValue({ customized: false, entries: [] })
    const wrapper = render({ 'minimax-h3': { '768p': 0.15, '1440p': 0.25, 'xminimex-h3': 0.195 }, 'grok-imagine-video': { '720p': 0.07 } })
    await flushPromises()
    expect(wrapper.findAll('input[data-model]').map(input => input.attributes('data-model'))).toEqual(['minimaxh3-768', 'xminimex-h3'])
    expect(wrapper.text()).toContain('MiniMax H3 高清版 2K · 原生不卡脸')
    expect(wrapper.text()).toContain('原生不卡脸 · 按秒计费 · 5–15 秒')
    expect((wrapper.get('input[data-model="xminimex-h3"]').element as HTMLInputElement).value).toBe('0.195')

    const input = wrapper.get('input[data-model="minimaxh3-768"]')
    for (const value of ['0.0', '1.95', '0', '']) {
      await input.setValue(value)
      const next = wrapper.emitted('update:modelValue')!.at(-1)![0] as Form
      await wrapper.setProps({ modelValue: next })
      expect((input.element as HTMLInputElement).value).toBe(value)
      expect(serializeVideoModelPrices(next)).toEqual({
        'grok-imagine-video': { '720p': 0.07 },
        'minimax-h3': value === '' ? { 'xminimex-h3': 0.195 } : { 'xminimex-h3': 0.195, 'minimaxh3-768': Number(value) },
      })
    }

    await wrapper.get('input[type="checkbox"]').setValue(false)
    const disabled = wrapper.emitted('update:modelValue')!.at(-1)![0] as Form
    expect(serializeVideoModelPrices(disabled)).toEqual({ 'grok-imagine-video': { '720p': 0.07 } })
  })

  it('lists the saved catalog with its names and billing', async () => {
    getMiniMaxCatalog.mockResolvedValue({
      customized: true,
      entries: [{ model: 'new-h3', name: '新 H3 高清', note: '大并发', resolution: '1440p', min_seconds: 6, max_seconds: 10, per_request: true, max_reference_images: 3, requires_reference: true }],
    })
    const wrapper = render({ 'minimax-h3': { 'new-h3': 1.2 } })
    await flushPromises()
    expect(wrapper.findAll('input[data-model]').map(input => input.attributes('data-model'))).toEqual(['new-h3'])
    expect(wrapper.text()).toContain('新 H3 高清')
    expect(wrapper.text()).toContain('大并发 · 按条计费 · 6–10 秒 · 需参考图')
    expect(wrapper.text()).toContain('$0.120000')
    expect(wrapper.find('[data-testid="minimax-catalog-open"]').exists()).toBe(true)
  })
})
