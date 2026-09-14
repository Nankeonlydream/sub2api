import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import VersionBadge from '../VersionBadge.vue'
import zh from '@/i18n/locales/zh/misc'

const store = vi.hoisted(() => ({
  currentVersion: '0.2.4-creator.local.df65fa61d1589d41',
  latestVersion: '0.2.4',
  hasUpdate: false,
  updateMode: 'creator',
  versionLoading: false,
  versionWarning: '',
  releaseInfo: { html_url: 'https://github.com/Wei-Shaw/sub2api/releases/tag/v0.2.4' },
  fetchVersion: vi.fn()
}))
vi.mock('@/stores', () => ({ useAppStore: () => store, useAuthStore: () => ({ isAdmin: true }) }))
vi.mock('@/stores/app', () => ({ useAppStore: () => store }))
vi.mock('vue-i18n', async (importOriginal) => ({ ...await importOriginal<typeof import('vue-i18n')>(), useI18n: () => ({
  t: (key: string) => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], zh) || key
}) }))

beforeEach(() => { store.latestVersion = '0.2.4'; store.versionWarning = '' })

describe('VersionBadge custom builds', () => {
  it('shows a compact badge and the official release even when the base versions match', async () => {
    const wrapper = mount(VersionBadge, { global: { stubs: { CreatorUpdatePanel: true } } })
    expect(wrapper.get('button').text()).toBe('v0.2.4 定制版')
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('[data-testid="official-version"]').text()).toContain('官方最新正式版 v0.2.4')
    expect(wrapper.get('[data-testid="official-version"] a').attributes('href')).toContain('/releases/tag/v0.2.4')
    expect(wrapper.text()).not.toContain('已是最新版本')
    wrapper.unmount()
  })

  it('reports an unavailable official version instead of claiming the custom build is latest', async () => {
    store.latestVersion = ''
    store.versionWarning = 'GitHub unavailable'
    const wrapper = mount(VersionBadge, { global: { stubs: { CreatorUpdatePanel: true } } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toContain('暂时无法获取')
    expect(wrapper.find('[data-testid="official-version"] a').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('已是最新版本')
    wrapper.unmount()
  })
})
