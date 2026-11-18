import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import SeedanceCatalogEditor from '../SeedanceCatalogEditor.vue'
import { saveSeedanceCatalog } from '@/api/admin/seedanceCatalog'
import { getMiniMaxCatalog, saveMiniMaxCatalog } from '@/api/admin/miniMaxCatalog'
import { miniMaxH3Tier } from '@/utils/miniMaxH3'

vi.mock('@/api/admin/seedanceCatalog', () => ({
  getSeedanceCatalog: vi.fn().mockResolvedValue({
    customized: true,
    entries: [
      { model: 'mini', name: 'Mini', note: '', resolution: '720p', min_seconds: 5, max_seconds: 15, per_request: true, max_reference_images: 9, aspect_ratios: ['9:16'] },
      { model: 'full', name: 'Full', note: '', resolution: '720p', min_seconds: 5, max_seconds: 15, per_request: false, max_reference_images: 9 },
    ],
  }),
  saveSeedanceCatalog: vi.fn().mockImplementation(async entries => ({ customized: true, entries })),
  resetSeedanceCatalog: vi.fn(),
}))

vi.mock('@/api/admin/miniMaxCatalog', () => ({
  getMiniMaxCatalog: vi.fn().mockResolvedValue({ customized: false, entries: [] }),
  saveMiniMaxCatalog: vi.fn().mockImplementation(async entries => ({ customized: true, entries })),
  resetMiniMaxCatalog: vi.fn(),
}))

const BaseDialogStub = { props: ['show'], template: '<div><slot /><slot name="footer" /></div>' }

describe('Seedance catalog editor', () => {
  it('loads and saves the aspect ratios of each model', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })
    const wrapper = mount(SeedanceCatalogEditor, {
      props: { show: false },
      global: { plugins: [i18n, createPinia()], stubs: { BaseDialog: BaseDialogStub } },
    })
    await wrapper.setProps({ show: true })
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="seedance-catalog-row"]')
    const checked = (row: (typeof rows)[number]) => row.findAll('[data-field="aspect-ratios"] input:checked').map(input => (input.element as HTMLInputElement).value)
    expect(checked(rows[0])).toEqual(['9:16'])
    // A model without its own list shows the defaults.
    expect(checked(rows[1])).toEqual(['16:9', '9:16', '1:1'])

    // Checking 21:9 on the second model saves it in option order.
    await rows[1].get('[data-field="aspect-ratios"] input[value="21:9"]').setValue(true)
    await wrapper.get('[data-action="save"]').trigger('click')
    await flushPromises()
    const saved = vi.mocked(saveSeedanceCatalog).mock.calls[0][0]
    expect(saved[0].aspect_ratios).toEqual(['9:16'])
    expect(saved[1].aspect_ratios).toEqual(['16:9', '9:16', '1:1', '21:9'])
  })

  it('edits the MiniMax catalog starting from the built-in models', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })
    const wrapper = mount(SeedanceCatalogEditor, {
      props: { show: false, family: 'minimax' },
      global: { plugins: [i18n, createPinia()], stubs: { BaseDialog: BaseDialogStub } },
    })
    await wrapper.setProps({ show: true })
    await flushPromises()
    expect(getMiniMaxCatalog).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="minimax-catalog-editor"]').exists()).toBe(true)
    const rows = wrapper.findAll('[data-testid="seedance-catalog-row"]')
    expect(rows.map(row => (row.get('[data-field="model"]').element as HTMLInputElement).value)).toEqual(['minimaxh3-768', 'xminimex-h3'])
    expect(rows[0].findAll('select')[0].findAll('option').map(option => option.text())).toEqual(['768p', '1080p', '1440p'])
    expect((rows[0].get('[data-field="requires-reference"]').element as HTMLInputElement).checked).toBe(true)

    await rows[1].get('[data-field="name"]').setValue('H3 原生 2K')
    await rows[1].get('[data-field="note"]').setValue('不卡脸，大并发')
    await rows[1].get('[data-field="requires-reference"]').setValue(true)
    await wrapper.get('[data-action="save"]').trigger('click')
    await flushPromises()
    const saved = vi.mocked(saveMiniMaxCatalog).mock.calls[0][0]
    expect(saved[1]).toEqual(expect.objectContaining({ model: 'xminimex-h3', name: 'H3 原生 2K', note: '不卡脸，大并发', resolution: '1440p', requires_reference: true, max_reference_images: 9 }))
    expect(saved[0]).toEqual(expect.objectContaining({ allowed_seconds: [5, 6, 7, 9, 10, 11, 12, 13, 14, 15], per_request: true }))
    // Saving switches the app to the new names at once.
    expect(miniMaxH3Tier('xminimex-h3')?.name).toBe('H3 原生 2K')
  })
})
