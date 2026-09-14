import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CreatorUpdatePanel from '../CreatorUpdatePanel.vue'
import zh from '@/i18n/locales/zh/misc'
import { getCreatorUpdateStatus, performUpdate } from '@/api/admin/system'

vi.mock('@/api/admin/system', () => ({
  getCreatorUpdateStatus: vi.fn(),
  performUpdate: vi.fn()
}))
const appStore = vi.hoisted(() => ({ currentVersion: 'old-version' }))
vi.mock('@/stores/app', () => ({ useAppStore: () => appStore }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], zh) || key
  })
}))

const wrappers: ReturnType<typeof mount>[] = []
function render() {
  const wrapper = mount(CreatorUpdatePanel)
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => { appStore.currentVersion = 'old-version'; vi.resetAllMocks(); vi.useFakeTimers(); vi.stubGlobal('location', { reload: vi.fn() }) })
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('CreatorUpdatePanel', () => {
  it('keeps full build identity in details and hides commits from an unsuccessful job', async () => {
    appStore.currentVersion = '0.2.4-creator.local.123456789abcdef0'
    vi.mocked(getCreatorUpdateStatus).mockResolvedValueOnce({ state: 'deployed', local_only: true, version: appStore.currentVersion, upstream_commit: 'abcdef0123456789' })
      .mockResolvedValue({ state: 'failed', local_only: true, version: '0.2.4-creator.local.new', upstream_commit: 'other-commit' })
    const wrapper = render()
    await flushPromises()
    expect(wrapper.get('details').text()).toContain(appStore.currentVersion)
    expect(wrapper.get('details a').attributes('href')).toBe('https://github.com/Wei-Shaw/sub2api/commit/abcdef0123456789')
    expect(window.location.reload).not.toHaveBeenCalled()
    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.find('details a').exists()).toBe(false)
  })

  it('reloads even when two custom builds share the same short version', async () => {
    appStore.currentVersion = '0.2.4-creator.local.old'
    vi.mocked(getCreatorUpdateStatus).mockResolvedValue({ state: 'deployed', local_only: true, version: '0.2.4-creator.local.new' })
    render()
    await flushPromises()
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })
  it('reconnects during deployment and reloads the new asset bundle after success', async () => {
    vi.mocked(getCreatorUpdateStatus).mockResolvedValueOnce({ state: 'running', stage: 'deploying', local_only: true, auto_deploy: true })
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue({ state: 'deployed', local_only: true, auto_deploy: true, version: 'new-version' })
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('正在部署并重启')
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.text()).toContain('自动重新连接')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.text()).toContain('更新部署成功')
    expect(window.location.reload).toHaveBeenCalledTimes(1)
    expect(performUpdate).not.toHaveBeenCalled()
  })

  it('shows automatic rollback and prevents another update during recovery', async () => {
    vi.mocked(getCreatorUpdateStatus).mockResolvedValueOnce({ state: 'rolled_back', local_only: true, auto_deploy: true })
      .mockResolvedValue({ state: 'recovery_required', local_only: true, auto_deploy: true })
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('已自动恢复')
    expect(wrapper.get('button').text()).toBe('一键更新并部署')
    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('已暂停后续更新')
  })
  it('disables updates when local runner is not configured', async () => {
    vi.mocked(getCreatorUpdateStatus).mockResolvedValue({ state: 'disabled', local_only: true })
    const wrapper = render()
    await flushPromises()
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('尚未配置')
    expect(performUpdate).not.toHaveBeenCalled()
  })

  it('starts once, polls progress, and reports build readiness without restarting', async () => {
    vi.mocked(getCreatorUpdateStatus).mockResolvedValueOnce({ state: 'idle', local_only: true })
      .mockResolvedValue({ state: 'ready', stage: 'ready', local_only: true })
    vi.mocked(performUpdate).mockResolvedValue({ message: 'started', need_restart: false, job: { state: 'running', stage: 'merge', local_only: true } })
    const wrapper = render()
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(performUpdate).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('正在合并官方更新')
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    expect(wrapper.text()).toContain('尚未部署')
    expect(wrapper.text()).not.toContain('立即重启')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('restores a running job after reopening, shows conflicts, and stops polling on unmount', async () => {
    vi.mocked(getCreatorUpdateStatus).mockResolvedValueOnce({ state: 'running', stage: 'merge', local_only: true })
      .mockResolvedValue({ state: 'failed', message: 'Merge conflict', conflicts: ['frontend/Creator.vue'], local_only: true })
    const wrapper = render()
    await flushPromises()
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.text()).toContain('frontend/Creator.vue')
    expect(wrapper.text()).toContain('原代码未被替换')
    wrapper.unmount()
    const count = vi.mocked(getCreatorUpdateStatus).mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(getCreatorUpdateStatus).toHaveBeenCalledTimes(count)
    expect(performUpdate).not.toHaveBeenCalled()
  })

  it('recovers dispatch state after a request timeout', async () => {
    vi.mocked(getCreatorUpdateStatus).mockResolvedValueOnce({ state: 'idle', local_only: true })
      .mockResolvedValue({ state: 'running', stage: 'install', local_only: true })
    vi.mocked(performUpdate).mockRejectedValue(new Error('timeout'))
    const wrapper = render()
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('正在安装构建依赖')
    expect(performUpdate).toHaveBeenCalledTimes(1)
  })
})
