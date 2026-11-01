import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import SeedanceVideoPricing from '../SeedanceVideoPricing.vue'
import { createVideoModelPricesForm, serializeVideoModelPrices } from '../groupsVideoModelPricing'
import { SEEDANCE_VIDEO_TIERS } from '@/utils/seedanceVideo'

type Form = ReturnType<typeof createVideoModelPricesForm>

function render(prices: Record<string, Record<string, number>> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })
  return mount(SeedanceVideoPricing, { props: { modelValue: createVideoModelPricesForm(prices), multiplier: 0.5 }, global: { plugins: [i18n] } })
}

describe('Seedance video pricing', () => {
  it('is disabled by default and enabling it leaves other families untouched', async () => {
    const existing = { 'minimax-h3': { per_second: 0.15 } }
    const wrapper = render(existing)
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)
    await wrapper.get('input[type="checkbox"]').setValue(true)
    const next = wrapper.emitted('update:modelValue')![0][0] as Form
    await wrapper.setProps({ modelValue: next })
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(Object.keys(SEEDANCE_VIDEO_TIERS).length)
    expect(serializeVideoModelPrices(next)).toEqual(existing)
  })

  it('saves one price per model and keeps decimal input editable', async () => {
    const wrapper = render({ seedance: { 'xseadanco2.0': 7 } })
    expect((wrapper.get('input[data-model="xseadanco2.0"]').element as HTMLInputElement).value).toBe('7')
    const line = wrapper.get('input[data-model="ttsedanco2.0-480"]')
    for (const value of ['0.0', '0.36']) {
      await line.setValue(value)
      const next = wrapper.emitted('update:modelValue')!.at(-1)![0] as Form
      await wrapper.setProps({ modelValue: next })
      expect((line.element as HTMLInputElement).value).toBe(value)
    }
    expect(serializeVideoModelPrices(wrapper.props('modelValue')).seedance)
      .toEqual({ 'xseadanco2.0': 7, 'ttsedanco2.0-480': 0.36 })
  })

  it('removes the family when disabled', async () => {
    const wrapper = render({ seedance: { 'ttsedanco2.0-480': 0.36 } })
    await wrapper.get('input[type="checkbox"]').setValue(false)
    const next = wrapper.emitted('update:modelValue')!.at(-1)![0] as Form
    expect(serializeVideoModelPrices(next).seedance).toBeUndefined()
  })
})
