import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import MiniMaxH3VideoPricing from '../MiniMaxH3VideoPricing.vue'
import { createVideoModelPricesForm, serializeVideoModelPrices } from '../groupsVideoModelPricing'

function render(prices: Record<string, Record<string, number>> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })
  return mount(MiniMaxH3VideoPricing, { props: { modelValue: createVideoModelPricesForm(prices), multiplier: 0.1 }, global: { plugins: [i18n] } })
}

describe('MiniMax-H3 video pricing', () => {
  it.each(['per_second', 'request_5s'])('keeps decimal input editable and saves numeric prices for %s', async (key) => {
    const existing = { 'grok-imagine-video': { '720p': 0.09 } }
    const wrapper = render({ ...existing, 'minimax-h3': { [key]: 0 } })
    const input = wrapper.get('input[min="0"]')

    for (const value of ['0.0', '0.07', '0.005', '0', '']) {
      await input.setValue(value)
      const next = wrapper.emitted('update:modelValue')!.at(-1)![0] as ReturnType<typeof createVideoModelPricesForm>
      await wrapper.setProps({ modelValue: next })
      expect((input.element as HTMLInputElement).value).toBe(value)
      const saved = serializeVideoModelPrices(next)
      expect(saved['grok-imagine-video']).toEqual(existing['grok-imagine-video'])
      expect(saved['minimax-h3']).toEqual(value === '' ? undefined : { [key]: Number(value) })
      if (value === '0.07') {
        const reloaded = render(saved)
        expect((reloaded.get('input[min="0"]').element as HTMLInputElement).value).toBe('0.07')
        reloaded.unmount()
      }
    }
  })

  it('does not enable video or change existing Grok prices by default', async () => {
    const existing = { 'grok-imagine-video': { '720p': 0.07 } }
    const wrapper = render(existing)
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)
    await wrapper.get('input[type="checkbox"]').setValue(true)
    const next = wrapper.emitted('update:modelValue')![0][0] as ReturnType<typeof createVideoModelPricesForm>
    expect(next['minimax-h3']).toEqual({ '768p': null, '1440p': null })
    expect(serializeVideoModelPrices(next)).toEqual(existing)
  })

  it('round-trips a fixed duration per-request price and removes only H3 on disable', async () => {
    const wrapper = render({ 'minimax-h3': { request_5s: 0.08 }, 'grok-imagine-video': { '720p': 0.07 } })
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('per_request')
    expect((wrapper.get('input[min="1"]').element as HTMLInputElement).value).toBe('5')
    expect((wrapper.get('input[min="0"]').element as HTMLInputElement).value).toBe('0.08')
    await wrapper.get('input[min="1"]').setValue('10')
    const next = wrapper.emitted('update:modelValue')![0][0] as ReturnType<typeof createVideoModelPricesForm>
    expect(serializeVideoModelPrices(next)['minimax-h3']).toEqual({ request_10s: 0.08 })
    await wrapper.get('input[type="checkbox"]').setValue(false)
    const disabled = wrapper.emitted('update:modelValue')!.at(-1)![0] as ReturnType<typeof createVideoModelPricesForm>
    expect(serializeVideoModelPrices(disabled)).toEqual({ 'grok-imagine-video': { '720p': 0.07 } })
  })

  it('preserves zero prices and switches between billing modes', async () => {
    const wrapper = render({ 'minimax-h3': { per_second: 0 } })
    await wrapper.get('select').setValue('per_request')
    const next = wrapper.emitted('update:modelValue')![0][0] as ReturnType<typeof createVideoModelPricesForm>
    expect(serializeVideoModelPrices(next)['minimax-h3']).toEqual({ request_1s: 0 })
    expect(wrapper.get('input[min="0"]').attributes('required')).toBeDefined()
  })

  it('keeps Zhongheng model prices beside the shared tariff', async () => {
    const wrapper = render({ 'minimax-h3': { '768p': 0.15, '1440p': 0.225, 'xminimex-h3': 0.26 } })
    expect((wrapper.get('input[data-model="xminimex-h3"]').element as HTMLInputElement).value).toBe('0.26')
    await wrapper.get('input[data-model="minimaxh3-768"]').setValue('2.6')
    let next = wrapper.emitted('update:modelValue')!.at(-1)![0] as ReturnType<typeof createVideoModelPricesForm>
    await wrapper.setProps({ modelValue: next })
    await wrapper.get('input[data-resolution="768p"]').setValue('0.1')
    next = wrapper.emitted('update:modelValue')!.at(-1)![0] as ReturnType<typeof createVideoModelPricesForm>
    await wrapper.setProps({ modelValue: next })
    await wrapper.get('select').setValue('per_second')
    next = wrapper.emitted('update:modelValue')!.at(-1)![0] as ReturnType<typeof createVideoModelPricesForm>
    expect(serializeVideoModelPrices(next)['minimax-h3']).toEqual({ per_second: 0.1, 'xminimex-h3': 0.26, 'minimaxh3-768': 2.6 })

    // A group selling only Zhongheng models stays enabled and editable.
    const only = render({ 'minimax-h3': { 'xminimex-h3': 0.26 } })
    await only.get('input[min="0"]').setValue('0.2')
    next = only.emitted('update:modelValue')!.at(-1)![0] as ReturnType<typeof createVideoModelPricesForm>
    expect(serializeVideoModelPrices(next)['minimax-h3']).toEqual({ per_second: 0.2, 'xminimex-h3': 0.26 })
  })

  it('saves separate 768p and 1440p per-second prices', async () => {
    const wrapper = render({ 'minimax-h3': { per_second: 0.15 } })
    await wrapper.get('select').setValue('per_resolution')
    let next = wrapper.emitted('update:modelValue')!.at(-1)![0] as ReturnType<typeof createVideoModelPricesForm>
    expect(next['minimax-h3']).toEqual({ '768p': 0.15, '1440p': 0.15 })
    await wrapper.setProps({ modelValue: next })
    await wrapper.get('input[data-resolution="768p"]').setValue('0.1')
    next = wrapper.emitted('update:modelValue')!.at(-1)![0] as ReturnType<typeof createVideoModelPricesForm>
    expect(serializeVideoModelPrices(next)['minimax-h3']).toEqual({ '768p': 0.1, '1440p': 0.15 })

    const reloaded = render({ 'minimax-h3': { '768p': 0.1, '1440p': 0.15 } })
    expect((reloaded.get('select').element as HTMLSelectElement).value).toBe('per_resolution')
    expect((reloaded.get('input[data-resolution="1440p"]').element as HTMLInputElement).value).toBe('0.15')
  })
})
