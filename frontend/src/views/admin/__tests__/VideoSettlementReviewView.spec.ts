import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VideoSettlementReviewView from '../VideoSettlementReviewView.vue'
import type { VideoSettlementReview } from '@/api/admin/videoSettlementReviews'
import en from '@/i18n/locales/en/videoReview'
import zh from '@/i18n/locales/zh/videoReview'
import { useVideoSettlementReviewStore } from '@/stores/videoSettlementReviews'

const { api, toast } = vi.hoisted(() => ({
  api: { list: vi.fn(), act: vi.fn() },
  toast: { showError: vi.fn(), showSuccess: vi.fn() },
}))
vi.mock('@/api/admin/videoSettlementReviews', () => ({
  listVideoSettlementReviews: api.list,
  actOnVideoSettlementReview: api.act,
  getVideoSettlementReviewSummary: vi.fn(),
}))
vi.mock('@/stores', () => ({ useAppStore: () => toast }))

function review(overrides: Partial<VideoSettlementReview> = {}): VideoSettlementReview {
  return {
    task_id: 'xai-req-1', api_key_id: 20, user_id: 10, user_email: 'a@example.com', account_id: 3, group_id: 5,
    kind: 'grok', model: 'grok-imagine-video', video_resolution: '720p', video_duration_seconds: 6, attempts: 9,
    reason: 'unsettled at deadline', created_at: '2026-11-07T00:00:00Z', reviewed_at: '2026-11-08T00:00:00Z',
    submitting: false, ...overrides,
  }
}

function mountView(locale: 'en' | 'zh' = 'zh') {
  return mount(VideoSettlementReviewView, { global: {
    plugins: [createI18n({ legacy: false, locale, messages: {
      en: { videoReview: en, common: { cancel: 'Cancel', confirm: 'Confirm', loading: 'Loading' } },
      zh: { videoReview: zh, common: { cancel: '取消', confirm: '确定', loading: '加载中' } },
    } })],
    stubs: {
      AppLayout: { template: '<main><slot /></main>' },
      Pagination: true,
      BaseDialog: { props: ['show', 'title'], template: '<div v-if="show" data-testid="dialog"><h3>{{ title }}</h3><slot /><slot name="footer" /></div>' },
    },
  } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of [...Object.values(api), ...Object.values(toast)]) fn.mockReset()
  api.act.mockResolvedValue({ state: 'complete' })
})

describe('video settlement review page', () => {
  it('lists reviews and keeps the sidebar badge in sync', async () => {
    api.list.mockResolvedValue({ items: [review(), review({ task_id: 'native-video-submission:x', submitting: true })], total: 2 })
    const wrapper = mountView()
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="video-review-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('720p × 6s')
    expect(rows[0].text()).toContain('unsettled at deadline')
    // An unbound submission can only be dismissed.
    expect(rows[1].text()).toContain(zh.noTaskId)
    expect(rows[1].findAll('button').map(b => b.text())).toEqual([zh.dismiss])
    expect(useVideoSettlementReviewStore().pending).toBe(2)
  })

  it('charges a Grok task from its recorded spec', async () => {
    api.list.mockResolvedValueOnce({ items: [review()], total: 1 }).mockResolvedValue({ items: [], total: 0 })
    const wrapper = mountView('en')
    await flushPromises()
    await wrapper.findAll('[data-testid="video-review-row"] button').find(b => b.text() === en.charge)!.trigger('click')
    expect(wrapper.get('[data-testid="dialog"]').text()).toContain('720p × 6s')
    await wrapper.get('[data-testid="video-review-confirm"]').trigger('click')
    await flushPromises()
    expect(api.act).toHaveBeenCalledWith(expect.objectContaining({ task_id: 'xai-req-1', api_key_id: 20 }), { action: 'charge', output_tokens: undefined })
    expect(toast.showSuccess).toHaveBeenCalledWith(en.result.complete)
    expect(useVideoSettlementReviewStore().pending).toBe(0)
  })

  it('requires completion tokens before charging an Ark task', async () => {
    api.list.mockResolvedValue({ items: [review({ kind: 'ark', task_id: 'seedance:cgt-1', video_resolution: '', video_duration_seconds: 0 })], total: 1 })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('[data-testid="video-review-row"] button').find(b => b.text() === zh.charge)!.trigger('click')
    const confirm = wrapper.get('[data-testid="video-review-confirm"]')
    expect(confirm.attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="video-review-tokens"]').setValue('1500')
    expect(confirm.attributes('disabled')).toBeUndefined()
    await confirm.trigger('click')
    await flushPromises()
    expect(api.act).toHaveBeenCalledWith(expect.objectContaining({ task_id: 'seedance:cgt-1' }), { action: 'charge', output_tokens: 1500 })
  })

  it('dismisses with a reason and reports a failed action', async () => {
    api.list.mockResolvedValue({ items: [review()], total: 1 })
    api.act.mockRejectedValue(new Error('video settlement is not waiting for review'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('[data-testid="video-review-row"] button').find(b => b.text() === zh.dismiss)!.trigger('click')
    await wrapper.get('[data-testid="dialog"] input').setValue('上游已退款')
    await wrapper.get('[data-testid="video-review-confirm"]').trigger('click')
    await flushPromises()
    expect(api.act).toHaveBeenCalledWith(expect.anything(), { action: 'dismiss', reason: '上游已退款' })
    expect(toast.showError).toHaveBeenCalledWith('video settlement is not waiting for review')
  })
})
