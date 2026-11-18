import { config, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { ApiKey, Group } from '@/types'
import BaseDialog from '@/components/common/BaseDialog.vue'
import CreatorStudioView from '../CreatorStudioView.vue'
import CreatorThumbnail from '@/components/common/CreatorThumbnail.vue'
import StudioRouteCache from '@/components/common/StudioRouteCache.vue'
import { defineComponent, h, nextTick, ref } from 'vue'

config.global.stubs = { teleport: true, transition: true }
// Tests that never unmount would leave window listeners (focus, storage, …) firing into later tests.
enableAutoUnmount(afterEach)

const {
  createKey,
  listKeys,
  listModels,
  listGroups,
  listHistory,
  putHistory,
  removeHistory,
  generateImage,
  submitImageTask,
  getImageTask,
  getImagePricing,
  getVideoPricing,
  createVideo,
  getVideoStatus,
  getVideoContent,
  downloadImage,
  downloadVideo,
  showError,
  showInfo,
  showSuccess,
  showWarning,
  composeVideoSegments,
  optimizeVideoReferenceImage,
  subscribeHistory,
  subscribeExternalHistory,
  getHistory,
  readHistoryImages,
  getCreatorCosts,
  getMiniMaxCatalog,
} = vi.hoisted(() => ({
  getMiniMaxCatalog: vi.fn(),
  readHistoryImages: vi.fn(),
  getCreatorCosts: vi.fn(),
  createKey: vi.fn(),
  listKeys: vi.fn(),
  listModels: vi.fn(),
  listGroups: vi.fn(),
  listHistory: vi.fn(),
  putHistory: vi.fn(),
  removeHistory: vi.fn(),
  generateImage: vi.fn(),
  submitImageTask: vi.fn(),
  getImageTask: vi.fn(),
  getImagePricing: vi.fn(),
  getVideoPricing: vi.fn(),
  createVideo: vi.fn(),
  getVideoStatus: vi.fn(),
  getVideoContent: vi.fn(),
  downloadImage: vi.fn(),
  downloadVideo: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  composeVideoSegments: vi.fn(),
  optimizeVideoReferenceImage: vi.fn(),
  subscribeHistory: vi.fn(),
  subscribeExternalHistory: vi.fn(),
  getHistory: vi.fn(),
}))

vi.mock('@/api/keys', () => ({
  keysAPI: {
    list: listKeys,
    create: createKey,
  },
}))

vi.mock('@/api/groups', () => ({
  userGroupsAPI: {
    getAvailable: listGroups,
  },
}))

vi.mock('@/api/creator', () => ({
  listCreatorModels: listModels,
  generateCreatorImage: generateImage,
  submitCreatorImageTask: submitImageTask,
  getCreatorImageTask: getImageTask,
  getCreatorImagePricing: getImagePricing,
  getCreatorVideoPricing: getVideoPricing,
  getCreatorMiniMaxCatalog: getMiniMaxCatalog,
  createCreatorVideo: createVideo,
  getCreatorVideoStatus: getVideoStatus,
  getCreatorVideoContent: getVideoContent,
  downloadCreatorImage: downloadImage,
  downloadCreatorVideo: downloadVideo,
}))

vi.mock('@/services/creatorHistory', () => ({
  creatorHistory: {
    subscribe: subscribeHistory,
    subscribeExternal: subscribeExternalHistory,
    get: getHistory,
    list: listHistory,
    readImages: readHistoryImages,
    put: putHistory,
    remove: removeHistory,
    clear: vi.fn(),
    saveVideoThumbnail: vi.fn(),
  },
}))

vi.mock('@/services/videoReferenceImage', () => ({
  MAX_VIDEO_REFERENCE_SOURCE_BYTES: 10 * 1024 * 1024,
  MAX_VIDEO_REFERENCE_SOURCE_MB: 10,
  MAX_VIDEO_REFERENCE_TOTAL_BYTES: 15 * 1024 * 1024,
  MAX_VIDEO_REFERENCE_TOTAL_MB: 15,
  optimizeVideoReferenceImage,
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ showError, showInfo, showSuccess, showWarning }),
}))

vi.mock('@/services/videoComposer', () => ({ composeVideoSegments }))

vi.mock('@/api/usage', () => ({ getCreatorCosts }))

const group = {
  id: 7656,
  name: '【全能型】Grok xAi',
  description: 'Grok 图片和视频',
  platform: 'grok',
  status: 'active',
  allow_image_generation: true,
} as Group

const createdKey = {
  id: 14,
  user_id: 1,
  key: 'sk-created-in-studio',
  name: '创作中心 · 【全能型】Grok xAi',
  group_id: group.id,
  group,
  status: 'active',
} as ApiKey

const image2Group = {
  ...group,
  id: 7657,
  name: 'Image2 原生生图',
  description: 'gpt-image-2',
  platform: 'openai',
} as Group

const image2Key = {
  ...createdKey,
  id: 15,
  name: '创作中心 · Image2 原生生图',
  group_id: image2Group.id,
  group: image2Group,
} as ApiKey

const bananaGroup = {
  ...group,
  id: 7658,
  name: '【外接生图】Nano-Banana',
  description: 'Gemini 图片生成',
  platform: 'gemini',
} as Group

const bananaKey = {
  ...createdKey,
  id: 16,
  name: '创作中心 · Nano-Banana',
  group_id: bananaGroup.id,
  group: bananaGroup,
} as ApiKey

const IconStub = {
  props: ['name'],
  template: '<span class="icon-stub">{{ name }}</span>',
}

const AppLayoutStub = {
  template: '<div><slot /></div>',
}

type StudioWrapper = ReturnType<typeof mount>

function pngWithDimensions(width: number, height: number) {
  const header = new Uint8Array(24)
  header.set([137, 80, 78, 71, 13, 10, 26, 10])
  header.set([73, 72, 68, 82], 12)
  const view = new DataView(header.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return `data:image/png;base64,${btoa(String.fromCharCode(...header))}`
}

function videoParamsDialog(wrapper: StudioWrapper) {
  return wrapper.findAllComponents(BaseDialog).find(dialog => dialog.props('title') === '设置视频参数')!
}

async function openGrokVideo(wrapper: StudioWrapper) {
  await wrapper.findAll('.mode-option')[1].trigger('click')
  await flushPromises()
  await wrapper.findAll('.video-capability-switch button').find(button => button.text() === 'Grok')!.trigger('click')
}

async function setVideoParams(wrapper: StudioWrapper, params: { ratio?: string, resolution?: string }) {
  await wrapper.get('#video-params').trigger('click')
  const dialog = videoParamsDialog(wrapper)
  if (params.resolution) await dialog.get(`.image-resolution-grid button[data-resolution="${params.resolution}"]`).trigger('click')
  if (params.ratio) await dialog.get(`.image-ratio-grid button[data-ratio="${params.ratio}"]`).trigger('click')
  await dialog.get('.image-size-confirm').trigger('click')
}

async function videoResolutionChoices(wrapper: StudioWrapper) {
  await wrapper.get('#video-params').trigger('click')
  const dialog = videoParamsDialog(wrapper)
  const choices = dialog.findAll('.image-resolution-grid button').map(button => button.attributes('data-resolution'))
  await dialog.get('.image-size-cancel').trigger('click')
  return choices
}

// The global setup matches every media query; evaluate max-width queries against a chosen width instead.
function mockViewportWidth(width: number) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => {
    const maxWidth = Number(/max-width:\s*(\d+)px/.exec(query)?.[1])
    return {
      matches: Number.isFinite(maxWidth) ? width <= maxWidth : true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
  }) as unknown as typeof window.matchMedia
  return () => { window.matchMedia = original }
}

describe('CreatorStudioView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCreatorCosts.mockResolvedValue({})
    getMiniMaxCatalog.mockReset().mockResolvedValue({ customized: false, entries: [] })
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    getVideoPricing.mockReset().mockResolvedValue({ currency: 'USD', prices: { '480p': Array.from({ length: 15 }, (_, i) => (i + 1) * 0.05), '720p': Array.from({ length: 15 }, (_, i) => (i + 1) * 0.1) } })
    getImagePricing.mockReset().mockResolvedValue({ currency: "USD", billing_mode: "image", prices: { "1K": 0.04, "2K": 0.08, "4K": 0.16 } })
    listGroups.mockResolvedValue([group])
    listKeys.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100, pages: 0 })
    listHistory.mockResolvedValue([])
    subscribeHistory.mockReturnValue(vi.fn())
    subscribeExternalHistory.mockReturnValue(vi.fn())
    getHistory.mockReset()
    readHistoryImages.mockReset().mockImplementation(async (work: { imageOutputsPending?: boolean; outputs: string[] }) => {
      const { imageOutputsPending: _pending, ...loaded } = work
      return { ...loaded, outputs: loaded.outputs.map(output => output || 'data:image/png;base64,TE9BREVE') }
    })
    listModels.mockResolvedValue([{ id: 'grok-imagine-image' }])
    createKey.mockResolvedValue(createdKey)
    putHistory.mockResolvedValue(undefined)
    composeVideoSegments.mockReset().mockResolvedValue(new Blob(['complete'], { type: 'video/mp4' }))
    removeHistory.mockResolvedValue(undefined)
    generateImage.mockResolvedValue({ data: [{ url: 'data:image/png;base64,UE5H' }] })
    // Async image tasks need object storage; most tests cover the synchronous fallback.
    submitImageTask.mockResolvedValue(null)
    createVideo.mockResolvedValue({ id: 'video-task-1' })
    getVideoStatus.mockResolvedValue({
      id: 'video-task-1',
      status: 'completed',
      url: '/v1/videos/video-task-1/content',
    })
    getVideoContent.mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }))
    downloadImage.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    downloadVideo.mockReset().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }))
    optimizeVideoReferenceImage.mockImplementation(async (file: File) => ({
      file,
      width: 1024,
      height: 1024,
      optimized: false,
    }))
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:creator-video'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('previews tier prices and updates totals for resolution, quantity and auto size', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    expect(wrapper.get('.image-cost-total strong').text()).toBe('$0.04–$0.16')
    await wrapper.get('#creator-output-size').trigger('click')
    const dialog = wrapper.findComponent(BaseDialog)
    await dialog.findAll('.image-size-mode-tabs button').find(button => button.text() === '按比例')!.trigger('click')
    expect(dialog.findAll('.image-resolution-grid button')[2].text()).toContain('$0.16/张')
    await dialog.findAll('.image-resolution-grid button')[1].trigger('click')
    await dialog.get('.image-size-confirm').trigger('click')
    expect(wrapper.get('.image-cost-total strong').text()).toBe('$0.08')
    await wrapper.get('button[title="增加数量"]').trigger('click')
    expect(wrapper.get('.image-cost-total strong').text()).toBe('$0.16')
    await wrapper.get('#creator-output-size').trigger('click')
    await dialog.findAll('.image-resolution-grid button')[2].trigger('click')
    await dialog.get('.image-size-confirm').trigger('click')
    expect(wrapper.get('.image-cost-total strong').text()).toBe('$0.32')
    await wrapper.get('#creator-output-size').trigger('click')
    const auto = dialog.findAll('button').find(button => button.text() === '自动')!
    await auto.trigger('click')
    await dialog.get('.image-size-confirm').trigger('click')
    expect(wrapper.get('.image-cost-total strong').text()).toBe('$0.08–$0.32')
    expect(generateImage).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('sends only valid 1K dimensions for every enabled 1K ratio and quotes the 1K price', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    const sizes = ['1024×1024', '1024×688', '688×1024', '1024×768', '768×1024']
    await wrapper.get('#creator-prompt').setValue('尺寸计费测试')
    for (const [index, size] of sizes.entries()) {
      await wrapper.get('#creator-output-size').trigger('click')
      const dialog = wrapper.getComponent(BaseDialog)
      await dialog.findAll('button[role="tab"]').find(button => button.text() === '按比例')!.trigger('click')
      await dialog.findAll('.image-resolution-grid button')[0].trigger('click')
      await dialog.findAll('.image-ratio-grid button').filter(button => button.attributes('disabled') === undefined)[index].trigger('click')
      await dialog.get('.image-size-confirm').trigger('click')
      expect(wrapper.get('#creator-output-size').text()).toContain(`1K · ${size}`)
      expect(wrapper.get('.image-cost-total strong').text()).toBe('$0.04')
      expect(wrapper.text()).toContain('1K · $0.04/张 × 1 张')
      const [width, height] = size.split('×').map(Number)
      expect(Math.max(width, height)).toBeLessThanOrEqual(1024)
      expect(width * height).toBeGreaterThanOrEqual(655360)
      expect(width % 16).toBe(0)
      expect(height % 16).toBe(0)
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      expect(generateImage.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ size: size.replace('×', 'x') }))
    }
    await wrapper.get('button[title="增加数量"]').trigger('click')
    expect(wrapper.get('.image-cost-total strong').text()).toBe('$0.08')
    expect(generateImage).toHaveBeenCalledTimes(5)
    await wrapper.get('#creator-output-size').trigger('click')
    const dialog = wrapper.getComponent(BaseDialog)
    expect(dialog.findAll('.image-ratio-grid button').filter(button => button.attributes('disabled') !== undefined).map(button => button.text())).toEqual(['16:9', '9:16', '21:9'])
    await dialog.findAll('.image-resolution-grid button')[1].trigger('click')
    expect(dialog.findAll('.image-ratio-grid button').every(button => button.attributes('disabled') === undefined)).toBe(true)
    await dialog.findAll('.image-ratio-grid button')[3].trigger('click')
    expect(dialog.text()).toContain('2048×1152')
    await dialog.findAll('.image-resolution-grid button')[0].trigger('click')
    expect(dialog.get('.image-ratio-grid button.active').text()).toBe('1:1')
    expect(dialog.text()).toContain('1024×1024')
    wrapper.unmount()
  })

  it('shows unavailable pricing and lets users retry without assuming a free generation', async () => {
    getImagePricing.mockRejectedValue(new Error('offline'))
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    expect(wrapper.get('.image-cost-total strong').text()).toBe('暂无法预估')
    getImagePricing.mockResolvedValue({ currency: 'USD', billing_mode: 'token', prices: {} })
    await wrapper.get('.image-price-retry').trigger('click')
    await flushPromises()
    expect(wrapper.get('.image-cost-total strong').text()).toBe('按实际用量计费')
    expect(wrapper.find('.image-cost-tiers').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ignores stale model prices and preserves a valid zero price', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }, { id: 'gpt-image-1' }])
    let resolveOld!: (value: unknown) => void
    getImagePricing.mockImplementation(() => new Promise(resolve => { resolveOld = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    expect(wrapper.get('.image-cost-total strong').text()).toBe('正在查询…')
    getImagePricing.mockResolvedValue({ currency: 'USD', billing_mode: 'image', prices: { '1K': 0, '2K': 0, '4K': 0 } })
    await wrapper.get('#creator-model').setValue('gpt-image-1')
    await flushPromises()
    expect(wrapper.get('.image-cost-total strong').text()).toBe('$0.00')
    resolveOld({ currency: 'USD', billing_mode: 'image', prices: { '1K': 99 } })
    await flushPromises()
    expect(wrapper.get('.image-cost-total strong').text()).toBe('$0.00')
    wrapper.unmount()
  })

  it('creates and activates a group-bound key without navigating away', async () => {
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    expect(wrapper.findAll('.capability-switch button')[0].classes()).toContain('active')
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('需要创建 Key')
    expect(wrapper.text()).toContain(group.name)

    await wrapper.get('.key-needed > button').trigger('click')
    await flushPromises()

    expect(createKey).toHaveBeenCalledWith(`创作中心 · ${group.name}`, group.id)
    expect(listModels).toHaveBeenCalledWith(createdKey.key)
    expect(wrapper.text()).toContain(createdKey.name)
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-image')
    expect(showSuccess).toHaveBeenCalledWith('Key 已创建并自动启用')
    expect(showError).not.toHaveBeenCalled()
  })

  it('shows canonical IDs for Grok image models', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'grok-imagine-image' },
      { id: 'grok-imagine-image-quality' },
    ])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.capability-switch .online-dot')).toHaveLength(0)
    expect(wrapper.findAll('.capability-switch button').map(button => button.text().trim())).toEqual([
      'Image',
      'Grok',
      'Banner',
    ])
    expect(wrapper.get<HTMLSelectElement>('#creator-model').findAll('option').map(option => option.text())).toEqual([
      'grok-imagine-image',
      'grok-imagine-image-quality',
    ])
    await wrapper.get('#creator-output-size').trigger('click')
    expect(wrapper.findAll('.image-ratio-grid button').map(option => option.text())).toEqual([
      '1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '21:9',
    ])
    expect(wrapper.findAll('.image-resolution-grid button').map(option => option.text())).toEqual([
      '1K$0.04/张',
      '2K$0.08/张',
    ])
    expect(wrapper.findAll('.image-resolution-grid button')).toHaveLength(2)
  })

  it('keeps Muse groups out of the Grok image group list', async () => {
    const museGroup = { ...group, id: 7709, name: 'Muse', description: '', platform: 'grok', allow_image_generation: true, video_model_prices: { seedance: { 'muse-video': 0.3 } } } as Group
    const museKey = { ...createdKey, id: 39, key: 'sk-muse', group_id: museGroup.id, group: museGroup } as ApiKey
    listGroups.mockResolvedValue([{ ...group, allow_image_generation: true }, museGroup])
    listKeys.mockResolvedValue({ items: [createdKey, museKey], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-image' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()

    expect(wrapper.findAll('#creator-group option').map(option => option.text())).toEqual([group.name])
    wrapper.unmount()
  })

  it.each(['grok', 'banner'])('sends a 1K tier and dimensions within 1024px for every supported %s ratio', async capability => {
    const isGrok = capability === 'grok'
    const key = isGrok ? createdKey : bananaKey
    listGroups.mockResolvedValue([isGrok ? group : bananaGroup])
    listKeys.mockResolvedValue({ items: [key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: isGrok ? 'grok-imagine-image' : 'gemini-3.1-flash-image' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[isGrok ? 1 : 2].trigger('click')
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('尺寸档位验证')
    await wrapper.get('#creator-output-size').trigger('click')
    const ratios = wrapper.findAll('.image-ratio-grid button').map(button => button.text())
    expect(ratios).toEqual(['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '21:9'])
    const expectedSizes = ['1024x1024', '1024x688', '688x1024', '', '', '1024x768', '768x1024', '']
    await wrapper.get('.image-size-cancel').trigger('click')
    for (const [index, ratio] of ratios.entries()) {
      await wrapper.get('#creator-output-size').trigger('click')
      await wrapper.findAll('.image-resolution-grid button')[0].trigger('click')
      if (!expectedSizes[index]) {
        expect(wrapper.findAll('.image-ratio-grid button')[index].attributes('disabled')).toBeDefined()
        await wrapper.get('.image-size-cancel').trigger('click')
        continue
      }
      await wrapper.findAll('.image-ratio-grid button')[index].trigger('click')
      await wrapper.get('.image-size-confirm').trigger('click')
      expect(wrapper.get('#creator-output-size').text()).toContain('1K')
      expect(wrapper.get('.image-cost-total strong').text()).toBe('$0.04')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      const request = generateImage.mock.calls.at(-1)![1]
      expect(request).toMatchObject({ imageSize: '1K', aspectRatio: ratio, size: expectedSizes[index] })
      expect(Math.max(...request.size.split('x').map(Number))).toBeLessThanOrEqual(1024)
    }
    const twoKSizes = ['2048×2048', '2048×1360', '1360×2048', '2048×1152', '1152×2048', '2048×1536', '1536×2048', '2048×880']
    for (const [index, size] of twoKSizes.entries()) {
      await wrapper.get('#creator-output-size').trigger('click')
      await wrapper.findAll('.image-resolution-grid button')[1].trigger('click')
      const ratio = wrapper.findAll('.image-ratio-grid button')[index]
      expect(ratio.attributes('disabled')).toBeUndefined()
      await ratio.trigger('click')
      await wrapper.get('.image-size-confirm').trigger('click')
      expect(wrapper.get('#creator-output-size').text()).toContain(`2K · ${size}`)
    }
    wrapper.unmount()
  })

  it.each(['image2', 'grok', 'banner'])('saves and downloads %s provider pixels unchanged', async capability => {
    const capabilityIndex = ['image2', 'grok', 'banner'].indexOf(capability)
    const key = [image2Key, createdKey, bananaKey][capabilityIndex]
    listGroups.mockResolvedValue([key.group])
    listKeys.mockResolvedValue({ items: [key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: ['gpt-image-2.5-sunburst', 'grok-imagine-image-2.0', 'gemini-3.1-flash-image'][capabilityIndex] }])
    const source = pngWithDimensions(1248, 832)
    generateImage.mockResolvedValue({ data: [{ url: source }] })
    const downloaded: string[] = []
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloaded.push(this.href)
    })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.capability-switch button')[capabilityIndex].trigger('click')
      await flushPromises()
      await wrapper.get('#creator-prompt').setValue('保留上游原图')
      await wrapper.get('#creator-output-size').trigger('click')
      if (capability === 'image2') {
        await wrapper.findAll('.image-size-mode-tabs button').find(button => button.text() === '按比例')!.trigger('click')
      }
      await wrapper.findAll('.image-ratio-grid button')[1].trigger('click')
      await wrapper.get('.image-size-confirm').trigger('click')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
        status: 'completed', resolution: '1K', outputSize: '1024x688', actualOutputSize: '1248x832',
        upstreamImageSizes: ['1248x832'], imageOutputSizes: ['1248x832'], outputs: [source],
      }))
      expect(wrapper.get('.result-tags').text()).toContain('1248×832')
      await wrapper.get('.result-media-actions button[title="下载作品"]').trigger('click')
      expect(downloaded).toEqual([source])
    } finally {
      wrapper.unmount()
      anchorClick.mockRestore()
    }
  })

  it('keeps different upstream sizes for two 4K 21:9 results through preview and download', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2.5-sunburst' }])
    const sources = [pngWithDimensions(1918, 820), pngWithDimensions(3840, 1645)]
    generateImage.mockResolvedValueOnce({ data: [{ url: sources[0] }] }).mockResolvedValueOnce({ data: [{ url: sources[1] }] })
    const downloaded: { href: string; filename: string }[] = []
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloaded.push({ href: this.href, filename: this.download })
    })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('#creator-prompt').setValue('高原湖泊边的牧场')
      await wrapper.get('#creator-output-size').trigger('click')
      await wrapper.get('.image-size-mode-tabs').findAll('button').find(button => button.text() === '按比例')!.trigger('click')
      await wrapper.findAll('.image-resolution-grid button')[2].trigger('click')
      await wrapper.findAll('.image-ratio-grid button').find(button => button.text().includes('21:9'))!.trigger('click')
      await wrapper.get('.image-size-confirm').trigger('click')
      // If the provider ignores JPEG and returns PNG, keep those bytes and extension too.
      await wrapper.get('#creator-format').setValue('jpeg')
      await wrapper.get('button[title="增加数量"]').trigger('click')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      expect(generateImage.mock.calls.map(([, request]) => request.size)).toEqual(['3840x1648', '3840x1648'])
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({
        status: 'completed', outputs: sources, imageOutputSizes: ['1918x820', '3840x1645'], actualOutputSize: '1918x820',
      }))
      const cards = wrapper.findAll('.result-card')
      expect(cards.map(card => card.get('.result-tags').text())).toEqual([
        expect.stringContaining('1918×820'), expect.stringContaining('3840×1645'),
      ])
      for (const [index, card] of cards.entries()) {
        expect(card.get('.result-media img').attributes('src')).toBe(sources[index])
        await card.findAll('.result-media-actions button')[0].trigger('click')
        expect(wrapper.get('.image-preview .creator-image img').attributes('src')).toBe(sources[index])
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await nextTick()
        await card.get('.result-media-actions button[title="下载作品"]').trigger('click')
      }
      expect(downloaded.map(item => item.href)).toEqual(sources)
      expect(downloaded.every(item => item.filename.endsWith('.png'))).toBe(true)
      expect(showError).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      anchorClick.mockRestore()
    }
  })

  it('shows all supported Banana ratios and labelled resolution tiers', async () => {
    listGroups.mockResolvedValue([bananaGroup])
    listKeys.mockResolvedValue({ items: [bananaKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'gemini-3-pro-image-preview' },
      { id: 'gemini-3.1-flash-image' },
    ])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[2].trigger('click')
    await flushPromises()
    expect(wrapper.get<HTMLSelectElement>('#creator-model').findAll('option').map(option => option.text())).toEqual([
      'gemini-3-pro-image-preview',
      'gemini-3.1-flash-image',
    ])
    await wrapper.get('#creator-output-size').trigger('click')
    expect(wrapper.findAll('.image-ratio-grid button').map(option => option.text())).toEqual([
      '1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '21:9',
    ])
    expect(wrapper.findAll('.image-resolution-grid button').map(option => option.text())).toEqual([
      '1K$0.04/张', '2K$0.08/张', '4K$0.16/张',
    ])

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('Banana 宽幅图片')
    await wrapper.findAll('.image-resolution-grid button')[2].trigger('click')
    await wrapper.findAll('.image-ratio-grid button')[7].trigger('click')
    await wrapper.get('.image-size-confirm').trigger('click')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(generateImage).toHaveBeenCalledWith(bananaKey.key, expect.objectContaining({
      protocol: 'gemini',
      aspectRatio: '21:9',
      imageSize: '4K',
    }))
  })

  it('requests one Banana image per call until the requested count is filled', async () => {
    listGroups.mockResolvedValue([bananaGroup])
    listKeys.mockResolvedValue({ items: [bananaKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gemini-3.1-flash-image' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[2].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('Banana 多张图片')
    await wrapper.get('button[title="增加数量"]').trigger('click')
    await wrapper.get('button[title="增加数量"]').trigger('click')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledTimes(3)
    expect(generateImage.mock.calls.every(call => call[1].protocol === 'gemini' && call[1].n === 1)).toBe(true)
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ outputCount: 3 }))
    expect(putHistory.mock.calls.at(-1)?.[0].outputs).toHaveLength(3)
    wrapper.unmount()
  })

  it('keeps the finished Banana images downloadable when one of the batch fails', async () => {
    listGroups.mockResolvedValue([bananaGroup])
    listKeys.mockResolvedValue({ items: [bananaKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gemini-3.1-flash-image' }])
    generateImage
      .mockResolvedValueOnce({ data: [{ url: 'data:image/png;base64,QQ==' }] })
      // A rejected request is final; a transient one would be retried.
      .mockRejectedValueOnce(Object.assign(new Error('Invalid image request'), { status: 400 }))
      .mockResolvedValueOnce({ data: [{ url: 'data:image/png;base64,Qw==' }] })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[2].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('Banana 部分失败')
    await wrapper.get('button[title="增加数量"]').trigger('click')
    await wrapper.get('button[title="增加数量"]').trigger('click')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    // The failed second image does not stop the third request.
    expect(generateImage).toHaveBeenCalledTimes(3)
    const saved = putHistory.mock.calls.at(-1)?.[0]
    expect(saved).toMatchObject({ status: 'completed', outputCount: 3 })
    expect(saved.outputs).toHaveLength(2)
    expect(saved.error).toContain('已生成 2 / 3 张')
    expect(wrapper.find('.result-error').exists()).toBe(false)
    expect(wrapper.get('.partial-result-notice strong').text()).toBe('1 张图片未生成')
    expect(wrapper.get('.partial-result-notice button').text()).toContain('全部重试')
    expect(wrapper.get('.result-count-pill').text()).toContain('2 / 3 张')
    const cards = wrapper.findAll('.result-card')
    expect(cards).toHaveLength(3)
    expect(cards.map(card => card.get('.result-index').text())).toEqual(['01', '02', '03'])
    expect(cards[1].classes()).toContain('is-missing')
    expect(cards[1].get('.result-missing-media strong').text()).toBe('未生成')
    expect(cards[1].find('.result-missing-prompt').exists()).toBe(false)
    // The missing slot still shows the requested resolution tier like its siblings.
    expect(saved.resolution).toBeTruthy()
    expect(cards[1].findAll('.result-tags li').map(item => item.text())).toContain(saved.resolution)
    // The missing slot keeps the same four-button toolbar; only redraw is usable.
    const unavailable = cards[1].findAll('.result-media-actions.is-unavailable button')
    expect(unavailable.map(button => button.attributes('aria-label'))).toEqual(['预览作品', '重新生成这张', '编辑这张照片', '下载作品'])
    expect(unavailable.filter(button => button.attributes('disabled') === undefined).map(button => button.attributes('aria-label'))).toEqual(['重新生成这张'])
    expect(saved.imageOutputIndexes).toEqual([0, 2])
    expect(saved.imageFailedIndexes).toEqual([1])
    expect(wrapper.findAll('button[title="下载作品"]')).toHaveLength(2)
    expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('已生成 2 / 3 张'))
    expect(showSuccess).not.toHaveBeenCalledWith('作品生成完成')
    // The toolbar redraw retries only the missing image, like the button in the slot.
    generateImage.mockResolvedValueOnce({ data: [{ url: 'data:image/png;base64,Qg==' }] })
    await wrapper.findAll('.result-card')[1].get('.result-media-actions.is-unavailable button[aria-label="重新生成这张"]').trigger('click')
    await flushPromises()
    expect(generateImage).toHaveBeenCalledTimes(4)
    wrapper.unmount()
  })

  it('opens legacy failed batches with their finished images instead of hiding them', async () => {
    listGroups.mockResolvedValue([bananaGroup])
    listKeys.mockResolvedValue({ items: [bananaKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gemini-3.1-flash-image' }])
    listHistory.mockResolvedValue([{
      id: 'legacy-partial', type: 'image', status: 'failed', prompt: '旧的部分失败', model: 'gemini-3.1-flash-image',
      provider: 'Banner 生图', groupName: bananaGroup.name, createdAt: 1, updatedAt: 1, outputCount: 4,
      outputs: ['data:image/png;base64,QQ==', 'data:image/png;base64,Qg==', 'data:image/png;base64,Qw=='],
      imageCapability: 'banner', aspectRatio: '16:9', resolution: '4K',
      error: 'The string did not match the expected pattern.',
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('[aria-label="打开作品：旧的部分失败"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.result-error').exists()).toBe(false)
    expect(wrapper.get('.result-heading h2').text()).toBe('本次创作')
    expect(wrapper.get('.partial-result-notice strong').text()).toBe('1 张图片未生成')
    expect(wrapper.get('.partial-result-notice p').text()).toBe('The string did not match the expected pattern.')
    expect(wrapper.get('.result-card.is-missing .result-missing-media p').text()).toBe('点击“重新生成”，单独重做这张图片')
    expect(wrapper.findAll('.result-card')).toHaveLength(4)
    expect(wrapper.find('.result-card.is-missing .result-missing-prompt').exists()).toBe(false)
    expect(wrapper.findAll('button[title="下载作品"]')).toHaveLength(3)
    wrapper.unmount()
  })

  it('reopens image slots in request order and downloads the right out-of-order output', async () => {
    const prompt = '同一组图片的完整提示词\n第二行保留构图要求'
    listHistory.mockResolvedValue([{
      id: 'image-slots', type: 'image', status: 'completed', prompt,
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name,
      createdAt: 1, updatedAt: 2, outputCount: 3,
      outputs: ['data:image/png;base64,Qw==', 'data:image/png;base64,QQ=='],
      imageOutputIndexes: [2, 0], imageFailedIndexes: [1],
      imageOutputSizes: ['1536x1024', '1024x1024'], aspectRatio: '1:1', outputSize: '1024x1024',
    }])
    let downloaded: { href: string; filename: string } | undefined
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloaded = { href: this.href, filename: this.download }
    })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      const cards = wrapper.findAll('.result-card')
      expect(cards).toHaveLength(3)
      expect(cards[0].get('img').attributes('src')).toBe('data:image/png;base64,QQ==')
      expect(cards[0].get('.result-tags').text()).toContain('1024×1024')
      expect(cards[2].get('img').attributes('src')).toBe('data:image/png;base64,Qw==')
      expect(cards[2].get('.result-tags').text()).toContain('1536×1024')
      expect(cards[1].get('.result-description .result-prompt').text()).toBe(prompt)
      expect(cards[1].get('.result-description .result-prompt').attributes('title')).toBeUndefined()
      expect(cards[1].find('.result-missing-prompt').exists()).toBe(false)
      await cards[2].get('button[title="下载作品"]').trigger('click')
      await flushPromises()
      expect(downloaded?.href).toBe('data:image/png;base64,Qw==')
      expect(downloaded?.filename).toMatch(/^creator-\d+-3\.png$/)
      expect(generateImage).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      anchorClick.mockRestore()
    }
  })

  it('retries one missing image in place and fills its original slot', async () => {
    const reference = new File(['saved-reference'], 'reference.png', { type: 'image/png' })
    const work = {
      id: 'retry-image-slot', type: 'image', status: 'completed', prompt: '原作品提示词',
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name,
      groupId: image2Group.id, apiKeyId: image2Key.id, imageCapability: 'image2',
      createdAt: 1, updatedAt: 2, outputs: ['data:image/png;base64,QQ=='], outputCount: 3,
      imageOutputIndexes: [0], imageFailedIndexes: [1, 2], aspectRatio: '3:2', resolution: '2K',
      outputSize: '2048x1360', imageSizeMode: 'ratio', quality: 'high', outputFormat: 'png',
      referenceCount: 1, referenceBlobs: [reference],
      error: '已生成 1 / 3 张，其余 2 张生成失败：上游超时',
    }
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    listHistory.mockResolvedValue([work])
    let finishImage!: (result: unknown) => void
    generateImage.mockImplementationOnce(() => new Promise(resolve => { finishImage = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    const finishedImage = wrapper.get('[data-result-index="0"] img').element
    const retry = wrapper.get('[data-result-index="1"] .result-shot-retry')
    expect(retry.attributes('aria-label')).toBe('重新生成图片 2')
    // The retry sits under the "未生成" note inside the placeholder.
    expect(retry.element.parentElement?.classList.contains('result-missing-media')).toBe(true)
    expect(wrapper.find('[data-result-index="1"] .result-description-heading .result-shot-retry').exists()).toBe(false)
    expect(wrapper.findAll('.result-card .result-shot-retry')).toHaveLength(2)
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('编辑区的新提示词')
    await retry.trigger('click')
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(1))

    expect(generateImage).toHaveBeenCalledWith(image2Key.key, expect.objectContaining({
      model: work.model,
      prompt: work.prompt,
      n: 1,
      size: work.outputSize,
      quality: work.quality,
      outputFormat: work.outputFormat,
      protocol: 'openai',
      referenceImages: [reference],
    }))
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('编辑区的新提示词')
    // No separate history entry: the same work is regenerating.
    expect(putHistory.mock.calls.every(([item]) => item.id === work.id)).toBe(true)
    expect(wrapper.findAll('.history-item-hitbox')).toHaveLength(1)
    // The result view stays put; only the retried card shows a loader.
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    const retryingCards = wrapper.findAll('.result-card')
    expect(retryingCards).toHaveLength(3)
    expect(retryingCards[0].get('img').attributes('src')).toBe('data:image/png;base64,QQ==')
    // The finished image is not reloaded while another slot redraws.
    expect(retryingCards[0].get('img').element).toBe(finishedImage)
    expect(retryingCards[1].get('.result-missing-media').classes()).toContain('is-regenerating')
    expect(retryingCards[1].get('.result-missing-media strong').text()).toBe('正在重新生成')
    expect(retryingCards[2].get('.result-missing-media').classes()).toContain('is-failed')

    finishImage({ data: [{ url: 'data:image/png;base64,Qw==' }] })
    await flushPromises()
    expect(generateImage).toHaveBeenCalledTimes(1)
    const saved = putHistory.mock.calls.at(-1)?.[0]
    expect(saved).toMatchObject({
      id: work.id, type: 'image', status: 'completed', prompt: work.prompt, outputCount: 3,
      outputs: ['data:image/png;base64,QQ==', 'data:image/png;base64,Qw=='],
      imageOutputIndexes: [0, 1], imageFailedIndexes: [2],
      error: '已生成 2 / 3 张，其余 1 张生成失败：上游超时',
    })
    const cards = wrapper.findAll('.result-card')
    expect(cards).toHaveLength(3)
    expect(cards[0].get('img').element).toBe(finishedImage)
    expect(cards[1].get('img').attributes('src')).toBe('data:image/png;base64,Qw==')
    expect(cards[2].classes()).toContain('is-missing')
    expect(wrapper.get('.partial-result-notice strong').text()).toBe('1 张图片未生成')
    expect(wrapper.get('.partial-result-notice p').text()).toBe('上游超时')
    expect(cards[2].get('.result-missing-media p').text()).toBe('点击“重新生成”，单独重做这张图片')
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('编辑区的新提示词')
  })

  it('regenerates every missing image from the banner in the same work', async () => {
    const work = {
      id: 'retry-all-missing-images', type: 'image', status: 'completed', prompt: '原作品提示词',
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name,
      groupId: image2Group.id, apiKeyId: image2Key.id, imageCapability: 'image2',
      createdAt: 1, updatedAt: 2, outputs: ['data:image/png;base64,QQ=='], outputCount: 4,
      imageOutputIndexes: [1], aspectRatio: '3:2', resolution: '2K',
      outputSize: '2048x1360', imageSizeMode: 'ratio', quality: 'high', outputFormat: 'png',
      error: '已同步 1 / 4 张；其余图片生成失败或任务已中断，请带回参数重新生成。',
    }
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    listHistory.mockResolvedValue([work])
    const finishers: Array<(result: unknown) => void> = []
    generateImage.mockImplementation(() => new Promise(resolve => { finishers.push(resolve) }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    const notice = wrapper.get('.partial-result-notice')
    expect(notice.get('strong').text()).toBe('3 张图片未生成')
    // The sync summary would only repeat the count, so no reason tooltip is set.
    expect(notice.get('strong').attributes('title')).toBeUndefined()
    await notice.get('button').trigger('click')
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(3))
    await flushPromises()
    expect(generateImage.mock.calls.every(call => call[1].n === 1 && call[1].prompt === work.prompt)).toBe(true)
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    expect(wrapper.findAll('.result-missing-media.is-regenerating')).toHaveLength(3)
    expect(wrapper.find('.partial-result-notice').exists()).toBe(false)
    expect(wrapper.findAll('.history-item-hitbox')).toHaveLength(1)

    finishers.forEach((finish, index) => finish({ data: [{ url: `data:image/png;base64,R${index}==` }] }))
    await flushPromises()
    const saved = putHistory.mock.calls.at(-1)?.[0]
    expect(saved).toMatchObject({ id: work.id, status: 'completed', imageFailedIndexes: [] })
    expect(saved?.outputs).toHaveLength(4)
    expect([...saved!.imageOutputIndexes!].sort()).toEqual([0, 1, 2, 3])
    expect(saved?.error).toBeUndefined()
    expect(wrapper.find('.partial-result-notice').exists()).toBe(false)
    expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(0)
  })

  it('lets another failed image be retried while one retry is still generating', async () => {
    const work = {
      id: 'retry-image-slots-together', type: 'image', status: 'completed', prompt: '原作品提示词',
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name,
      groupId: image2Group.id, apiKeyId: image2Key.id, imageCapability: 'image2',
      createdAt: 1, updatedAt: 2, outputs: ['data:image/png;base64,QQ=='], outputCount: 3,
      imageOutputIndexes: [0], imageFailedIndexes: [1, 2], aspectRatio: '3:2', resolution: '2K',
      outputSize: '2048x1360', imageSizeMode: 'ratio', quality: 'high', outputFormat: 'png',
      error: '已生成 1 / 3 张，其余 2 张生成失败：上游超时',
    }
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    listHistory.mockResolvedValue([work])
    const finishers: Array<(result: unknown) => void> = []
    generateImage.mockImplementation(() => new Promise(resolve => { finishers.push(resolve) }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    await wrapper.get('[data-result-index="1"] .result-shot-retry').trigger('click')
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(1))
    await flushPromises()
    // While image 2 is drawing in its card, image 3 can still be retried; the banner counts only image 3.
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    const cards = wrapper.findAll('.result-card')
    expect(cards[1].get('.result-missing-media').classes()).toContain('is-regenerating')
    expect(cards[2].get('.result-missing-media p').text()).toBe('点击“重新生成”，单独重做这张图片')
    expect(wrapper.get('.partial-result-notice strong').text()).toBe('1 张图片未生成')
    const secondRetry = cards[2].get('.result-shot-retry')
    expect(secondRetry.attributes('disabled')).toBeUndefined()
    await secondRetry.trigger('click')
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(2))
    await flushPromises()
    expect(wrapper.findAll('.result-card')[2].get('.result-missing-media').classes()).toContain('is-regenerating')

    // The later retry may finish first; both land in their own slots.
    finishers[1]({ data: [{ url: 'data:image/png;base64,Qg==' }] })
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    expect(wrapper.findAll('.result-card')).toHaveLength(3)
    finishers[0]({ data: [{ url: 'data:image/png;base64,Qw==' }] })
    await flushPromises()

    const saved = putHistory.mock.calls.at(-1)?.[0]
    expect(saved).toMatchObject({ id: work.id, status: 'completed', imageFailedIndexes: [] })
    expect(saved?.error).toBeUndefined()
    const slots = new Map(saved!.outputs.map((output: string, index: number) => [saved!.imageOutputIndexes![index], output]))
    expect(slots.get(1)).toBe('data:image/png;base64,Qw==')
    expect(slots.get(2)).toBe('data:image/png;base64,Qg==')
    expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(0)
    expect(wrapper.findAll('.history-item-hitbox')).toHaveLength(1)
  })

  it('redraws a finished image in place and keeps the original when the redraw fails', async () => {
    const work = {
      id: 'redraw-finished-image', type: 'image', status: 'completed', prompt: '原作品提示词',
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name,
      groupId: image2Group.id, apiKeyId: image2Key.id, imageCapability: 'image2',
      createdAt: 1, updatedAt: 2, outputs: ['data:image/png;base64,QQ==', 'data:image/png;base64,Qg=='], outputCount: 2,
      imageOutputIndexes: [0, 1], aspectRatio: '1:1', resolution: '1K',
      outputSize: '1024x1024', imageSizeMode: 'ratio', quality: 'auto', outputFormat: 'png',
    }
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    listHistory.mockResolvedValue([work])
    const finishers: Array<{ resolve: (result: unknown) => void; reject: (error: unknown) => void }> = []
    generateImage.mockImplementation(() => new Promise((resolve, reject) => { finishers.push({ resolve, reject }) }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    await wrapper.get('[data-result-index="1"] .result-redraw-action').trigger('click')
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(1))
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    let cards = wrapper.findAll('.result-card')
    expect(cards[0].get('img').attributes('src')).toBe('data:image/png;base64,QQ==')
    // The original stays visible while it is redrawn; only its redraw button is disabled.
    expect(cards[1].get('img').attributes('src')).toBe('data:image/png;base64,Qg==')
    expect(cards[1].get('.result-redraw-action').attributes('disabled')).toBeDefined()
    expect(cards[0].get('.result-redraw-action').attributes('disabled')).toBeUndefined()
    expect(cards[1].get('.result-redraw-overlay strong').text()).toBe('正在重新生成')
    expect(cards[0].find('.result-redraw-overlay').exists()).toBe(false)

    finishers[0].resolve({ data: [{ url: 'data:image/png;base64,Qw==' }] })
    await flushPromises()
    cards = wrapper.findAll('.result-card')
    expect(cards[1].get('img').attributes('src')).toBe('data:image/png;base64,Qw==')
    expect(putHistory.mock.calls.at(-1)?.[0]).toMatchObject({ id: work.id, status: 'completed', imageFailedIndexes: [] })

    // A failed redraw puts the previous image back in the same slot.
    await wrapper.get('[data-result-index="1"] .result-redraw-action').trigger('click')
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(2))
    await flushPromises()
    finishers[1].reject(new Error('上游超时'))
    await flushPromises()
    cards = wrapper.findAll('.result-card')
    expect(cards).toHaveLength(2)
    expect(cards[1].get('img').attributes('src')).toBe('data:image/png;base64,Qw==')
    const saved = putHistory.mock.calls.at(-1)?.[0]
    expect(saved).toMatchObject({ id: work.id, status: 'completed', imageFailedIndexes: [] })
    expect(saved?.error).toBeUndefined()
    expect(wrapper.findAll('.history-item-hitbox')).toHaveLength(1)
  })

  it('redraws several finished images at the same time and keeps the original of each failed one', async () => {
    const work = {
      id: 'redraw-several-images', type: 'image', status: 'completed', prompt: '原作品提示词',
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name,
      groupId: image2Group.id, apiKeyId: image2Key.id, imageCapability: 'image2',
      createdAt: 1, updatedAt: 2, outputCount: 3,
      outputs: ['data:image/png;base64,QQ==', 'data:image/png;base64,Qg==', 'data:image/png;base64,Qw=='],
      imageOutputIndexes: [0, 1, 2], aspectRatio: '1:1', resolution: '1K',
      outputSize: '1024x1024', imageSizeMode: 'ratio', quality: 'auto', outputFormat: 'png',
    }
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    listHistory.mockResolvedValue([work])
    const finishers: Array<{ resolve: (result: unknown) => void; reject: (error: unknown) => void }> = []
    generateImage.mockImplementation(() => new Promise((resolve, reject) => { finishers.push({ resolve, reject }) }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    // Redraw sits right after preview; download is the last action.
    const titles = wrapper.get('[data-result-index="0"] .result-media-actions').findAll('button').map(button => button.attributes('title'))
    expect(titles[1]).toContain('重新生成')
    expect(titles.at(-1)).toBe('下载作品')

    const coverSource = () => wrapper.findComponent(CreatorThumbnail).props('src')
    expect(coverSource()).toBe('data:image/png;base64,QQ==')
    await wrapper.get('[data-result-index="0"] .result-redraw-action').trigger('click')
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(1))
    await flushPromises()
    // Redrawing the cover image keeps the same history thumbnail instead of reloading another one.
    expect(coverSource()).toBe('data:image/png;base64,QQ==')
    // The other images can still be redrawn while the first one is drawing.
    const other = wrapper.get('[data-result-index="2"] .result-redraw-action')
    expect(other.attributes('disabled')).toBeUndefined()
    await other.trigger('click')
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(2))
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    let cards = wrapper.findAll('.result-card')
    expect(cards).toHaveLength(3)
    expect(cards.map(card => card.get('img').attributes('src'))).toEqual([
      'data:image/png;base64,QQ==', 'data:image/png;base64,Qg==', 'data:image/png;base64,Qw==',
    ])
    expect(cards.map(card => card.get('.result-redraw-action').attributes('disabled') !== undefined)).toEqual([true, false, true])

    // The second redraw fails first: its original image comes back at once.
    finishers[1].reject(new Error('上游超时'))
    await flushPromises()
    cards = wrapper.findAll('.result-card')
    expect(cards[2].get('img').attributes('src')).toBe('data:image/png;base64,Qw==')
    expect(cards[2].get('.result-redraw-action').attributes('disabled')).toBeUndefined()
    expect(cards[0].get('.result-redraw-action').attributes('disabled')).toBeDefined()
    expect(showWarning).toHaveBeenCalledWith('图片 3 重新生成失败，已保留原图')

    finishers[0].resolve({ data: [{ url: 'data:image/png;base64,RA==' }] })
    await flushPromises()
    cards = wrapper.findAll('.result-card')
    expect(cards.map(card => card.get('img').attributes('src'))).toEqual([
      'data:image/png;base64,RA==', 'data:image/png;base64,Qg==', 'data:image/png;base64,Qw==',
    ])
    const saved = putHistory.mock.calls.at(-1)?.[0]
    expect(saved).toMatchObject({ id: work.id, status: 'completed', imageFailedIndexes: [] })
    expect(saved?.error).toBeUndefined()
    expect(saved?.outputs).toHaveLength(3)
    expect(wrapper.findAll('.history-item-hitbox')).toHaveLength(1)
    expect(showSuccess).not.toHaveBeenCalledWith('作品生成完成')
  })

  it('redraws a single failed image inside the same work', async () => {
    const work = {
      id: 'retry-single-image', type: 'image', status: 'failed', prompt: '原作品提示词',
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name,
      groupId: image2Group.id, apiKeyId: image2Key.id, imageCapability: 'image2',
      createdAt: 1, updatedAt: 2, outputs: [], outputCount: 1, aspectRatio: '1:1', resolution: '1K',
      outputSize: '1024x1024', imageSizeMode: 'ratio', quality: 'auto', outputFormat: 'png',
      error: 'GPT Image 上游服务暂时不可用，请稍后点击“重新生成”；如果频繁出现，请检查该分组的 GPT Image 账号状态。',
    }
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    listHistory.mockResolvedValue([work])
    let finish: ((result: unknown) => void) | undefined
    generateImage.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    expect(wrapper.get('.result-error p').text()).toBe('GPT Image 上游暂时不可用，请稍后重试。')
    expect(wrapper.get('.result-heading h2').text()).toBe('这次没有完成')

    await wrapper.get('.result-error button').trigger('click')
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(1))
    await flushPromises()
    // The failure box turns into a loader in place instead of switching views.
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    expect(wrapper.get('.result-error').classes()).toContain('muted')
    expect(wrapper.get('.result-error strong').text()).toBe('正在重新生成')
    // A running retry is not reported as unfinished: the title says so and the pill ticks.
    expect(wrapper.get('.result-heading h2').text()).toBe('正在生成')
    expect(wrapper.get('.result-heading .generation-elapsed-pill').text()).toContain('耗时')
    // Submitting the whole work again stays available beside the in-place retry.
    const regenerate = wrapper.findAll('.result-heading-actions button').find(button => button.text() === '重新生成')
    expect(regenerate?.attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.generate-button').text()).toContain('开始生成')
    finish!({ data: [{ url: 'data:image/png;base64,QQ==' }] })
    await flushPromises()

    expect(putHistory.mock.calls.at(-1)?.[0]).toMatchObject({
      id: work.id, status: 'completed', outputs: ['data:image/png;base64,QQ=='],
    })
    expect(putHistory.mock.calls.every(([saved]) => saved.id === work.id)).toBe(true)
    expect(wrapper.findAll('.history-item-hitbox')).toHaveLength(1)
  })

  it('keeps the requested Grok tier when inspecting an older original larger than 1024px', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listHistory.mockResolvedValue([{
      id: 'grok-original', type: 'image', status: 'completed', prompt: '已有图片',
      model: 'grok-imagine-image-2.0', provider: 'Grok 生图', groupName: group.name,
      createdAt: 1, updatedAt: 1, outputs: ['data:image/png;base64,UE5H'],
      imageCapability: 'grok', aspectRatio: '3:2', resolution: '1K',
      actualOutputSize: '1248x832', upstreamImageSizes: ['1248x832'],
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    expect(wrapper.get('.history-item-hitbox').element.parentElement?.textContent).toContain('1K · 1248×832')
    wrapper.unmount()
  })

  it('scrolls the canvas back to the top when a history work is opened', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listHistory.mockResolvedValue([{
      id: 'scrolled-work', type: 'image', status: 'completed', prompt: '已有图片',
      model: 'gpt-image-2', provider: 'Image 生图', groupName: group.name,
      createdAt: 1, updatedAt: 1, outputs: ['data:image/png;base64,UE5H'],
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    const canvas = wrapper.get('.canvas-panel').element as HTMLElement
    canvas.scrollTop = 480
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    expect(canvas.scrollTop).toBe(0)
    wrapper.unmount()
  })

  it('keeps the model selector stable while a capability model list is loading', async () => {
    let resolveImage2Models: ((models: Array<{ id: string }>) => void) | undefined
    const pendingImage2Models = new Promise<Array<{ id: string }>>(resolve => {
      resolveImage2Models = resolve
    })
    const stableImage2Key = { ...image2Key, key: 'sk-image2-stable-loading-test' }
    listGroups.mockResolvedValue([group, image2Group])
    listKeys.mockResolvedValue({ items: [createdKey, stableImage2Key], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockImplementation((key: string) => key === stableImage2Key.key
      ? pendingImage2Models
      : Promise.resolve([{ id: 'grok-imagine-image' }]))

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-image')

    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await wrapper.vm.$nextTick()

    const loadingSelect = wrapper.get<HTMLSelectElement>('#creator-model')
    expect(loadingSelect.element.value).toBe('grok-imagine-image')
    expect(loadingSelect.findAll('option').map(option => option.attributes('value'))).toContain('grok-imagine-image')
    expect(loadingSelect.attributes('aria-busy')).toBe('true')

    resolveImage2Models?.([{ id: 'gpt-image-2' }, { id: 'gpt-image-2-4k' }])
    await flushPromises()

    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('gpt-image-2')
    expect(wrapper.get<HTMLSelectElement>('#creator-model').attributes('aria-busy')).toBe('false')
  })

  it.each(['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'])('submits the selected Image2 model %s even when gpt-image-2 is available', async model => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'gpt-image-2' },
      { id: model },
    ])
    const wrapper = mount(CreatorStudioView, {
      global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } },
    })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await flushPromises()
    await wrapper.get('#creator-model').setValue(model)
    await wrapper.get('#creator-prompt').setValue('画一只猫')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledWith(image2Key.key, expect.objectContaining({ model }))
    expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ model }))
    wrapper.unmount()
  })

  it('keeps an Image2 server task in history until its image is saved', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    submitImageTask.mockResolvedValue({ id: 'imgtask_1' })
    getImageTask.mockResolvedValue({ status: 'completed', result: { data: [{ url: 'data:image/png;base64,UE5H' }] } })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('画一只猫')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(submitImageTask).toHaveBeenCalledWith(image2Key.key, expect.objectContaining({ model: 'gpt-image-2' }))
    expect(generateImage).not.toHaveBeenCalled()
    expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ imageTaskIds: ['imgtask_1'], status: 'pending' }))
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'completed',
      imageTaskIds: [],
      outputs: ['data:image/png;base64,UE5H'],
    }))
    wrapper.unmount()
  })

  it('hides the generation settings while a finished result is open until a new creation starts', async () => {
    listGroups.mockResolvedValue([image2Group])
    listHistory.mockResolvedValue([{
      id: 'finished-result', type: 'image', status: 'completed', prompt: '夏季高山草原',
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name, groupId: image2Group.id,
      apiKeyId: image2Key.id, imageCapability: 'image2', createdAt: Date.now() - 60_000, updatedAt: Date.now() - 50_000,
      outputs: ['data:image/png;base64,AAAA'], outputCount: 1,
    }])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    expect(wrapper.get('.studio-grid').classes()).not.toContain('is-viewing-result')

    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    expect(wrapper.find('.result-workspace').exists()).toBe(true)
    expect(wrapper.get('.studio-grid').classes()).toContain('is-viewing-result')

    const newCreation = wrapper.findAll('.result-heading-continue button').find(button => button.text().includes('新建创作'))
    await newCreation!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.result-workspace').exists()).toBe(false)
    expect(wrapper.get('.studio-grid').classes()).not.toContain('is-viewing-result')
    wrapper.unmount()
  })

  it('hides the generation settings while generating and shows the full prompt without a toggle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const prompt = '一只深灰色双肩包的面料局部，水珠在防水涂层表面滚成圆珠不渗透。'.repeat(4)
    listGroups.mockResolvedValue([image2Group])
    listHistory.mockResolvedValue([{
      id: 'long-prompt', type: 'image', status: 'pending', prompt,
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name, groupId: image2Group.id,
      apiKeyId: image2Key.id, imageCapability: 'image2', createdAt: Date.now() - 60_000, updatedAt: Date.now() - 50_000,
      outputs: [], outputCount: 1, imageTaskIds: ['imgtask_long'],
    }])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    getImageTask.mockResolvedValue({ status: 'processing' })
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()
      expect(wrapper.get('.studio-grid').classes()).not.toContain('is-generating')
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()

      expect(wrapper.get('.studio-grid').classes()).toContain('is-generating')
      expect(wrapper.get('.result-card .result-prompt').text()).toBe(prompt)
      expect(wrapper.find('.generation-prompt-toggle').exists()).toBe(false)

      // Leaving the progress view brings the settings back.
      await wrapper.get('.new-creation-command').trigger('click')
      await flushPromises()
      expect(wrapper.get('.studio-grid').classes()).not.toContain('is-generating')
      wrapper.unmount()
    } finally {
      getImageTask.mockReset()
      vi.useRealTimers()
    }
  })

  it('loads a refreshed image work from its saved server task', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const work = {
      id: 'refreshed-image',
      type: 'image',
      status: 'pending',
      prompt: '年轻人坐在公寓窗边阅读',
      model: 'gpt-image-2',
      provider: 'Image2 生图',
      groupName: image2Group.name,
      groupId: image2Group.id,
      apiKeyId: image2Key.id,
      imageCapability: 'image2',
      createdAt: Date.now() - 60_000,
      updatedAt: Date.now() - 50_000,
      outputs: [],
      outputCount: 2,
      imageTaskIds: ['imgtask_a'],
    } as const
    listGroups.mockResolvedValue([image2Group])
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    submitImageTask.mockResolvedValue({ id: 'imgtask_next' })
    getImageTask
      .mockResolvedValueOnce({ status: 'processing' })
      .mockResolvedValueOnce({ status: 'completed', result: { data: [{ url: 'data:image/png;base64,QQ==' }] } })
      .mockResolvedValueOnce({ status: 'completed', result: { data: [{ url: 'data:image/png;base64,Qg==' }] } })
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()
      // Polling starts on page load, before the work is opened.
      expect(getImageTask).toHaveBeenCalledWith(image2Key.key, 'imgtask_a', expect.anything())
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      expect(getImageTask).toHaveBeenCalledTimes(1)
      expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(3000)
      await flushPromises()
      expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(false)
      // The image that was never submitted before the refresh is submitted now.
      expect(submitImageTask).toHaveBeenCalledTimes(1)
      expect(submitImageTask).toHaveBeenCalledWith(image2Key.key, expect.objectContaining({ model: 'gpt-image-2', prompt: work.prompt, n: 1 }))
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({
        id: work.id,
        status: 'completed',
        imageTaskIds: [],
        outputs: ['data:image/png;base64,QQ==', 'data:image/png;base64,Qg=='],
      }))
      expect(putHistory).not.toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.anything() }))
      expect(generateImage).not.toHaveBeenCalled()
      expect(showSuccess).toHaveBeenCalledWith('图片已同步到本地')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps original image slots when saved server tasks finish after a refresh', async () => {
    const work = {
      id: 'resumed-image-slots', type: 'image', status: 'pending', prompt: '三张图片',
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name,
      groupId: image2Group.id, apiKeyId: image2Key.id, imageCapability: 'image2',
      createdAt: 1, updatedAt: 1, outputs: ['data:image/png;base64,Qw=='], outputCount: 3,
      imageOutputIndexes: [2], imageTaskIds: ['image-first', 'image-second'],
      imageTaskIndexes: { 'image-first': 0, 'image-second': 1 },
    }
    listGroups.mockResolvedValue([image2Group])
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    getImageTask.mockImplementation(async (_key: string, id: string) => id === 'image-first'
      ? { status: 'completed', result: { data: [{ url: 'data:image/png;base64,QQ==' }] } }
      : { status: 'failed', error: new Error('第二张生成失败') })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      expect(submitImageTask).not.toHaveBeenCalled()
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({
        status: 'completed', imageOutputIndexes: [2, 0], imageFailedIndexes: [1], imageTaskIds: [], imageTaskIndexes: {},
      }))
      const cards = wrapper.findAll('.result-card')
      expect(cards).toHaveLength(3)
      expect(cards[0].get('img').attributes('src')).toBe('data:image/png;base64,QQ==')
      expect(cards[1].classes()).toContain('is-missing')
      expect(cards[2].get('img').attributes('src')).toBe('data:image/png;base64,Qw==')
    } finally { wrapper.unmount() }
  })

  it('shows drawing progress, not saving, while a refreshed work waits for its next image', async () => {
    const work = {
      id: 'resumed-image-progress', type: 'image', status: 'pending', prompt: '三张图片进度',
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name,
      groupId: image2Group.id, apiKeyId: image2Key.id, imageCapability: 'image2',
      createdAt: 1, updatedAt: 1, outputs: [], outputCount: 3,
      imageTaskIds: ['progress-first', 'progress-second', 'progress-third'],
      imageTaskIndexes: { 'progress-first': 0, 'progress-second': 1, 'progress-third': 2 },
    }
    listGroups.mockResolvedValue([image2Group])
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    getImageTask.mockImplementation((_key: string, id: string) => id === 'progress-first'
      ? Promise.resolve({ status: 'completed', result: { data: [{ url: 'data:image/png;base64,QQ==' }] } })
      : new Promise(() => {}))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('正在同时生成 3 张图片（已完成 1 张）')
      expect(wrapper.text()).not.toContain('正在保存原图到当前浏览器')
      expect(wrapper.get('.result-heading').text()).toContain('正在生成')
    } finally { wrapper.unmount() }
  })

  it('does not resubmit the rest of a refreshed image work that used reference images', async () => {
    const work = {
      id: 'refreshed-image-reference',
      type: 'image',
      status: 'pending',
      prompt: '把这张照片变成水彩画',
      model: 'gpt-image-2',
      provider: 'Image2 生图',
      groupName: image2Group.name,
      groupId: image2Group.id,
      apiKeyId: image2Key.id,
      imageCapability: 'image2',
      createdAt: Date.now() - 60_000,
      updatedAt: Date.now() - 50_000,
      outputs: [],
      outputCount: 2,
      referenceCount: 1,
      imageTaskIds: ['imgtask_r'],
    } as const
    listGroups.mockResolvedValue([image2Group])
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    getImageTask.mockResolvedValue({ status: 'completed', result: { data: [{ url: 'data:image/png;base64,QQ==' }] } })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    expect(submitImageTask).not.toHaveBeenCalled()
    expect(generateImage).not.toHaveBeenCalled()
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({
      id: work.id,
      status: 'completed',
      outputs: ['data:image/png;base64,QQ=='],
      error: expect.stringContaining('已同步 1 / 2 张'),
    }))
    wrapper.unmount()
  })

  it('fails a refreshed image whose server task timed out without resubmitting it', async () => {
    const work = {
      id: 'refreshed-image-abandoned',
      type: 'image',
      status: 'pending',
      prompt: '冬日清晨的江边',
      model: 'gpt-image-2',
      provider: 'Image2 生图',
      groupName: image2Group.name,
      groupId: image2Group.id,
      apiKeyId: image2Key.id,
      imageCapability: 'image2',
      createdAt: Date.now() - 12 * 3600_000,
      updatedAt: Date.now() - 12 * 3600_000,
      outputs: [],
      outputCount: 4,
      imageTaskIds: ['imgtask_s1', 'imgtask_s2'],
    } as const
    listGroups.mockResolvedValue([image2Group])
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    getImageTask.mockResolvedValue({
      status: 'failed',
      error: Object.assign(new Error('image generation task was interrupted or timed out; no image was returned'), { status: 504 }),
    })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    expect(getImageTask).toHaveBeenCalledTimes(2)
    expect(submitImageTask).not.toHaveBeenCalled()
    expect(generateImage).not.toHaveBeenCalled()
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ id: work.id, status: 'failed', imageTaskIds: [] }))
    wrapper.unmount()
  })

  it('keeps a refreshed image pending when its task status cannot be read yet', async () => {
    const work = {
      id: 'refreshed-image-offline',
      type: 'image',
      status: 'pending',
      prompt: '雨后的城市街角',
      model: 'gpt-image-2',
      provider: 'Image2 生图',
      groupName: image2Group.name,
      groupId: image2Group.id,
      apiKeyId: image2Key.id,
      imageCapability: 'image2',
      createdAt: Date.now() - 60_000,
      updatedAt: Date.now() - 50_000,
      outputs: [],
      outputCount: 1,
      imageTaskIds: ['imgtask_b'],
    } as const
    listGroups.mockResolvedValue([image2Group])
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    getImageTask.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }))
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      await vi.runAllTimersAsync()
      await flushPromises()

      expect(wrapper.find('.generation-state').exists()).toBe(false)
      expect(wrapper.get('.image-refresh-command').text()).toBe('刷新生成结果')
      expect(wrapper.text()).toContain('图片任务已保存在服务器')
      expect(putHistory).not.toHaveBeenCalledWith(expect.objectContaining({ id: work.id, status: 'failed' }))
      expect(showError).toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('expands, collapses, and pages through inline prompt templates', async () => {
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    expect(wrapper.find('.prompt-tool').exists()).toBe(true)
    expect(wrapper.find('.template-dialog').exists()).toBe(false)
    expect(wrapper.find('.prompt-template-grid').exists()).toBe(false)
    expect(wrapper.get('.prompt-toggle').text()).toBe('打开模板')
    expect(wrapper.text()).not.toContain('最多保留')
    expect(wrapper.text()).not.toContain('作品仅保存在当前浏览器')

    await wrapper.get('.prompt-toggle').trigger('click')
    expect(wrapper.findAll('.prompt-template-grid button')).toHaveLength(6)
    expect(wrapper.get('.prompt-toggle').text()).toBe('收起')

    const nextPage = wrapper.findAll('.prompt-page-actions button')[1]
    await nextPage.trigger('click')
    expect(wrapper.find('.prompt-page-actions > span').text()).toBe('2/17')
    expect(wrapper.findAll('.prompt-template-grid button')).toHaveLength(6)

    await nextPage.trigger('click')
    expect(wrapper.find('.prompt-page-actions > span').text()).toBe('3/17')
    expect(wrapper.findAll('.prompt-template-grid button')).toHaveLength(6)

    for (let page = 3; page < 17; page++) await nextPage.trigger('click')
    expect(wrapper.find('.prompt-page-actions > span').text()).toBe('17/17')
    const lastPageTemplates = wrapper.findAll('.prompt-template-grid button')
    expect(lastPageTemplates).toHaveLength(4)
    expect(lastPageTemplates[3].text()).toContain('远山层叠')
    await lastPageTemplates[3].trigger('click')
    expect((wrapper.get('#creator-prompt').element as HTMLTextAreaElement).value).toContain('层层山脊剪影')
    await nextPage.trigger('click')
    expect(wrapper.find('.prompt-page-actions > span').text()).toBe('1/17')

    await wrapper.get('.prompt-toggle').trigger('click')
    expect(wrapper.find('.prompt-template-grid').exists()).toBe(false)

    await wrapper.findAll('.mode-option')[1].trigger('click')
    await flushPromises()
    const videoTabs = wrapper.findAll('.video-capability-switch button')
    expect(videoTabs.map(button => button.text())).toEqual(['Seedance', 'Grok', 'MiniMax H3', 'Muse'])
    expect(videoTabs.map(button => button.attributes('disabled') !== undefined)).toEqual([false, false, false, false])
    expect(wrapper.get('.video-capability-switch button.active').text()).toBe('Seedance')
    await wrapper.get('.prompt-toggle').trigger('click')
    expect(wrapper.find('.prompt-page-actions > span').text()).toBe('1/17')
    expect(wrapper.findAll('.prompt-template-grid button')).toHaveLength(6)
    for (let page = 1; page < 17; page++) await wrapper.findAll('.prompt-page-actions button')[1].trigger('click')
    expect(wrapper.find('.prompt-page-actions > span').text()).toBe('17/17')
    const lastVideoTemplate = wrapper.findAll('.prompt-template-grid button')[3]
    expect(lastVideoTemplate.text()).toContain('远山后拉')
    await lastVideoTemplate.trigger('click')
    expect((wrapper.get('#creator-prompt').element as HTMLTextAreaElement).value).toContain('画面上方逐渐留出大片淡橙色天空')
  })

  it('updates the history heading when the history category changes', async () => {
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    expect(wrapper.get('.history-heading h2').text()).toBe('图片历史')
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    expect(wrapper.get('.history-heading h2').text()).toBe('视频历史')
    expect(wrapper.text()).toContain('还没有视频作品')
  })

  it('shows neither the empty nor the loading state under a single-page history list', async () => {
    listHistory.mockResolvedValue(Array.from({ length: 3 }, (_, index) => ({
      id: `single-page-${index}`, type: 'image', status: 'completed', prompt: `单页作品 ${index}`,
      model: 'grok-imagine-image', provider: 'grok', groupName: group.name,
      createdAt: index, updatedAt: index, outputs: ['data:image/png;base64,UE5H'],
    })))
    const wrapper = mount(CreatorStudioView, {
      global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } },
    })
    await flushPromises()

    expect(wrapper.findAll('.history-item')).toHaveLength(3)
    // Without a pager, the empty state used to chain off the pager and show under the list.
    expect(wrapper.find('.history-pager').exists()).toBe(false)
    expect(wrapper.find('.history-empty').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('还没有图片作品')
  })

  it('squares the sticky toolbar corners once it pins below the studio top', async () => {
    const wrapper = mount(CreatorStudioView, {
      attachTo: document.body,
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    const toolbar = wrapper.get('.studio-toolbar')
    const studio = wrapper.get('.creator-studio')
    const rect = (top: number) => ({ top } as DOMRect)
    // The card's 1px top border offsets the resting toolbar; that alone must not count as stuck.
    vi.spyOn(studio.element, 'clientTop', 'get').mockReturnValue(1)
    vi.spyOn(studio.element, 'getBoundingClientRect').mockReturnValue(rect(-200))
    const toolbarRect = vi.spyOn(toolbar.element, 'getBoundingClientRect').mockReturnValue(rect(-199))
    document.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => requestAnimationFrame(resolve))
    await nextTick()
    expect(toolbar.classes()).not.toContain('is-stuck')

    toolbarRect.mockReturnValue(rect(64))

    document.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => requestAnimationFrame(resolve))
    await nextTick()
    expect(toolbar.classes()).toContain('is-stuck')

    toolbarRect.mockReturnValue(rect(-199))
    document.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => requestAnimationFrame(resolve))
    await nextTick()
    expect(toolbar.classes()).not.toContain('is-stuck')
  })

  it('opens the history column by default on wide screens', async () => {
    const restoreViewport = mockViewportWidth(1920)
    onTestFinished(restoreViewport)
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    expect(wrapper.get('.studio-grid').classes()).not.toContain('history-collapsed')
    expect(wrapper.find('.studio-toolbar .history-reopen').exists()).toBe(false)
    expect(wrapper.find('.collapse-action').exists()).toBe(true)
    wrapper.unmount()
  })

  it('starts with desktop history collapsed and reopens it from the left toolbar without covering the workspace', async () => {
    const restoreViewport = mockViewportWidth(1440)
    onTestFinished(restoreViewport)
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    expect(wrapper.get('.history-panel').classes()).not.toContain('is-drawer')
    expect(wrapper.get('.history-panel').attributes('role')).toBeUndefined()
    // History is collapsed as soon as the page loads.
    expect(wrapper.get('.studio-grid').classes()).toContain('history-collapsed')
    expect(wrapper.find('.studio-toolbar .studio-title .history-reopen').exists()).toBe(true)

    await wrapper.get('.studio-toolbar .studio-title .history-reopen').trigger('click')
    expect(wrapper.get('.studio-grid').classes()).not.toContain('history-collapsed')

    await wrapper.get('.collapse-action').trigger('click')
    const reopenButton = wrapper.get('.studio-toolbar .studio-title .history-reopen')
    expect(reopenButton.element.previousElementSibling?.textContent).toBe('创作中心')
    expect(wrapper.find('.toolbar-actions .history-reopen').exists()).toBe(false)
    expect(reopenButton.attributes('aria-label')).toBe('展开历史记录')
    expect(reopenButton.get('.history-entry-copy small').text()).toBe('HISTORY')
    expect(reopenButton.get('.history-entry-copy strong').text()).toBe('历史记录')
    expect(reopenButton.attributes('aria-controls')).toBe('creator-history-panel')
    expect(reopenButton.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.studio-grid .history-reopen').exists()).toBe(false)
    expect(wrapper.get('.studio-grid').classes()).toContain('history-collapsed')
    expect(reopenButton.find('.playground-history-reopen-icon').exists()).toBe(true)

    await reopenButton.trigger('click')
    expect(wrapper.find('.history-reopen').exists()).toBe(false)
    expect(wrapper.find('.history-panel').exists()).toBe(true)
    expect(wrapper.get('.studio-grid').classes()).not.toContain('history-collapsed')
  })

  it('automatically rotates featured briefs every three seconds', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    expect(wrapper.get('.brief-topline > span:nth-child(2)').text()).toBe('01 / 100')
    expect(wrapper.get('.brief-summary h3').text()).toBe('白底主图')

    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.get('.brief-topline > span:nth-child(2)').text()).toBe('02 / 100')
    await vi.advanceTimersByTimeAsync(250)
    expect(wrapper.get('.brief-summary h3').text()).toBe('日照金山')

    await wrapper.findAll('.brief-topline button')[0].trigger('click')
    expect(wrapper.get('.brief-topline > span:nth-child(2)').text()).toBe('01 / 100')
    await vi.advanceTimersByTimeAsync(2999)
    expect(wrapper.get('.brief-topline > span:nth-child(2)').text()).toBe('01 / 100')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.get('.brief-topline > span:nth-child(2)').text()).toBe('02 / 100')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('selects any featured brief with the slider and wraps from the last brief', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CreatorStudioView, {
      global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } },
    })
    await flushPromises()

    const slider = wrapper.get('.brief-range')
    expect(slider.attributes('max')).toBe('100')
    await slider.setValue('100')
    expect(wrapper.get('.brief-position').text()).toBe('100/ 100')
    await vi.advanceTimersByTimeAsync(250)
    expect(wrapper.get('.brief-summary h3').text()).toBe('远山层叠')
    expect(slider.attributes('aria-valuetext')).toContain('远山层叠')

    await wrapper.findAll('.brief-topline button')[1].trigger('click')
    expect((slider.element as HTMLInputElement).value).toBe('1')
    expect(wrapper.get('.brief-position strong').text()).toBe('01')

    await wrapper.findAll('.mode-option')[1].trigger('click')
    await flushPromises()
    expect(slider.attributes('max')).toBe('100')
    await vi.advanceTimersByTimeAsync(250)
    expect(wrapper.get('.brief-summary h3').text()).toBe('360° 展示')
    expect(wrapper.findAll('.quick-templates button')).toHaveLength(10)
    await slider.setValue('100')
    await vi.advanceTimersByTimeAsync(250)
    expect(wrapper.get('.brief-summary h3').text()).toBe('远山后拉')
    expect(slider.attributes('aria-valuetext')).toContain('第 100 份，共 100 份')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('fills a random prompt from a quick category and never repeats the current one', async () => {
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    const categories = wrapper.findAll('.quick-templates button')
    expect(categories).toHaveLength(10)
    expect(categories[0].text()).toContain('电商产品')
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const prompt = wrapper.get<HTMLTextAreaElement>('#creator-prompt')
      await categories[0].trigger('click')
      const first = prompt.element.value
      expect(first).toContain('香水')
      expect(showSuccess).toHaveBeenCalledWith('已填入「电商产品」，请确认生成参数')

      await categories[0].trigger('click')
      expect(prompt.element.value).not.toBe(first)

      await wrapper.findAll('.mode-option')[1].trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.quick-templates button')[0].text()).toContain('产品广告')
    } finally {
      random.mockRestore()
      wrapper.unmount()
    }
  })

  it('on mobile, returns the page to the top when a mode tab is tapped', async () => {
    const restoreViewport = mockViewportWidth(390)
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()
      vi.mocked(window.scrollTo).mockClear()

      await wrapper.get('.mode-option-video').trigger('click')
      await flushPromises()
      expect(wrapper.get('.mode-option-video').classes()).toContain('active')
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

      vi.mocked(window.scrollTo).mockClear()
      await wrapper.get('.mode-option-video').trigger('click')
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

      vi.mocked(window.scrollTo).mockClear()
      await wrapper.get('.mode-option-image').trigger('click')
      await flushPromises()
      expect(wrapper.get('.mode-option-image').classes()).toContain('active')
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
      wrapper.unmount()
    } finally {
      restoreViewport()
    }
  })

  it('on desktop, keeps the page scroll when a mode tab is tapped', async () => {
    const restoreViewport = mockViewportWidth(1440)
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()
      vi.mocked(window.scrollTo).mockClear()

      await wrapper.get('.mode-option-video').trigger('click')
      await flushPromises()
      expect(window.scrollTo).not.toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      restoreViewport()
    }
  })

  it('on mobile, keeps inline prompt selection in place and reveals the canvas on generate', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const restoreViewport = mockViewportWidth(390)
    const originalScrollIntoView = Element.prototype.scrollIntoView
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this) }
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()

      await wrapper.get('.prompt-toggle').trigger('click')
      const template = wrapper.findAll('.prompt-template-grid button')[0]
      const title = template.get('strong').text()
      await template.trigger('click')
      await flushPromises()
      expect(showSuccess).toHaveBeenCalledWith(`已填入「${title}」，请确认生成参数`)
      expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).not.toBe('')
      expect(template.classes()).toContain('active')
      expect(scrolled).toHaveLength(0)

      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      expect(generateImage).toHaveBeenCalledTimes(1)
      expect(scrolled.at(-1)?.classList.contains('canvas-panel')).toBe(true)
      wrapper.unmount()
    } finally {
      restoreViewport()
      Element.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it('on mobile, opens history as a drawer and closes it when a work is opened', async () => {
    const restoreViewport = mockViewportWidth(390)
    const originalScrollIntoView = Element.prototype.scrollIntoView
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this) }
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    listHistory.mockResolvedValue([{
      id: 'mobile-work', type: 'image', status: 'completed', prompt: '手机上的作品', model: 'grok-imagine-image',
      provider: 'Grok 生图', groupName: group.name, createdAt: 1, updatedAt: 1, outputCount: 1,
      outputs: ['data:image/png;base64,UE5H'], aspectRatio: '1:1', resolution: '1K',
    }])
    try {
      const wrapper = mount(CreatorStudioView, {
        attachTo: document.body,
        global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } },
      })
      await flushPromises()

      const panel = wrapper.get('#creator-history-panel')
      const toggle = wrapper.get('.toolbar-actions .history-drawer-toggle')
      expect(panel.classes()).toContain('is-drawer')
      expect(panel.attributes('role')).toBe('dialog')
      expect(panel.attributes('aria-hidden')).toBe('true')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(toggle.get('.history-drawer-toggle-label').text()).toBe('历史记录')
      expect(toggle.text()).not.toMatch(/\d/)

      await toggle.trigger('click')
      await flushPromises()
      expect(panel.classes()).toContain('open')
      expect(panel.attributes('aria-hidden')).toBeUndefined()
      expect(toggle.attributes('aria-expanded')).toBe('true')
      expect(document.activeElement).toBe(wrapper.get('[aria-label="关闭作品历史"]').element)

      await panel.trigger('keydown', { key: 'Escape' })
      await flushPromises()
      expect(panel.classes()).not.toContain('open')
      expect(document.activeElement).toBe(toggle.element)

      await toggle.trigger('click')
      await wrapper.get('.history-drawer-backdrop').trigger('click')
      expect(panel.classes()).not.toContain('open')

      await toggle.trigger('click')
      await wrapper.get('[aria-label="打开作品：手机上的作品"]').trigger('click')
      await flushPromises()
      expect(panel.classes()).not.toContain('open')
      expect(wrapper.get('.result-heading h2').text()).toBe('本次创作')
      expect(scrolled).toHaveLength(0)
      expect(windowScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
      wrapper.unmount()
    } finally {
      restoreViewport()
      Element.prototype.scrollIntoView = originalScrollIntoView
      windowScrollTo.mockRestore()
    }
  })

  it('shows only the file-size error when an oversized reference image is selected', async () => {
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    const oversized = new File(['oversized'], 'large-reference.png', { type: 'image/png' })
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 })
    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [oversized] })
    await input.trigger('change')

    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith('large-reference.png 超过 10MB')
    expect(wrapper.find('.reference-item').exists()).toBe(false)
    wrapper.unmount()
  })

  it('follows the first reference image size by default', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const bitmapSizes = [{ width: 4000, height: 1000 }, { width: 3000, height: 2000 }, { width: 900, height: 1600 }]
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ ...bitmapSizes.shift()!, close: vi.fn() })))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      expect(wrapper.get('#creator-output-size').text()).toContain('自动')
      const input = wrapper.get<HTMLInputElement>('input[type="file"]')
      const upload = async (name: string) => {
        Object.defineProperty(input.element, 'files', { configurable: true, value: [new File([name], `${name}.png`, { type: 'image/png' })] })
        await input.trigger('change')
        await flushPromises()
      }

      // 4:1 is beyond GPT Image's 3:1 limit, so the size stays automatic.
      await upload('banner')
      expect(wrapper.get('#creator-output-size').text()).toContain('自动')
      await wrapper.get('.reference-item button').trigger('click')
      await flushPromises()

      await upload('wide')
      expect(wrapper.get('#creator-output-size').text()).toContain('4K · 跟随原图')
      expect(showInfo).toHaveBeenCalledWith('已按参考图调整输出尺寸：4K · 跟随原图 · 3008×2000')
      await wrapper.get('#creator-output-size').trigger('click')
      expect(wrapper.get('.image-size-result').text()).toContain('3008×2000')
      await wrapper.get('.image-size-cancel').trigger('click')

      // Later references do not override the size taken from the first one.
      await upload('tall')
      expect(wrapper.findAll('.reference-item')).toHaveLength(2)
      expect(wrapper.get('#creator-output-size').text()).toContain('4K · 跟随原图')
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('reopens a work generated from the reference size as following the reference', async () => {
    const work = {
      id: 'image2-follow-reference',
      type: 'image',
      status: 'completed',
      prompt: '五只同款保温杯',
      model: 'gpt-image-2',
      provider: 'Image 生图',
      groupName: image2Group.name,
      groupId: image2Group.id,
      imageCapability: 'image2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,UE5H'],
      aspectRatio: '3:2',
      resolution: '2K',
      outputSize: '1536x1024',
      imageSizeMode: 'ratio',
      outputCount: 1,
      outputFormat: 'png',
      referenceBlobs: [new Blob(['reference'], { type: 'image/png' })],
    } as const
    listHistory.mockResolvedValue([work])
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1536, height: 1024, close: vi.fn() })))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      expect(wrapper.get('#creator-output-size').text()).toContain('2K · 跟随原图')
      expect(wrapper.get('#creator-output-size').text()).not.toContain('自定义')
      await wrapper.get('#creator-output-size').trigger('click')
      expect(wrapper.get('.image-size-result').text()).toContain('1536×1024')
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('keeps the reference shape across tiers and lets the size dialog switch it off', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 2000, close: vi.fn() })))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      const input = wrapper.get<HTMLInputElement>('input[type="file"]')
      Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['tall'], 'tall.png', { type: 'image/png' })] })
      await input.trigger('change')
      await flushPromises()
      // The original 1200×2000 is a 2K size and is used as is.
      expect(wrapper.get('#creator-output-size').text()).toContain('2K · 跟随原图')

      await wrapper.get('#creator-output-size').trigger('click')
      const followButton = () => wrapper.findAll('.image-ratio-grid button').find(button => button.text() === '跟随原图')!
      const tierButton = (tier: string) => wrapper.findAll('.image-resolution-grid button').find(button => button.text().startsWith(tier))!
      expect(followButton().classes()).toContain('active')
      expect(wrapper.get('.image-size-result').text()).toContain('1200×2000')
      // At 4K the shape scales up within the pixel limit.
      await tierButton('4K').trigger('click')
      expect(wrapper.get('.image-size-result').text()).toContain('2224×3712')
      // 3:5 at 1K would fall below the minimum pixel count, so the option is unavailable there.
      await tierButton('1K').trigger('click')
      expect(followButton().attributes('disabled')).toBeDefined()
      await tierButton('2K').trigger('click')
      await wrapper.findAll('.image-ratio-grid button').find(button => button.text() === '1:1')!.trigger('click')
      await wrapper.get('.image-size-confirm').trigger('click')
      expect(wrapper.get('#creator-output-size').text()).toContain('2K · 2048×2048')
      expect(wrapper.get('#creator-output-size').text()).not.toContain('跟随原图')

      await wrapper.get('#creator-output-size').trigger('click')
      await followButton().trigger('click')
      await wrapper.get('.image-size-confirm').trigger('click')
      expect(wrapper.get('#creator-output-size').text()).toContain('2K · 跟随原图')

      await wrapper.get('.reference-item button').trigger('click')
      await flushPromises()
      expect(wrapper.get('#creator-output-size').text()).not.toContain('跟随原图')
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('pages a long history and reads only the shown page of originals', async () => {
    // Finished works come back deferred: their originals are read when their page is shown.
    listHistory.mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({
      id: `large-history-${index}`, type: 'image', status: 'completed',
      prompt: `作品 ${index}`, model: 'grok-imagine-image', provider: 'grok', groupName: group.name,
      createdAt: 100 - index, updatedAt: 100 - index,
      outputs: [''], imageOutputsPending: true,
    })))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    expect(listHistory).toHaveBeenCalledWith({ deferImages: true })
    expect(wrapper.get('.history-count').text()).toBe('100')
    expect(wrapper.get('.history-tabs').text()).toContain('图片 100')
    expect(wrapper.findAll('.history-item')).toHaveLength(20)
    expect(readHistoryImages.mock.calls.map(([work]) => work.id)).toEqual(Array.from({ length: 20 }, (_, index) => `large-history-${index}`))
    expect(wrapper.find('.history-thumb-pending').exists()).toBe(false)
    expect(wrapper.findAll('.history-page-number').map(button => button.text())).toEqual(['1', '2', '3', '4', '5'])
    expect(wrapper.get('[aria-label="上一页"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[aria-label="第 5 页"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.history-page-number.active').text()).toBe('5')
    expect(wrapper.get('.history-list').text()).toContain('作品 90')
    expect(wrapper.get('.history-list').text()).not.toContain('作品 19')
    expect(readHistoryImages).toHaveBeenCalledTimes(40)
    expect(wrapper.get('[aria-label="下一页"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[aria-label="打开作品：作品 90"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.result-media img').attributes('src')).toBe('data:image/png;base64,TE9BREVE')
    // Each page is read once; returning to page 1 reuses its images.
    await wrapper.get('[aria-label="第 1 页"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.history-list').text()).toContain('作品 0')
    expect(readHistoryImages).toHaveBeenCalledTimes(40)
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    expect(wrapper.text()).toContain('还没有视频作品')
    expect(wrapper.find('.history-pager').exists()).toBe(false)
    wrapper.unmount()
  })

  it('reads a deferred work before opening it, even before its page finished reading', async () => {
    listHistory.mockResolvedValue([{
      id: 'deferred-open', type: 'image', status: 'completed', prompt: '延迟读取的作品',
      model: 'grok-imagine-image', provider: 'grok', groupName: group.name,
      createdAt: 1, updatedAt: 1, outputs: [''], imageOutputsPending: true,
    }])
    let finishRead!: () => void
    readHistoryImages.mockImplementationOnce(work => new Promise(resolve => {
      finishRead = () => resolve({ ...work, imageOutputsPending: undefined, outputs: ['data:image/png;base64,T1BFTg=='] })
    }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    expect(wrapper.find('.history-thumb-pending').exists()).toBe(true)
    await wrapper.get('[aria-label="打开作品：延迟读取的作品"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.result-media img').exists()).toBe(false)
    finishRead()
    await flushPromises()
    // The list and the opened work share one read.
    expect(readHistoryImages).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.history-thumb-pending').exists()).toBe(false)
    expect(wrapper.get('.result-media img').attributes('src')).toBe('data:image/png;base64,T1BFTg==')
    wrapper.unmount()
  })

  it('reads only the PNG header when opening an older large image', async () => {
    const header = new Uint8Array(24)
    header.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
    header.set([73, 72, 68, 82], 12)
    const dimensions = new DataView(header.buffer)
    dimensions.setUint32(16, 1024)
    dimensions.setUint32(20, 1024)
    const output = `data:image/png;base64,${btoa(String.fromCharCode(...header) + 'x'.repeat(100000))}`
    listHistory.mockResolvedValue([{
      id: 'legacy-large-png', type: 'image', status: 'completed', prompt: '大图',
      model: 'gpt-image-2', provider: 'Image2', groupName: image2Group.name,
      createdAt: 1, updatedAt: 1, outputs: [output],
      imageCapability: 'image2', imageSizeMode: 'ratio', aspectRatio: '1:1', outputSize: '1024x1024',
    }])
    const atobSpy = vi.spyOn(window, 'atob')
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    expect(atobSpy).toHaveBeenCalled()
    expect(atobSpy.mock.calls.every(([data]) => data.length <= 32)).toBe(true)
    expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ actualOutputSize: '1024x1024', outputs: [output] }))
    atobSpy.mockClear()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    expect(atobSpy).not.toHaveBeenCalled()
    atobSpy.mockRestore()
    wrapper.unmount()
  })

  it('reads saved Image2 pixels without resizing to the requested size', async () => {
    const header = new Uint8Array(24)
    header.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
    header.set([73, 72, 68, 82], 12)
    const dimensions = new DataView(header.buffer)
    dimensions.setUint32(16, 1248)
    dimensions.setUint32(20, 832)
    const output = `data:image/png;base64,${btoa(String.fromCharCode(...header))}`
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listHistory.mockResolvedValue([{
      id: 'image2-native-size', type: 'image', status: 'completed', prompt: '实际尺寸',
      model: 'gpt-image-2', provider: 'GPT Image', groupName: image2Group.name,
      createdAt: 1, updatedAt: 1, outputs: [output],
      imageCapability: 'image2', imageSizeMode: 'ratio', aspectRatio: '2:3', resolution: '1K',
      outputSize: '688x1024', actualOutputSize: '688x1024',
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.find('.result-tags').text()).toContain('1K')
    expect(wrapper.find('.result-tags').text()).toContain('3:2')
    expect(wrapper.find('.result-tags').text()).toContain('1248×832')
    expect(wrapper.find('.result-stat-grid').text()).toContain('3:2')
    expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
      imageOutputSizes: ['1248x832'],
      actualOutputSize: '1248x832',
      outputs: [output],
    }))
    wrapper.unmount()
  })

  it('labels a legacy resized file by its stored pixels without trying to resize it back', async () => {
    const output = pngWithDimensions(3840, 1648)
    listHistory.mockResolvedValue([{
      id: 'legacy-resized-image', type: 'image', status: 'completed', prompt: '旧版已放大的图片',
      model: 'gpt-image-2.5-sunburst', provider: 'Image 生图', groupName: image2Group.name,
      createdAt: 1, updatedAt: 1, outputs: [output],
      imageCapability: 'image2', imageSizeMode: 'ratio', aspectRatio: '21:9', resolution: '4K',
      outputSize: '3840x1648', actualOutputSize: '3840x1648', upstreamImageSizes: ['1918x820'],
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      expect(wrapper.get('.result-tags').text()).toContain('3840×1648')
      expect(wrapper.get('.result-tags').text()).not.toContain('1918×820')
      expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
        outputs: [output], imageOutputSizes: ['3840x1648'], upstreamImageSizes: ['1918x820'],
      }))
    } finally { wrapper.unmount() }
  })

  it('adapts the result frame and ratio label to an auto-sized provider image', async () => {
    const output = 'data:image/png;base64,UE5H'
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listHistory.mockResolvedValue([{
      id: 'image2-auto-square', type: 'image', status: 'completed', prompt: '自动尺寸',
      model: 'gpt-image-2', provider: 'GPT Image', groupName: image2Group.name,
      createdAt: 1, updatedAt: 1, outputs: [output],
      imageCapability: 'image2', imageSizeMode: 'auto', aspectRatio: '2:3',
      outputFormat: 'gif', frameCount: 16, upstreamImageSizes: ['512x512'],
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    const media = wrapper.get<HTMLElement>('.result-media')
    expect(media.classes()).toContain('fitted')
    expect(media.attributes('style')).toContain('aspect-ratio: 1 / 1')
    expect(wrapper.get('.result-actions .result-tags').text()).toContain('1:1')
    expect(wrapper.get('.result-stat-grid').text()).toContain('1:1')
    expect(wrapper.get('.result-stat-grid').text()).toContain('512×512')
    wrapper.unmount()
  })

  it.each([
    ['390x439', '8:9', '390×439', '390 / 439'],
    ['436x388', '9:8', '436×388', '109 / 97'],
  ])('shows compact ratios for an unusual GIF size %s', async (size, ratio, dimensions, frameRatio) => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listHistory.mockResolvedValue([{
      id: `image2-gif-${size}`, type: 'image', status: 'completed', prompt: '自动尺寸 GIF',
      model: 'gpt-image-2.6-sunburst', provider: 'Image 生图', groupName: image2Group.name,
      createdAt: 1, updatedAt: 1, outputs: ['data:image/gif;base64,R0lGODlh'],
      imageCapability: 'image2', imageSizeMode: 'auto', aspectRatio: '2:3',
      outputFormat: 'gif', upstreamImageSizes: [size],
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.get('.result-actions .result-tags').text()).toContain(ratio)
    expect(wrapper.get('.result-actions .result-tags').text()).toContain(dimensions)
    expect(wrapper.get('.result-stat-grid').text()).toContain(ratio)
    expect(wrapper.get('.result-media').attributes('style')).toContain(`aspect-ratio: ${frameRatio}`)
    wrapper.unmount()
  })

  it('keeps a rounded standard pixel target as its selected ratio', async () => {
    listHistory.mockResolvedValue([{
      id: 'rounded-standard-size', type: 'image', status: 'completed', prompt: '标准尺寸',
      model: 'gpt-image-2.5-sunburst', provider: 'Image 生图', groupName: group.name,
      createdAt: 1, updatedAt: 1, outputs: ['data:image/png;base64,UE5H'],
      aspectRatio: '2:3', actualOutputSize: '688x1024', resolution: '1K',
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    const tags = wrapper.get('.result-actions .result-tags').text()
    expect(tags).toContain('2:3')
    expect(tags).not.toContain('43:64')
    wrapper.unmount()
  })

  it('shows local history without waiting for the group and key requests', async () => {
    const work = {
      id: 'image-history-early',
      type: 'image',
      status: 'completed',
      prompt: '先显示的本地作品',
      model: 'grok-imagine-image',
      provider: 'grok',
      groupName: group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,UE5H'],
    } as const
    let releaseHistory!: (items: unknown[]) => void
    listHistory.mockReturnValueOnce(new Promise(resolve => { releaseHistory = resolve }))
    let releaseGroups!: (groups: unknown[]) => void
    listGroups.mockReturnValueOnce(new Promise(resolve => { releaseGroups = resolve }))

    const wrapper = mount(CreatorStudioView, {
      global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } },
    })
    await flushPromises()
    // While reading, the list must not claim the history is empty.
    expect(wrapper.find('.history-loading').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('还没有图片作品')

    releaseHistory([work])
    await flushPromises()
    expect(wrapper.find('.history-loading').exists()).toBe(false)
    expect(wrapper.get('.history-item').text()).toContain('先显示的本地作品')
    releaseGroups([group])
    await flushPromises()
    wrapper.unmount()
  })

  it('reads the history once on the first KeepAlive mount and keeps works deleted during a read deleted', async () => {
    const imageWork = (id: string, createdAt: number) => ({
      id, type: 'image', status: 'completed', prompt: `作品 ${id}`, model: 'grok-imagine-image', provider: 'grok',
      groupName: group.name, createdAt, updatedAt: createdAt, outputs: ['data:image/png;base64,UE5H'],
    })
    const newest = imageWork('newest', 3)
    const middle = imageWork('middle', 2)
    const oldest = imageWork('oldest', 1)
    listHistory.mockResolvedValueOnce([newest, middle, oldest])
    // Under KeepAlive the first mount also activates; it must not start a second read.
    const addWindowListener = vi.spyOn(window, 'addEventListener')
    const wrapper = mount(defineComponent({
      setup: () => () => h(StudioRouteCache, { sessionKey: 1, view: h(CreatorStudioView) }),
    }), { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    // Call this studio's own focus handler: views left mounted by other tests also listen on window.
    const syncOnFocus = addWindowListener.mock.calls.find(([type]) => type === 'focus')?.[1] as EventListener
    addWindowListener.mockRestore()
    await flushPromises()
    expect(listHistory).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.history-item')).toHaveLength(3)

    // A refresh read that started before a delete must not bring the work back.
    let finishRead!: () => void
    listHistory.mockImplementationOnce(() => new Promise(resolve => { finishRead = () => resolve([newest, middle, oldest]) }))
    syncOnFocus(new Event('focus'))
    await flushPromises()
    expect(listHistory).toHaveBeenCalledTimes(2)
    await wrapper.findAll('.history-item-hitbox')[1].trigger('click')
    await flushPromises()
    await wrapper.get('.delete-work-command').trigger('click')
    await wrapper.get('.delete-work-command').trigger('click')
    await flushPromises()
    expect(removeHistory).toHaveBeenCalledWith('middle')
    finishRead()
    await flushPromises()
    expect(wrapper.findAll('.history-item').map(item => item.text())).toEqual([
      expect.stringContaining('作品 newest'),
      expect.stringContaining('作品 oldest'),
    ])
    wrapper.unmount()
  })

  it('opens a history card and deletes it from its hover actions', async () => {
    const work = {
      id: 'image-history-1',
      type: 'image',
      status: 'completed',
      prompt: '晨雾森林中的人物肖像',
      model: 'grok-imagine-image',
      provider: 'grok',
      groupName: group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,UE5H'],
      aspectRatio: '1:1',
      resolution: '1K',
    } as const
    listHistory.mockResolvedValue([work])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    // The list card only opens the work; deleting is only possible from inside the opened work.
    expect(wrapper.get('.history-item').findAll('button:not(.history-item-hitbox)')).toHaveLength(0)
    expect(wrapper.find('.history-item [aria-label="删除作品"]').exists()).toBe(false)
    expect(wrapper.get('.history-preview .creator-thumbnail').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('.history-preview [role="img"]').attributes('aria-label')).toBe('缩略图加载中')
    expect(wrapper.find('.history-preview img').exists()).toBe(false)
    await wrapper.get('.history-item-hitbox').trigger('click')
    expect(wrapper.get('.history-item').classes()).toContain('active')
    expect(wrapper.text()).toContain('本次创作')

    // The first click only arms delete; the second confirms it.
    await wrapper.get('.delete-work-command').trigger('click')
    await flushPromises()
    expect(removeHistory).not.toHaveBeenCalled()
    expect(wrapper.get('.delete-work-command').text()).toContain('确认删除')
    await wrapper.get('.delete-work-command').trigger('click')
    await flushPromises()
    expect(removeHistory).toHaveBeenCalledWith(work.id)
    expect(wrapper.find('.history-item').exists()).toBe(false)
    expect(wrapper.text()).toContain('还没有图片作品')
  })

  it('sizes portrait image result frames to the requested ratio instead of letterboxing', async () => {
    const work = {
      id: 'portrait-grid',
      type: 'image',
      status: 'completed',
      prompt: '夜晚的旧宅琴房',
      model: 'grok-imagine-image',
      provider: 'Grok 生图',
      groupName: group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,UE5H', 'data:image/png;base64,UE5I'],
      aspectRatio: '3:4',
      resolution: '1K',
    } as const
    listHistory.mockResolvedValue([work])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    const frames = wrapper.findAll('.result-grid .result-media')
    expect(frames).toHaveLength(2)
    for (const frame of frames) {
      expect(frame.classes()).toContain('fitted')
      expect(frame.classes()).not.toContain('landscape')
      expect(frame.attributes('style')).toContain('aspect-ratio: 3 / 4')
    }
  })

  it('closes the image preview with Escape and switches images with arrow keys', async () => {
    const work = {
      id: 'preview-keys',
      type: 'image',
      status: 'completed',
      prompt: '两辆车停在旷野公路旁',
      model: 'gemini-nano-banana-2.1',
      provider: 'Banner 生图',
      groupName: group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB', 'data:image/png;base64,CCC'],
    } as const
    listHistory.mockResolvedValue([work])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
      attachTo: document.body,
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    const images = wrapper.findAllComponents({ name: 'CreatorImage' })
    const resultImages = images.filter(image => image.classes().includes('result-media'))
    expect(resultImages).toHaveLength(3)
    resultImages[0].vm.$emit('preview')
    await flushPromises()

    const preview = () => wrapper.find('.image-preview')
    const previewSrc = () => wrapper.getComponent('.image-preview-content').props('src')
    expect(preview().exists()).toBe(true)
    expect(previewSrc()).toBe(work.outputs[0])

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await flushPromises()
    expect(previewSrc()).toBe(work.outputs[1])

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await flushPromises()
    expect(previewSrc()).toBe(work.outputs[0])

    await wrapper.get('.preview-nav.is-next').trigger('click')
    expect(previewSrc()).toBe(work.outputs[1])
    expect(preview().exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(preview().exists()).toBe(false)
    wrapper.unmount()
  })

  it('totals the billed requests once a failed task stays unbilled', async () => {
    getCreatorCosts.mockResolvedValue({ 'client:a': 0.01, 'client:b': 0.01, 'client:redraw': 0.01 })
    const work = {
      id: 'redrawn-batch',
      type: 'image',
      status: 'completed',
      prompt: '樱花古寺',
      model: 'gpt-image-2',
      provider: 'Image 生图',
      groupName: group.name,
      createdAt: Date.now() - 10 * 60_000,
      updatedAt: Date.now() - 9 * 60_000,
      completedAt: Date.now() - 9 * 60_000,
      outputs: ['data:image/png;base64,UE5H', 'data:image/png;base64,UE5H', 'data:image/png;base64,UE5H'],
      billingIds: ['client:a', 'client:b', 'client:failed', 'client:redraw'],
    } as const
    listHistory.mockResolvedValue([work])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(getCreatorCosts).toHaveBeenCalledWith(work.billingIds)
    const cost = wrapper.findAll('.result-stat-grid article').find(article => article.text().includes('总计费用'))
    expect(cost?.get('strong').text()).not.toBe('—')
    expect(cost?.get('strong').text()).not.toBe('查询中')
    wrapper.unmount()
  })

  it('shows result parameters and the full prompt inline in the stat grid', async () => {
    const longPrompt = '用彩色纸张搭建一座微缩花园，珊瑚粉花朵与鼠尾草绿叶片层层交叠。'.repeat(6)
    const work = {
      id: 'inline-parameters',
      type: 'image',
      status: 'completed',
      prompt: longPrompt,
      model: 'gemini-nano-banana-2.1',
      provider: 'Banner 生图',
      groupName: group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      generationDurationMs: 95_000,
      outputs: ['data:image/png;base64,UE5H'],
      aspectRatio: '16:9',
      resolution: '4K',
      actualOutputSize: '3840x2160',
    } as const
    listHistory.mockResolvedValue([work])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    const grid = wrapper.get('.result-stat-grid')
    const resultTags = wrapper.get('.result-actions .result-tags').text()
    expect(resultTags).toContain('16:9')
    expect(resultTags).toContain('4K')
    expect(resultTags).toContain('3840×2160')
    expect(resultTags).toContain('PNG')
    expect(wrapper.get('.result-actions .result-tags li:first-child').text()).toBe(work.model)
    expect(resultTags).not.toContain('文生')
    expect(grid.get('article:first-child').text()).toContain('gemini-nano-banana-2.1')
    expect(grid.text()).toContain('3840×2160')
    expect(grid.text()).toContain('完成耗时')
    expect(grid.text()).toContain('1 分 35 秒')
    expect(wrapper.get('.result-heading .result-duration-pill').text()).toContain('耗时 1 分 35 秒')
    expect(grid.find('.result-prompt-cell').exists()).toBe(false)
    expect(grid.text()).not.toContain('完整提示词')
    wrapper.unmount()
  })

  it('restores the historical group, model, prompt, ratio, resolution, and count when selected', async () => {
    const work = {
      id: 'grok-history-settings',
      type: 'image',
      status: 'completed',
      prompt: '历史中的高质量宽幅摄影',
      model: 'grok-imagine-image-quality',
      provider: 'Grok 生图',
      groupName: group.name,
      groupId: group.id,
      imageCapability: 'grok',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,UE5H'],
      aspectRatio: '2:1',
      resolution: '2K',
      outputCount: 3,
      referenceCount: 1,
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'grok-imagine-image' },
      { id: 'grok-imagine-image-quality' },
    ])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.get<HTMLSelectElement>('#creator-group').element.value).toBe(String(group.id))
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe(work.model)
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe(work.prompt)
    expect(wrapper.get('#creator-output-size').text()).toContain('2K · 2048×2048')
    expect(wrapper.get('.field-block .stepper').text()).toContain('3 张')
    expect(wrapper.text()).toContain('当时使用了 1 张参考图')
    expect(wrapper.text()).toContain('2K · 2048')
  })

  it('regenerates a work from the heading button with its saved settings', async () => {
    const work = {
      id: 'grok-regenerate-source',
      type: 'image',
      status: 'completed',
      prompt: '重新生成这张月光产品摄影',
      model: 'grok-imagine-image-quality',
      provider: 'Grok 生图',
      groupName: group.name,
      groupId: group.id,
      imageCapability: 'grok',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,T0xE'],
      aspectRatio: '4:3',
      resolution: '2K',
      outputCount: 1,
      quality: 'high',
      outputFormat: 'png',
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'grok-imagine-image' },
      { id: 'grok-imagine-image-quality' },
    ])
    // The global matchMedia stub reports a phone viewport, so regenerating scrolls the page.
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    onTestFinished(() => windowScrollTo.mockRestore())

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    const retryButton = wrapper.findAll('.result-heading-actions button')
      .find(button => button.text().includes('重新生成'))
    expect(retryButton).toBeDefined()
    await retryButton!.trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      model: work.model,
      prompt: work.prompt,
    }))
    expect(windowScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('brings settings back instead of regenerating when the original references were not kept', async () => {
    listHistory.mockResolvedValue([{
      id: 'regenerate-missing-references', type: 'image', status: 'completed', prompt: '参考图未保存', model: 'grok-imagine-image',
      provider: 'Grok 生图', groupName: group.name, groupId: group.id, imageCapability: 'grok', createdAt: 1, updatedAt: 1,
      outputCount: 1, outputs: ['data:image/png;base64,T0xE'], aspectRatio: '1:1', resolution: '1K', referenceCount: 2,
    }])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-image' }])

    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    await wrapper.findAll('.result-heading-actions button')
      .find(button => button.text().includes('重新生成'))!.trigger('click')
    await flushPromises()

    expect(generateImage).not.toHaveBeenCalled()
    expect(wrapper.find('.result-heading').exists()).toBe(false)
    expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('重新上传参考图'))
  })


  it('on mobile, retrying a failed work with its settings jumps to the settings panel', async () => {
    const restoreViewport = mockViewportWidth(390)
    const originalScrollIntoView = Element.prototype.scrollIntoView
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this) }
    listHistory.mockResolvedValue([{
      id: 'mobile-failed-retry', type: 'image', status: 'failed', prompt: '手机上失败重试', model: 'grok-imagine-image',
      provider: 'Grok 生图', groupName: group.name, createdAt: 1, updatedAt: 1, outputCount: 1,
      outputs: [], aspectRatio: '1:1', resolution: '1K', error: '上游服务暂时不可用',
    }])
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      scrolled.length = 0
      await wrapper.get('.result-error button').trigger('click')
      await flushPromises()
      expect(wrapper.find('.result-error').exists()).toBe(false)
      expect(scrolled.at(-1)?.classList.contains('settings-panel')).toBe(true)
      wrapper.unmount()
    } finally {
      restoreViewport()
      Element.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it.each(['result card', 'preview'] as const)('on mobile, editing from the %s immediately returns to the page top before the image loads', async (source) => {
    const restoreViewport = mockViewportWidth(390)
    const originalScrollIntoView = Element.prototype.scrollIntoView
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this) }
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    let resolveDownload: ((value: Blob) => void) | undefined
    downloadImage.mockReturnValueOnce(new Promise(resolve => { resolveDownload = resolve }))
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listHistory.mockResolvedValue([{
      id: 'mobile-edit', type: 'image', status: 'completed', prompt: '手机上编辑', model: 'grok-imagine-image',
      provider: 'Grok 生图', groupName: group.name, groupId: group.id, createdAt: 1, updatedAt: 1, outputCount: 1,
      outputs: ['https://cdn.example/mobile-edit.png'], aspectRatio: '1:1', resolution: '1K',
    }])
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      onTestFinished(() => wrapper.unmount())
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      if (source === 'preview') {
        await wrapper.get('button[title="预览作品"]').trigger('click')
        await flushPromises()
      }
      scrolled.length = 0
      windowScrollTo.mockClear()
      const editButton = source === 'preview'
        ? wrapper.findAll('.preview-action')[1]
        : wrapper.get('[aria-label="编辑这张照片"]')
      await editButton.trigger('click')
      expect(windowScrollTo).toHaveBeenCalledTimes(1)
      expect(windowScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
      expect(downloadImage).toHaveBeenCalledTimes(1)
      expect(wrapper.find('.image-preview').exists()).toBe(false)
      expect(wrapper.findAll('.reference-item')).toHaveLength(0)

      resolveDownload?.(new Blob(['image'], { type: 'image/png' }))
      await flushPromises()
      expect(wrapper.find('.result-workspace').exists()).toBe(false)
      expect(wrapper.findAll('.reference-item')).toHaveLength(1)
      expect(scrolled).toHaveLength(0)
      expect(windowScrollTo).toHaveBeenCalledTimes(1)
    } finally {
      restoreViewport()
      Element.prototype.scrollIntoView = originalScrollIntoView
      windowScrollTo.mockRestore()
    }
  })

  it('uses a generated image as a reference and restores its original settings', async () => {
    const output = 'data:image/png;base64,UE5H'
    const work = {
      id: 'grok-reference-source',
      type: 'image',
      status: 'completed',
      prompt: '把这张图片继续编辑',
      model: 'grok-imagine-image-quality',
      provider: 'Grok 生图',
      groupName: group.name,
      groupId: group.id,
      imageCapability: 'grok',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: [output],
      aspectRatio: '4:3',
      resolution: '2K',
      outputCount: 1,
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-image-quality' }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    const settings = wrapper.get<HTMLElement>('.settings-scroll').element
    settings.scrollTop = 280
    const promptFocus = vi.spyOn(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element, 'focus')
    await wrapper.get('[aria-label="编辑这张照片"]').trigger('click')
    await flushPromises()
    expect(settings.scrollTop).toBe(280)
    expect(promptFocus).not.toHaveBeenCalled()
    promptFocus.mockRestore()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.find('.result-workspace').exists()).toBe(false)
    expect(wrapper.findAll('.reference-item')).toHaveLength(1)
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe(work.prompt)
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe(work.model)
    expect(wrapper.get('#creator-output-size').text()).toContain('2K · 2048×1536')
    expect(showSuccess).toHaveBeenCalledWith('已将作品加入参考图，并带回当时的生成参数')

    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(generateImage).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      model: work.model,
      referenceImages: [expect.any(File)],
      aspectRatio: '4:3',
      imageSize: '2K',
    }))
  })

  it('brings back saved references on reopen but edits from the output alone', async () => {
    let objectUrlSequence = 0
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:reference-${++objectUrlSequence}`)
    const firstReference = new File(['first'], 'first.png', { type: 'image/png' })
    const secondReference = new Blob(['second'], { type: 'image/jpeg' })
    const work = {
      id: 'grok-saved-references',
      type: 'image',
      status: 'completed',
      prompt: '保留两张参考图的人物和服装',
      model: 'grok-imagine-image-quality',
      provider: 'Grok 生图',
      groupName: group.name,
      groupId: group.id,
      imageCapability: 'grok',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,UE5H'],
      aspectRatio: '1:1',
      resolution: '1K',
      outputCount: 1,
      referenceCount: 2,
      referenceBlobs: [firstReference, secondReference],
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-image-quality' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.reference-item')).toHaveLength(2)
    expect(wrapper.find('.history-reference-note').exists()).toBe(false)

    await wrapper.get('[aria-label="编辑这张照片"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.reference-item')).toHaveLength(1)
    expect(showWarning).not.toHaveBeenCalled()

    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    const request = generateImage.mock.calls.at(-1)?.[1] as { referenceImages: File[] }
    expect(request.referenceImages.map(file => file.name)).toEqual([
      'creator-reference-grok-saved-references-1.png',
    ])
    expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
      referenceCount: 1,
      referenceBlobs: request.referenceImages,
    }))
    wrapper.unmount()
  })

  it.each(['png', 'svg'])('reuses an Image2 %s work with one notification and preserves its model and size', async (outputFormat) => {
    const output = 'data:image/png;base64,UE5H'
    const work = {
      id: 'image2-reference-standard-size',
      type: 'image',
      status: 'completed',
      prompt: '继续编辑这张超宽图片',
      model: 'gpt-image-2',
      provider: 'Image2 生图',
      groupName: image2Group.name,
      groupId: image2Group.id,
      imageCapability: 'image2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: [output],
      aspectRatio: '21:9',
      resolution: '1K',
      outputSize: '1536x656',
      imageSizeMode: 'ratio',
      outputCount: 1,
      outputFormat,
    } as const
    listHistory.mockResolvedValue([work])
    listGroups.mockResolvedValue([group, image2Group])
    listKeys.mockResolvedValue({ items: [createdKey, image2Key], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'gpt-image-2' },
      { id: 'adobe-firefly-gpt-image-2-4k' },
    ])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="编辑这张照片"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('#creator-output-size').text()).toContain('自定义 · 1536×656')
    expect(wrapper.text()).toContain('2K · $0.08/张 × 1 张')
    expect(wrapper.findAll('.reference-item')).toHaveLength(1)
    expect(wrapper.get<HTMLSelectElement>('#creator-format').element.value).toBe('png')
    expect(showSuccess).toHaveBeenCalledTimes(1)
    expect(showSuccess).toHaveBeenCalledWith('已将作品加入参考图，并带回当时的生成参数')
    expect(showWarning).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledWith(image2Key.key, expect.objectContaining({
      model: 'gpt-image-2',
      size: '1536x656',
      outputFormat: 'png',
      referenceImages: [expect.any(File)],
    }))
    expect(generateImage.mock.calls.at(-1)?.[1].model).not.toContain('4k')
    wrapper.unmount()
  })

  it('does not offer the withdrawn SVG output format', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()

    const formats = wrapper.get('#creator-format').findAll('option').map(option => option.attributes('value'))
    expect(formats).toEqual(['png', 'jpeg', 'webp', 'gif'])
  })

  it('prevents duplicate reference-image reads while a remote output is loading', async () => {
    const output = 'https://cdn.example/generated.png'
    const work = {
      id: 'remote-reference-source',
      type: 'image',
      status: 'completed',
      prompt: '继续编辑远程图片',
      model: 'gpt-image-2',
      provider: 'Image2 生图',
      groupName: image2Group.name,
      groupId: image2Group.id,
      imageCapability: 'image2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: [output],
      aspectRatio: '1:1',
      resolution: '1K',
      outputCount: 1,
    } as const
    listHistory.mockResolvedValue([work])
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    let resolveDownload: ((value: Blob) => void) | undefined
    downloadImage.mockReturnValue(new Promise(resolve => { resolveDownload = resolve }))

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    const button = wrapper.get('[aria-label="编辑这张照片"]')
    const settings = wrapper.get<HTMLElement>('.settings-scroll').element
    settings.scrollTop = 280
    let resolveModels: ((value: { id: string }[]) => void) | undefined
    listModels.mockReturnValueOnce(new Promise(resolve => { resolveModels = resolve }))
    await button.trigger('click')
    await button.trigger('click')

    expect(downloadImage).toHaveBeenCalledTimes(1)
    expect(downloadImage).toHaveBeenCalledWith(image2Key.key, output)
    expect(button.attributes('disabled')).toBeDefined()

    // Keep the user's latest position when image/model reads finish later.
    settings.scrollTop = 340
    resolveDownload?.(new Blob(['image'], { type: 'image/png' }))
    await flushPromises()
    expect(settings.scrollTop).toBe(340)
    expect(resolveModels).toBeDefined()
    settings.scrollTop = 420
    resolveModels?.([{ id: 'gpt-image-2' }])
    await flushPromises()
    expect(settings.scrollTop).toBe(420)
    expect(wrapper.findAll('.reference-item')).toHaveLength(1)
  })

  it('downloads base64 image results without fetching their source', async () => {
    const work = {
      id: 'image-download-1',
      type: 'image',
      status: 'completed',
      prompt: '4K 宽屏图片',
      model: 'gpt-image-2-4k',
      provider: 'Image2 生图',
      groupName: image2Group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,UE5H'],
      aspectRatio: '16:9',
      resolution: '4K',
    } as const
    listHistory.mockResolvedValue([work])
    let downloaded: { href: string; filename: string } | undefined
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloaded = { href: this.href, filename: this.download }
    })

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await wrapper.get('.result-media-actions button[title="下载作品"]').trigger('click')

    expect(downloaded?.href).toBe(work.outputs[0])
    expect(downloaded?.filename).toMatch(/^creator-\d+-1\.png$/)
    expect(showError).not.toHaveBeenCalled()
    anchorClick.mockRestore()
  })

  it('downloads every image of the selected work from the result heading', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const work = {
      id: 'image-download-all',
      type: 'image',
      status: 'completed',
      prompt: '批量下载',
      model: 'gpt-image-2',
      provider: 'Image2 生图',
      groupName: image2Group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,QQ==', 'data:image/png;base64,Qg==', 'data:image/png;base64,Qw=='],
    } as const
    listHistory.mockResolvedValue([work])
    const downloaded: { href: string; filename: string }[] = []
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloaded.push({ href: this.href, filename: this.download })
    })

    try {
      const wrapper = mount(CreatorStudioView, {
        global: {
          stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
        },
      })
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      const downloadAll = wrapper.get('.download-all-command')
      await downloadAll.trigger('click')
      expect(downloadAll.attributes('disabled')).toBeDefined()
      await vi.runAllTimersAsync()
      await flushPromises()

      expect(downloaded.map(item => item.href)).toEqual(work.outputs)
      const stamp = downloaded[0].filename.match(/^creator-(\d+)-1\.png$/)?.[1]
      expect(stamp).toBeDefined()
      expect(downloaded.map(item => item.filename)).toEqual([1, 2, 3].map(n => `creator-${stamp}-${n}.png`))
      expect(downloadAll.attributes('disabled')).toBeUndefined()
      expect(showError).not.toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      anchorClick.mockRestore()
      vi.useRealTimers()
    }
  })

  it('offers one-click download for a single image result', async () => {
    const work = {
      id: 'image-download-single',
      type: 'image',
      status: 'completed',
      prompt: '单张下载',
      model: 'gpt-image-2',
      provider: 'Image2 生图',
      groupName: image2Group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['data:image/png;base64,QQ=='],
    } as const
    listHistory.mockResolvedValue([work])
    const downloaded: string[] = []
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloaded.push(this.href)
    })

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    const downloadAll = wrapper.get('.download-all-command')
    expect(downloadAll.text()).toContain('一键下载')
    await downloadAll.trigger('click')
    await flushPromises()

    expect(downloaded).toEqual(work.outputs)
    expect(showError).not.toHaveBeenCalled()
    wrapper.unmount()
    anchorClick.mockRestore()
  })

  it('offers one-click download for every video segment', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const videoBlobs = [new Blob(['shot-one'], { type: 'video/mp4' }), new Blob(['shot-two'], { type: 'video/mp4' })]
    listHistory.mockResolvedValue([{
      id: 'video-download-all', type: 'video', status: 'completed',
      prompt: '雨后街道', model: 'grok-imagine-video', provider: 'Grok 视频',
      groupName: group.name, groupId: group.id, apiKeyId: createdKey.id,
      createdAt: Date.now(), updatedAt: Date.now(),
      outputs: ['blob:shot-one', 'blob:shot-two'], videoBlobs, outputCount: 2,
    }])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    const filenames: string[] = []
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      filenames.push(this.download)
    })

    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()
      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      const downloadAll = wrapper.get('.download-all-command')
      expect(downloadAll.text()).toContain('一键下载')
      await downloadAll.trigger('click')
      await vi.runAllTimersAsync()
      await flushPromises()

      const stamp = filenames[0]?.match(/^creator-(\d+)-1\.mp4$/)?.[1]
      expect(stamp).toBeDefined()
      expect(filenames).toEqual([1, 2].map(n => `creator-${stamp}-${n}.mp4`))
      expect(URL.createObjectURL).toHaveBeenCalledWith(videoBlobs[0])
      expect(URL.createObjectURL).toHaveBeenCalledWith(videoBlobs[1])
      expect(downloadVideo).not.toHaveBeenCalled()
      expect(showError).not.toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      anchorClick.mockRestore()
      vi.useRealTimers()
    }
  })

  it('downloads a cross-origin image through the authenticated same-origin proxy', async () => {
    const work = {
      id: 'legacy-image-download-1',
      type: 'image',
      status: 'completed',
      prompt: '旧版 4K 图片',
      model: 'gpt-image-2-4k',
      provider: 'Image2 生图',
      groupName: image2Group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['https://image.example.test/tmp/result.png'],
    } as const
    listHistory.mockResolvedValue([work])
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    const imageBlob = new Blob(['image'], { type: 'image/png' })
    let resolveDownload: ((value: Blob) => void) | undefined
    downloadImage.mockReturnValue(new Promise(resolve => { resolveDownload = resolve }))
    let downloaded: { href: string; filename: string } | undefined
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloaded = {
        href: this.href,
        filename: this.download,
      }
    })

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    const downloadButton = wrapper.get('.result-media-actions button[title="下载作品"]')
    await downloadButton.trigger('click')
    await downloadButton.trigger('click')

    expect(downloadImage).toHaveBeenCalledTimes(1)
    expect(downloadButton.attributes('disabled')).toBeDefined()
    resolveDownload?.(imageBlob)
    await flushPromises()

    expect(downloadImage).toHaveBeenCalledWith(image2Key.key, work.outputs[0])
    expect(URL.createObjectURL).toHaveBeenCalledWith(imageBlob)
    expect(downloaded?.href).toBe('blob:creator-video')
    expect(downloaded?.filename).toMatch(/^creator-\d+-1\.png$/)
    expect(showError).not.toHaveBeenCalled()
    anchorClick.mockRestore()
  })

  it('offers only Grok-supported video aspect ratios', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()

    await wrapper.get('#video-params').trigger('click')
    const ratioButtons = videoParamsDialog(wrapper).findAll('.image-ratio-grid button')
    expect(ratioButtons.map(button => button.attributes('data-ratio'))).toEqual(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'])
    expect(ratioButtons.filter(button => button.attributes('disabled') !== undefined).map(button => button.attributes('data-ratio'))).toEqual(['21:9'])
    expect(ratioButtons[7].attributes('title')).toBe('官方 Grok 不支持此比例')
    expect(videoParamsDialog(wrapper).text()).toContain('官方 Grok 不支持 21:9 参数')
    await videoParamsDialog(wrapper).get('.image-size-cancel').trigger('click')

    await setVideoParams(wrapper, { ratio: '2:3' })
    expect(wrapper.get('#video-params').text()).toContain('2:3')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('海边公路航拍')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(createVideo).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({ aspectRatio: '2:3' }))
    wrapper.unmount()
  })

  it('loads completed video through the authenticated content endpoint', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('一只小猫奔跑')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(createVideo).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      model: 'grok-imagine-video',
      prompt: '一只小猫奔跑',
    }))
    expect(getVideoStatus).toHaveBeenCalledWith(createdKey.key, 'video-task-1')
    expect(getVideoContent).toHaveBeenCalledWith(createdKey.key, 'video-task-1')
    const video = wrapper.get<HTMLVideoElement>('.result-media.video')
    expect(video.attributes('src')).toBe('blob:creator-video')
    expect(video.attributes('style')).toContain('aspect-ratio: 16 / 9')
    expect(video.attributes('style')).toContain('max-height: min(58vh, 620px)')
    expect(wrapper.get('.video-result-frame').attributes('style')).toContain('max-height: min(58vh, 620px)')
    Object.defineProperties(video.element, {
      videoWidth: { configurable: true, value: 1080 },
      videoHeight: { configurable: true, value: 1920 },
    })
    await video.trigger('loadedmetadata')
    await flushPromises()
    expect(video.attributes('style')).toContain('aspect-ratio: 1080 / 1920')
    expect(showError).not.toHaveBeenCalled()
  })

  it('enables 1080p only for the Grok Imagine 1.5 video model', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'grok-imagine-video' },
      { id: 'grok-imagine-video-1.5' },
    ])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await openGrokVideo(wrapper)
    await flushPromises()

    expect(await videoResolutionChoices(wrapper)).toEqual(['480p', '720p'])

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('grok-imagine-video-1.5')
    await flushPromises()
    expect(await videoResolutionChoices(wrapper)).toEqual(['480p', '720p', '1080p'])

    await setVideoParams(wrapper, { resolution: '1080p' })
    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('grok-imagine-video')
    await flushPromises()
    expect(wrapper.get('#video-params').attributes('data-resolution')).toBe('720p')
    wrapper.unmount()
  })

  it('restores the historical video generation method, model, ratio, and reference count', async () => {
    const work = {
      id: 'reference-video-history',
      type: 'video',
      status: 'completed',
      prompt: '保持人物服装一致并缓慢向前移动',
      model: 'grok-imagine-video-1.5',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['blob:reference-video'],
      aspectRatio: '2:3',
      resolution: '1080p',
      requestedDuration: 10,
      referenceCount: 3,
      videoGenerationMethod: 'reference',
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'grok-imagine-video' },
      { id: 'grok-imagine-video-1.5' },
    ])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.mode-option')[1].trigger('click')
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('reference')
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video-1.5')
    expect(wrapper.get('#video-params').attributes('data-ratio')).toBe('2:3')
    expect(wrapper.get('#video-params').attributes('data-resolution')).toBe('1080p')
    expect(wrapper.get('.reference-field').text()).toContain('当时使用了 3 张参考图')
    expect(wrapper.findAll('.result-grid .result-tags li').map(tag => tag.text())).toEqual([
      'grok-imagine-video-1.5', '2:3', '1080p', '10 秒', '参考图生',
    ])
    wrapper.unmount()
  })

  it('brings back the saved source image when an image-to-video work is reopened', async () => {
    const source = new File(['source'], 'source.png', { type: 'image/png' })
    const work = {
      id: 'image-video-saved-source',
      type: 'video',
      status: 'completed',
      prompt: '沙丘上的镜头缓慢推进',
      model: 'grok-imagine-video-1.5',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['blob:saved-video'],
      aspectRatio: '16:9',
      resolution: '720p',
      requestedDuration: 10,
      referenceCount: 1,
      videoGenerationMethod: 'image',
      shotReferenceBlobs: [[source]],
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video-1.5' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.findAll('.mode-option')[1].trigger('click')
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('image')
    expect(wrapper.findAll('.reference-item')).toHaveLength(1)
    expect(wrapper.get('#video-params').text()).toContain('跟随原图')
    expect(wrapper.find('.history-reference-note').exists()).toBe(false)
    expect(wrapper.get('.generate-button').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('restores the exact Seedance line of a reference video, not the first reference-capable one', async () => {
    const sdGroup = { ...group, id: 7810, name: 'Seedance', description: '', platform: 'deepseek', video_model_prices: { seedance: { 'xseadanco2.0': 4.8, '00sd2.0': 1.5 } } } as Group
    const sdKey = { ...createdKey, id: 32, key: 'sk-sd', group_id: sdGroup.id, group: sdGroup } as ApiKey
    listGroups.mockResolvedValue([group, sdGroup])
    listKeys.mockResolvedValue({ items: [createdKey, sdKey], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'Xseadanco2.0' }, { id: '00sd2.0' }])
    listHistory.mockResolvedValue([{
      id: 'seedance-reference-history',
      type: 'video',
      status: 'completed',
      prompt: '山顶俯瞰云海的延时镜头',
      model: '00sd2.0',
      provider: 'Seedance 视频',
      groupName: sdGroup.name,
      groupId: sdGroup.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['blob:seedance-video'],
      aspectRatio: '16:9',
      resolution: '720p',
      requestedDuration: 15,
      referenceCount: 1,
      videoGenerationMethod: 'reference',
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    await wrapper.findAll('.mode-option')[1].trigger('click')
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('reference')
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('00sd2.0')
    // The low-price line is listed first.
    expect(wrapper.findAll('#creator-model option').map(option => option.text()))
      .toEqual(['Seedance 2.0 720p · 低价按条', 'Seedance 2.0 720p · 满血 · 按条'])
    wrapper.unmount()
  })

  it('restores a completed video from IndexedDB without querying the upstream task again', async () => {
    const persistedVideo = new Blob(['persisted-video'], { type: 'video/mp4' })
    const work = {
      id: 'persisted-video-history',
      type: 'video',
      status: 'completed',
      prompt: '雨后的城市街道',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      apiKeyId: createdKey.id,
      createdAt: Date.now() - 30_000,
      updatedAt: Date.now() - 20_000,
      completedAt: Date.now() - 20_000,
      outputs: [],
      videoBlobs: [persistedVideo],
      outputCount: 1,
      aspectRatio: '16:9',
      resolution: '720p',
      requestId: 'persisted-video-task',
      requestedDuration: 15,
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(URL.createObjectURL).toHaveBeenCalledWith(persistedVideo)
    expect(wrapper.get<HTMLVideoElement>('.result-media.video').attributes('src')).toBe('blob:creator-video')
    const video = wrapper.get<HTMLVideoElement>('.result-media.video')
    expect(video.element.controls).toBe(false)
    await video.trigger('pointerenter', { pointerType: 'mouse' })
    await video.trigger('focus')
    await video.trigger('pointerdown', { pointerType: 'touch' })
    expect(video.element.controls).toBe(false)
    Object.defineProperties(video.element, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
    })
    await video.trigger('loadedmetadata')
    await video.trigger('loadeddata')
    expect(wrapper.find('[aria-label="播放视频"]').exists()).toBe(true)
    expect(wrapper.get('.video-badge').text()).toContain('视频')
    expect(wrapper.get('.result-parameters').text()).toContain('生成数量')
    expect(wrapper.get('.result-actions .result-prompt').text()).toBe('雨后的城市街道')
    expect(wrapper.findAll('.result-card > .result-actions > .result-tags li').map(tag => tag.text())).toEqual([
      'grok-imagine-video', '16:9', '720p', '15 秒', '文生',
    ])
    expect(getVideoStatus).not.toHaveBeenCalled()
    expect(getVideoContent).not.toHaveBeenCalled()
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const downloadButton = wrapper.get('.result-media-actions button[title="下载作品"]')
    await downloadButton.trigger('click')
    await flushPromises()
    await downloadButton.trigger('click')
    await flushPromises()
    expect(anchorClick).toHaveBeenCalledTimes(2)
    expect(URL.createObjectURL).toHaveBeenLastCalledWith(persistedVideo)
    expect(downloadVideo).not.toHaveBeenCalled()
    expect(getVideoContent).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    anchorClick.mockRestore()
    vi.stubGlobal('fetch', originalFetch)
    wrapper.unmount()
  })

  it('retains video download fallback bytes for subsequent clicks', async () => {
    listHistory.mockResolvedValue([{
      id: 'video-download-fallback', type: 'video', status: 'completed',
      prompt: '雨后街道', model: 'grok-imagine-video', provider: 'Grok 视频',
      groupName: group.name, groupId: group.id, apiKeyId: createdKey.id,
      createdAt: Date.now(), updatedAt: Date.now(),
      outputs: ['blob:old-video'], requestId: 'download-task',
    }])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    const videoBlob = new Blob(['downloaded video'], { type: 'video/mp4' })
    let finishDownload!: (blob: Blob) => void
    downloadVideo.mockReturnValue(new Promise(resolve => { finishDownload = resolve }))
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    const button = wrapper.get('.result-media-actions button[title="下载作品"]')
    await button.trigger('click')
    await button.trigger('click')
    expect(downloadVideo).toHaveBeenCalledTimes(1)
    expect(downloadVideo).toHaveBeenCalledWith('blob:old-video', createdKey.key, 'download-task')
    expect(button.attributes('disabled')).toBeDefined()
    finishDownload(videoBlob)
    await flushPromises()
    await button.trigger('click')
    await flushPromises()
    expect(downloadVideo).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenLastCalledWith(videoBlob)
    expect(anchorClick).toHaveBeenCalledTimes(2)
    expect(showError).not.toHaveBeenCalled()
    anchorClick.mockRestore()
    wrapper.unmount()
  })

  it('keeps completed video parameters visible when remote recovery fails', async () => {
    const work = {
      id: 'unavailable-video-history',
      type: 'video',
      status: 'completed',
      prompt: '三个连续镜头的完整提示词',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      apiKeyId: createdKey.id,
      createdAt: Date.now() - 60_000,
      updatedAt: Date.now() - 30_000,
      completedAt: Date.now() - 30_000,
      generationDurationMs: 30_000,
      outputs: [],
      outputCount: 3,
      shotCount: 3,
      shotPrompts: ['镜头一', '镜头二', '镜头三'],
      aspectRatio: '16:9',
      resolution: '720p',
      requestId: 'unavailable-video-task',
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockRejectedValue(new Error('Service temporarily unavailable'))
    vi.useFakeTimers({ toFake: ['setTimeout'] })

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    // A transient lookup error is retried before it is reported.
    await vi.advanceTimersByTimeAsync(10_000)
    await flushPromises()
    vi.useRealTimers()

    expect(getVideoStatus).toHaveBeenCalledTimes(4)
    expect(wrapper.get('.result-error').text()).toContain('视频服务暂时不可用')
    const parameters = wrapper.get('.result-parameters')
    expect(parameters.text()).toContain('完成耗时')
    expect(parameters.text()).toContain('3 段')
    expect(parameters.text()).not.toContain('完整提示词')
    wrapper.unmount()
  })

  it('resumes live progress automatically when a historical video task is opened after a refresh', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const work = {
      id: 'resumed-video-history',
      type: 'video',
      status: 'pending',
      prompt: '现代化工厂车间，镜头沿自动化装配线平稳横移',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      createdAt: Date.now() - 200_000,
      updatedAt: Date.now() - 20_000,
      outputs: [],
      aspectRatio: '16:9',
      resolution: '720p',
      requestId: 'resumed-video-task',
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus
      .mockResolvedValueOnce({ id: work.requestId, status: 'processing', progress: 40 })
      .mockResolvedValueOnce({ id: work.requestId, status: 'processing', progress: 47 })
      .mockResolvedValueOnce({ id: work.requestId, status: 'processing', progress: 47 })
      .mockResolvedValueOnce({ id: work.requestId, status: 'completed', url: '/video' })
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()
      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      // Tracking started in the background on load; opening does not query again.
      expect(getVideoStatus).toHaveBeenCalledTimes(1)
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      expect(getVideoStatus).toHaveBeenCalledTimes(1)
      // The video draws into its own result card, which shows the live percentage.
      expect(wrapper.find('.result-card.is-drawing').exists()).toBe(true)
      expect(wrapper.find('.result-missing-media').exists()).toBe(false)
      expect(wrapper.get('.result-drawing-media small').text()).toBe('生成中 40%')

      await vi.advanceTimersByTimeAsync(4000)
      await flushPromises()
      expect(wrapper.get('.result-drawing-media small').text()).toBe('生成中 47%')
      expect(wrapper.get('.result-drawing-media .slot-progress').attributes('aria-valuenow')).toBe('47')

      await vi.advanceTimersByTimeAsync(8000)
      await flushPromises()
      expect(getVideoContent).toHaveBeenCalledWith(createdKey.key, work.requestId)
      expect(wrapper.find('.result-card.is-drawing').exists()).toBe(false)
      expect(wrapper.get<HTMLVideoElement>('.result-media.video').attributes('src')).toBe('blob:creator-video')
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ id: work.id, status: 'completed' }))
      expect(showSuccess).toHaveBeenCalledWith('视频已生成并加载')
      expect(showError).not.toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a rendering video pending instead of failed when the studio page is left', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockResolvedValue({ id: 'video-task-1', status: 'processing', progress: 30 })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('雪山日出延时')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(putHistory.mock.calls.some(([saved]) => saved.requestId === 'video-task-1' && saved.status === 'pending')).toBe(true)

    wrapper.unmount()
    await flushPromises()

    expect(putHistory.mock.calls.some(([saved]) => saved.status === 'failed')).toBe(false)
    expect(showError).not.toHaveBeenCalled()
  })

  it('revives a video an older page saved as failed on close and loads the finished result', async () => {
    const work = {
      id: 'closed-page-video', type: 'video', status: 'failed', prompt: '雪山日出延时',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name, groupId: group.id,
      createdAt: Date.now() - 60_000, updatedAt: Date.now() - 30_000, outputs: [],
      aspectRatio: '16:9', resolution: '720p', requestId: 'closed-page-task',
      error: '页面已关闭，任务可稍后从历史记录继续查看',
    }
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockResolvedValue({ id: work.requestId, status: 'completed', url: '/v1/videos/closed-page-task/content' })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    expect(wrapper.text()).not.toContain('页面已关闭')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(getVideoContent).toHaveBeenCalledWith(createdKey.key, work.requestId)
    expect(wrapper.get('.result-media.video').attributes('src')).toBe('blob:creator-video')
    expect(wrapper.text()).not.toContain('生成失败')
    expect(putHistory.mock.calls.some(([saved]) => saved.id === work.id && saved.status === 'completed')).toBe(true)
  })

  it('starts live progress without a manual sync when opening a historical video task', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const work = {
      id: 'pending-video-history',
      type: 'video',
      status: 'pending',
      prompt: '黄昏海边，一位女孩缓慢向前走',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      createdAt: Date.now() - 30_000,
      updatedAt: Date.now() - 20_000,
      outputs: [],
      aspectRatio: '16:9',
      resolution: '720p',
      requestId: 'pending-video-task',
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockResolvedValue({ id: work.requestId, status: 'processing' })
    try {
      const wrapper = mount(CreatorStudioView, {
        global: {
          stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
        },
      })
      await flushPromises()

      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      expect(getVideoStatus).toHaveBeenCalledTimes(1)
      expect(wrapper.find('.result-card.is-drawing').exists()).toBe(true)
      expect(wrapper.find('.status-check-command').exists()).toBe(false)

      await vi.advanceTimersByTimeAsync(4000)
      await flushPromises()
      expect(getVideoStatus).toHaveBeenCalledTimes(2)
      expect(showError).not.toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('checks a historical video with its stable group id after the group is renamed', async () => {
    const renamedGroup = { ...group, name: '【特价】Grok xAi（支持 4.6）' }
    const renamedKey = { ...createdKey, group: renamedGroup, group_id: renamedGroup.id }
    const work = {
      id: 'renamed-group-video-history',
      type: 'video',
      status: 'pending',
      prompt: '镜头缓慢推进',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: '【旧名称】Grok xAi',
      groupId: renamedGroup.id,
      createdAt: Date.now() - 30_000,
      updatedAt: Date.now() - 20_000,
      outputs: [],
      aspectRatio: '16:9',
      resolution: '720p',
      requestId: 'renamed-group-video-task',
    } as const
    listGroups.mockResolvedValue([renamedGroup])
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [renamedKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockResolvedValue({ id: work.requestId, status: 'processing' })
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(getVideoStatus).toHaveBeenCalledWith(renamedKey.key, work.requestId)
    expect(wrapper.find('.result-card.is-drawing').exists()).toBe(true)
    expect(showError).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('uses an expired original key to recover its completed video', async () => {
    const expiredKey = { ...createdKey, status: 'expired' as const }
    const work = {
      id: 'expired-key-video-history',
      type: 'video',
      status: 'completed',
      prompt: '保存在已过期 Key 下的视频',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      apiKeyId: expiredKey.id,
      createdAt: Date.now() - 30_000,
      updatedAt: Date.now() - 20_000,
      outputs: [],
      outputCount: 1,
      aspectRatio: '16:9',
      resolution: '720p',
      requestId: 'expired-key-video-task',
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [expiredKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockResolvedValue({ id: work.requestId, status: 'completed', url: '/video' })

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(listKeys).toHaveBeenCalledWith(1, 100, { sort_by: 'created_at', sort_order: 'desc' })
    expect(getVideoStatus).toHaveBeenCalledWith(expiredKey.key, work.requestId)
    expect(getVideoContent).toHaveBeenCalledWith(expiredKey.key, work.requestId)
    expect(wrapper.get<HTMLVideoElement>('.result-media.video').attributes('src')).toBe('blob:creator-video')
    wrapper.unmount()
  })

  it('uses the only compatible selected key for legacy video history without ids', async () => {
    const currentGroup = { ...group, name: '【特价】Grok xAi（支持 4.6）' }
    const currentKey = { ...createdKey, group: currentGroup, group_id: currentGroup.id }
    const work = {
      id: 'legacy-video-history',
      type: 'video',
      status: 'pending',
      prompt: '旧版本保存的视频任务',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: '已经不存在的旧分组名称',
      createdAt: Date.now() - 30_000,
      updatedAt: Date.now() - 20_000,
      outputs: [],
      aspectRatio: '16:9',
      resolution: '720p',
      requestId: 'legacy-video-task',
    } as const
    listGroups.mockResolvedValue([currentGroup])
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [currentKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockResolvedValue({ id: work.requestId, status: 'processing' })
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(getVideoStatus).toHaveBeenCalledWith(currentKey.key, work.requestId)
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({
      id: work.id,
      apiKeyId: currentKey.id,
      groupId: currentGroup.id,
      groupName: currentGroup.name,
    }))
    expect(showError).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('localizes a missing historical video task and stops presenting it as processing', async () => {
    const work = {
      id: 'missing-video-history',
      type: 'video',
      status: 'pending',
      prompt: '黄昏海边，一位女孩缓慢向前走',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      createdAt: Date.now() - 30_000,
      updatedAt: Date.now() - 20_000,
      outputs: [],
      aspectRatio: '16:9',
      resolution: '720p',
      requestId: 'missing-video-task',
    } as const
    const missingError = Object.assign(new Error('Video request not found'), {
      status: 404,
      code: 'not_found_error',
    })
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockRejectedValue(missingError)
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.get('.result-missing-media.is-failed').text()).toContain('未找到该视频任务')
    expect(wrapper.text()).not.toContain('Video request not found')
    expect(wrapper.find('.status-check-command').exists()).toBe(false)
    expect(wrapper.get('.result-parameters').text()).not.toContain('完整提示词')
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({
      id: work.id,
      status: 'failed',
      error: expect.stringContaining('任务可能已过期'),
    }))
    expect(showError).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows one localized error when automatic video tracking finds an expired task', async () => {
    const work = {
      id: 'expired-video-history',
      type: 'video',
      status: 'pending',
      prompt: '雨夜街道中的电车缓慢驶来',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      createdAt: Date.now() - 30_000,
      updatedAt: Date.now() - 20_000,
      outputs: [],
      aspectRatio: '16:9',
      resolution: '720p',
      requestId: 'expired-video-task',
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus
      .mockResolvedValueOnce({ id: work.requestId, status: 'processing' })
      .mockRejectedValue(Object.assign(new Error('Video request not found'), { status: 404 }))
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const wrapper = mount(CreatorStudioView, {
        global: {
          stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
        },
      })
      await flushPromises()

      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(4000)
      await flushPromises()

      expect(showError).toHaveBeenCalledTimes(1)
      expect(showError).toHaveBeenCalledWith(expect.stringContaining('未找到该视频任务'))
      expect(showError).not.toHaveBeenCalledWith(expect.stringContaining('Video request not found'))
      expect(wrapper.get('.result-missing-media.is-failed').text()).toContain('任务可能已过期')
      expect(wrapper.find('.status-check-command').exists()).toBe(false)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('tracks pending videos in the background and shows a failed sync without a loading step', async () => {
    const work = {
      id: 'background-expired-video',
      type: 'video',
      status: 'pending',
      prompt: '雨夜街道中的电车缓慢驶来',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      createdAt: Date.now() - 30_000,
      updatedAt: Date.now() - 20_000,
      outputs: [],
      aspectRatio: '16:9',
      resolution: '720p',
      requestId: 'background-expired-task',
    } as const
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockRejectedValue(Object.assign(new Error('Video request not found'), { status: 404 }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    // The check ran before the work was opened, quietly.
    expect(getVideoStatus).toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ id: work.id, status: 'failed' }))

    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    expect(wrapper.text()).not.toContain('正在同步状态')
    await flushPromises()
    expect(wrapper.get('.result-missing-media.is-failed').text()).toContain('任务可能已过期')
    wrapper.unmount()
  })

  it.each([
    { model: 'minimaxh3-768', name: 'MiniMax H3 标清版 768p', resolution: '768p', seconds: 15 },
    { model: 'oosd2.5', name: 'Seedance 2.5 720p', resolution: '720p', seconds: 15 },
    { model: 'oosd2.5-30秒', name: 'Seedance 2.5 720p', resolution: '720p', seconds: 30 },
    { model: '00sd2.0', name: 'Seedance 2.0 720p', resolution: '720p', seconds: 15 },
    { model: 'ttseadanco2.5-720', name: 'Seedance 2.5 720p', resolution: '720p', seconds: 15 },
  ])('keeps $model video result details concise without showing output pixel dimensions', async ({ model, name, resolution, seconds }) => {
    listHistory.mockResolvedValue([{
      id: 'concise-video-result',
      type: 'video',
      status: 'completed',
      prompt: '冰块落入玻璃杯',
      model,
      provider: 'MiniMax H3 视频',
      groupName: group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['blob:h3-video'],
      outputCount: 1,
      aspectRatio: '16:9',
      resolution,
      actualOutputSize: '1360x768',
      requestedDuration: seconds,
      shotCount: 1,
      videoGenerationMethod: 'text',
    }])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.result-grid .result-tags li').map(tag => tag.text())).toEqual([
      name, '16:9', resolution, `${seconds} 秒`, '文生',
    ])

    const parameters = wrapper.get('.result-parameters').text()
    expect(parameters).toContain(name)
    expect(parameters).not.toContain('固定')
    expect(parameters).not.toContain('按条')
    expect(parameters).not.toContain('按秒')
    expect(parameters).not.toContain('高并发')
    expect(parameters).not.toContain('10–15秒')
    expect(parameters).not.toContain('8种画幅')
    expect(parameters).not.toContain('输出尺寸')
    expect(parameters).not.toContain('1360×768')
    wrapper.unmount()
  })

  it.each([
    { mergedOutput: 'blob:complete-video', title: '已生成的镜头已按顺序合成', description: '9 个镜头已按时间顺序拼接，完整保留每段画面与声音，可直接预览或下载。' },
    { mergedOutput: undefined, title: '已生成的镜头已保留，等待合成完整视频', description: '9 个镜头素材已保留，合成完成后可预览或下载完整视频。' },
  ])('describes only successful shots when 9 of 12 shots finish (mergedOutput: $mergedOutput)', async ({ mergedOutput, title, description }) => {
    const shotOutputIndexes = [0, 1, 2, 3, 4, 6, 7, 8, 11]
    listHistory.mockResolvedValue([{
      id: 'partial-multi-shot-video',
      type: 'video',
      status: 'completed',
      prompt: '十二个镜头的创作',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: shotOutputIndexes.map(index => `blob:shot-${index + 1}`),
      mergedOutput,
      shotCount: 12,
      shotPrompts: Array.from({ length: 12 }, (_, index) => `第 ${index + 1} 个镜头`),
      shotDurations: [...Array(11).fill(8), 10],
      shotOutputIndexes,
      requestedDuration: 98,
      aspectRatio: '16:9',
      resolution: '720p',
    }])

    const wrapper = mount(CreatorStudioView, {
      global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } },
    })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.get('.partial-result-notice strong').text()).toBe('镜头 6、10、11 未生成')
    expect(wrapper.get('.complete-video-card h3').text()).toBe(title)
    expect(wrapper.get('.complete-video-card header p:last-child').text()).toBe(description)
    expect(wrapper.get('.complete-video-card header > span').text()).toBe('9 个镜头 · 74 秒')
    expect(wrapper.get('.complete-video-card').text()).not.toContain('12 个镜头')
    const cards = wrapper.findAll('.result-segment-grid .result-card')
    expect(cards).toHaveLength(12)
    expect(cards.map(card => card.get('.result-index').text())).toEqual(Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')))
    const missing = cards.filter(card => card.classes().includes('is-missing'))
    expect(missing.map(card => card.get('.result-description strong').text())).toEqual(['Grok 视频 · 镜头 6', 'Grok 视频 · 镜头 10', 'Grok 视频 · 镜头 11'])
    expect(missing.every(card => !card.find('.result-missing-prompt').exists())).toBe(true)
    expect(wrapper.findAll('.result-segment-grid .creator-video-player')).toHaveLength(9)
    // Missing shots keep the toolbar greyed out; only regenerating works before the video exists.
    expect(missing.every(card => card.find('.result-media-actions.is-unavailable').exists())).toBe(true)
    expect(missing.every(card => card.findAll('.result-media-actions button:disabled').length === 3)).toBe(true)
  })

  it.each([
    { status: 'failed', outputs: [], shotOutputIndexes: [] },
    { status: 'completed', outputs: ['blob:only-shot-3'], shotOutputIndexes: [2] },
    { status: 'failed', outputs: ['blob:only-shot-3'], shotOutputIndexes: [2] },
  ])('shows every shot and its own prompt with $status status and $outputs.length outputs', async ({ status, outputs, shotOutputIndexes }) => {
    const prompts = ['第一个镜头\n海面全景', '第二个镜头\n潜水器下降', '第三个镜头\n海底抵达']
    listHistory.mockResolvedValue([{
      id: 'few-shot-results', type: 'video', status, prompt: '三个镜头',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name,
      createdAt: 1, updatedAt: 2, outputs, shotOutputIndexes,
      shotPrompts: prompts, shotCount: 3, outputCount: 3,
      shotDurations: [5, 8, 10], shotAspectRatios: ['16:9', '9:16', '1:1'],
      shotResolutions: ['720p', '1080p', '720p'], shotGenerationMethods: ['text', 'image', 'text'],
      aspectRatio: '16:9', resolution: '720p', error: '上游生成失败',
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      const cards = wrapper.findAll('.result-card')
      expect(cards).toHaveLength(3)
      expect(cards.map(card => card.get('.result-description p').text())).toEqual(prompts)
      expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(3 - outputs.length)
      expect(cards[1].find('.result-missing-prompt').exists()).toBe(false)
      expect(cards[1].get('.result-tags').text()).toContain('9:16')
      expect(cards[1].get('.result-tags').text()).toContain('1080p')
      expect(cards[1].get('.result-tags').text()).toContain('8 秒')
      expect(cards[1].get('.result-tags').text()).toContain('图生')
      expect(wrapper.findAll('.result-grid .creator-video-player')).toHaveLength(outputs.length)
      expect(wrapper.find('.complete-video-card').exists()).toBe(false)
      // Like a failed image batch: the cards stay, and one banner lists what is missing.
      expect(wrapper.find('.result-error').exists()).toBe(false)
      expect(wrapper.get('.partial-result-notice strong').text()).toBe(outputs.length ? '镜头 1、2 未生成' : '镜头 1、2、3 未生成')
      expect(createVideo).not.toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })

  it.each(['text', 'image', 'reference'] as const)('regenerates only the missing %s shot in place with its saved settings', async generationMethod => {
    const references = generationMethod === 'text' ? [] : [
      new File(['target-reference-a'], 'target-a.png', { type: 'image/png' }),
      ...(generationMethod === 'reference' ? [new File(['target-reference-b'], 'target-b.png', { type: 'image/png' })] : []),
    ]
    const finishedBlob = new Blob(['finished-shot-3'], { type: 'video/mp4' })
    const work = {
      id: `retry-shot-${generationMethod}`, type: 'video', status: 'completed', prompt: '原作品的三个镜头',
      model: 'grok-imagine-video-1.5', provider: 'Grok 视频', groupName: group.name, groupId: group.id, apiKeyId: createdKey.id,
      createdAt: 1, updatedAt: 2, outputs: ['blob:finished-shot-3'], videoBlobs: [finishedBlob],
      requestId: 'finished-task-3', shotOutputIndexes: [2],
      shotCount: 3, outputCount: 3, requestedDuration: 23,
      shotPrompts: ['第一个缺少参考图的镜头', '第二个镜头\n保留完整的运动提示词', '第三个已生成镜头'],
      shotDurations: [5, 10, 8], shotAspectRatios: ['16:9', '9:16', '1:1'],
      shotResolutions: ['720p', '1080p', '720p'], shotGenerationMethods: ['reference', generationMethod, 'text'],
      shotReferenceCounts: [3, references.length, 0], referenceCount: 3 + references.length,
      shotReferenceBlobs: [[], references, []], shotFollowSourceAspects: [true, true, false],
      aspectRatio: '16:9', resolution: '720p',
    }
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [{ ...createdKey, id: 91, key: 'sk-another-studio-key' }, createdKey], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    let finishVideo!: (result: unknown) => void
    getVideoStatus.mockImplementationOnce(() => new Promise(resolve => { finishVideo = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    const originalHistoryTitle = wrapper.get('.history-item.active .history-copy strong').text()

    expect(wrapper.findAll('.result-shot-retry')).toHaveLength(2)
    expect(wrapper.get('[data-result-index="1"] .result-missing-media .result-shot-retry').attributes('aria-label')).toBe('重新生成镜头 2')
    expect(wrapper.get('[data-result-index="1"] .result-missing-media p').text()).toContain('结果会填回当前位置')
    expect(wrapper.get('[data-result-index="1"] .result-missing-media p').element.compareDocumentPosition(wrapper.get('[data-result-index="1"] .result-shot-retry').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(wrapper.find('[data-result-index="1"] .result-description-heading .result-shot-retry').exists()).toBe(false)
    await wrapper.get('#creator-prompt').setValue('编辑区里尚未生成的新提示词')
    const editorParams = wrapper.get('#video-params').text()
    const settings = wrapper.get<HTMLElement>('.settings-scroll').element
    const canvas = wrapper.get<HTMLElement>('.canvas-panel').element
    settings.scrollTop = 280
    canvas.scrollTop = 640
    vi.mocked(window.scrollTo).mockClear()
    const finishedCard = wrapper.get('[data-result-index="2"]').element
    const finishedPlayer = wrapper.get('[data-result-index="2"] .video-result-frame').element
    await wrapper.get('[data-result-index="1"] .result-shot-retry').trigger('click')
    await vi.waitFor(() => expect(getVideoStatus).toHaveBeenCalledTimes(1))
    await flushPromises()

    // The result layout stays: only the retried card shows a loader, and the
    // finished shot keeps its own player in its own position.
    expect(createVideo).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    expect(wrapper.findAll('.result-card')).toHaveLength(3)
    expect(wrapper.get('[data-result-index="1"] .result-missing-media').classes()).toContain('is-regenerating')
    expect(wrapper.get('[data-result-index="1"] .result-missing-media strong').text()).toBe('正在重新生成')
    expect(wrapper.get('[data-result-index="1"] .result-missing-media p').text()).toBe('已提交，正在排队')
    expect(wrapper.get('[data-result-index="1"] .slot-progress').classes()).toContain('indeterminate')
    expect(wrapper.find('[data-result-index="0"] .slot-progress').exists()).toBe(false)
    expect(wrapper.find('[data-result-index="1"] .result-shot-retry').exists()).toBe(false)
    expect(wrapper.get('[data-result-index="0"] .result-missing-media strong').text()).toBe('未生成')
    expect(wrapper.get('[data-result-index="2"]').element).toBe(finishedCard)
    expect(wrapper.get('[data-result-index="2"] .video-result-frame').element).toBe(finishedPlayer)
    expect(wrapper.get('.partial-result-notice strong').text()).toBe('镜头 1 未生成，镜头 2 正在重新生成')
    expect(wrapper.findAll('.history-item')).toHaveLength(1)
    expect(wrapper.get('.history-item.active .history-copy strong').text()).toBe(originalHistoryTitle)
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('编辑区里尚未生成的新提示词')
    expect(wrapper.get('#video-params').text()).toBe(editorParams)
    expect(settings.scrollTop).toBe(280)
    expect(canvas.scrollTop).toBe(640)
    expect(window.scrollTo).not.toHaveBeenCalled()

    finishVideo({ id: 'video-task-1', status: 'completed', url: '/v1/videos/video-task-1/content' })
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ id: work.id, status: 'completed' })))
    await flushPromises()

    const request = createVideo.mock.calls[0][1]
    expect(createVideo.mock.calls[0][0]).toBe(createdKey.key)
    expect(request).toMatchObject({ model: work.model, prompt: work.shotPrompts[1], duration: 10, resolution: '1080p', aspectRatio: '9:16' })
    if (generationMethod === 'image') {
      expect(request.imageDataUrl).toMatch(/^data:image\/png;base64,/)
      expect(request.referenceImageDataUrls).toBeUndefined()
    } else if (generationMethod === 'reference') {
      expect(request.imageDataUrl).toBeUndefined()
      expect(request.referenceImageDataUrls).toHaveLength(2)
    } else {
      expect(request.imageDataUrl).toBeUndefined()
      expect(request.referenceImageDataUrls).toBeUndefined()
    }
    // Every write goes to the original work; no new history item is created.
    expect(putHistory.mock.calls.every(([item]) => item.id === work.id)).toBe(true)
    const saved = putHistory.mock.calls.map(([item]) => item).at(-1)
    expect(saved).toMatchObject({
      status: 'completed', shotCount: 3, shotOutputIndexes: [1, 2], requestId: 'video-task-1,finished-task-3',
      groupId: group.id, apiKeyId: createdKey.id,
    })
    expect(saved.videoBlobs).toHaveLength(2)
    expect(saved.videoBlobs[1]).toBe(finishedBlob)
    expect(saved.error).toContain('镜头 1')
    expect(composeVideoSegments).toHaveBeenCalledTimes(1)
    expect(composeVideoSegments.mock.calls[0][0][1]).toBe(finishedBlob)
    expect(wrapper.findAll('.history-item')).toHaveLength(1)
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    expect(wrapper.findAll('.result-card')).toHaveLength(3)
    expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(1)
    expect(wrapper.get('[data-result-index="2"] .video-result-frame').element).toBe(finishedPlayer)
    expect(wrapper.get('[data-result-index="0"] .result-shot-retry').attributes('disabled')).toBeUndefined()
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('编辑区里尚未生成的新提示词')
    expect(wrapper.get('#video-params').text()).toBe(editorParams)
    expect(settings.scrollTop).toBe(280)
    expect(canvas.scrollTop).toBe(640)
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('regenerates every missing shot in place from the partial-result notice and can retry a shot that fails again', async () => {
    const finishedBlob = new Blob(['finished-shot-2'], { type: 'video/mp4' })
    const work = {
      id: 'retry-all-missing', type: 'video', status: 'completed', prompt: '三个镜头',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name, groupId: group.id,
      createdAt: 1, updatedAt: 2, outputs: ['blob:finished-shot-2'], videoBlobs: [finishedBlob],
      requestId: 'finished-task-2', shotOutputIndexes: [1], shotCount: 3, outputCount: 3,
      shotPrompts: ['海面缓慢推进', '已生成的镜头', '海底探测器下降'], shotDurations: [5, 6, 8],
      error: '已生成 1 / 3 段，其余 2 段生成失败（镜头 1、3）：上游生成失败',
    }
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    createVideo.mockResolvedValueOnce({ id: 'retry-task-1' }).mockResolvedValueOnce({ id: 'retry-task-3' })
    getVideoStatus.mockImplementation(async (_key: string, id: string) => id === 'retry-task-1'
      ? { id, status: 'failed', error: '镜头生成失败' }
      : { id, status: 'completed', url: `/v1/videos/${id}/content` })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    const lastSaved = () => putHistory.mock.calls.map(([item]) => item).at(-1)

    expect(wrapper.get('.partial-result-notice strong').text()).toBe('镜头 1、3 未生成')
    expect(wrapper.get('.partial-result-notice button').text()).toContain('全部重试')
    await wrapper.get('.partial-result-notice button').trigger('click')
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ id: work.id, status: 'completed' })))
    await flushPromises()

    // Both missing shots ran in one in-place run; the finished shot was not submitted again.
    expect(createVideo.mock.calls.map(([, request]) => request.prompt)).toEqual(['海面缓慢推进', '海底探测器下降'])
    expect(putHistory.mock.calls.every(([item]) => item.id === work.id)).toBe(true)
    expect(lastSaved()).toMatchObject({ status: 'completed', shotOutputIndexes: [1, 2], requestId: 'finished-task-2,retry-task-3' })
    expect(lastSaved().error).toContain('镜头 1')
    expect(lastSaved().error).toContain('镜头生成失败')
    expect(composeVideoSegments.mock.calls.at(-1)![0][0]).toBe(finishedBlob)
    expect(wrapper.findAll('.history-item')).toHaveLength(1)
    expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(1)
    expect(wrapper.get('.partial-result-notice strong').text()).toBe('镜头 1 未生成')

    createVideo.mockResolvedValueOnce({ id: 'retry-task-1b' })
    getVideoStatus.mockImplementation(async (_key: string, id: string) => ({ id, status: 'completed', url: `/v1/videos/${id}/content` }))
    putHistory.mockClear()
    await wrapper.get('[data-result-index="0"] .result-shot-retry').trigger('click')
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ id: work.id, status: 'completed' })))
    await flushPromises()

    expect(createVideo).toHaveBeenCalledTimes(3)
    expect(createVideo.mock.calls[2][1].prompt).toBe('海面缓慢推进')
    expect(lastSaved()).toMatchObject({ status: 'completed', shotOutputIndexes: [0, 1, 2], requestId: 'retry-task-1b,finished-task-2,retry-task-3' })
    expect(lastSaved().error).toBeUndefined()
    expect(wrapper.find('.partial-result-notice').exists()).toBe(false)
    expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(0)
    expect(wrapper.findAll('.history-item')).toHaveLength(1)
  })

  it('does not submit a missing shot when one of its saved references is unavailable', async () => {
    listHistory.mockResolvedValue([{
      id: 'retry-shot-missing-reference', type: 'video', status: 'failed', prompt: '两个参考图镜头',
      model: 'grok-imagine-video-1.5', provider: 'Grok 视频', groupName: group.name, groupId: group.id,
      createdAt: 1, updatedAt: 2, outputs: [], shotCount: 2, outputCount: 2,
      shotPrompts: ['第一个镜头', '需要两张参考图的镜头'], shotGenerationMethods: ['text', 'reference'],
      shotDurations: [5, 10], shotReferenceCounts: [0, 2],
      shotReferenceBlobs: [[], [new File(['only-one'], 'one.png', { type: 'image/png' })]],
    }])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video-1.5' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    await wrapper.get('[data-result-index="1"] .result-shot-retry').trigger('click')
    await flushPromises()

    expect(createVideo).not.toHaveBeenCalled()
    expect(putHistory).not.toHaveBeenCalled()
    expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('参考图未保存在历史中'))
    expect(wrapper.get('[data-result-index="1"] .result-shot-retry').attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('.history-item')).toHaveLength(1)
  })

  it('regenerates an older failed single video in place with its saved source image', async () => {
    const source = new File(['original-source'], 'source.png', { type: 'image/png' })
    listHistory.mockResolvedValue([{
      id: 'retry-old-single-video', type: 'video', status: 'failed', prompt: '从海面下降到海底',
      model: 'grok-imagine-video-1.5', provider: 'Grok 视频', groupName: group.name, groupId: group.id,
      createdAt: 1, updatedAt: 2, outputs: [], requestedDuration: 12,
      referenceCount: 1, shotReferenceBlobs: [[source]], aspectRatio: '2:3', resolution: '1080p',
    }])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video-1.5' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    // A single failed shot keeps its card: the failure shows where the video would be, with the card's details below.
    expect(wrapper.find('.result-error').exists()).toBe(false)
    expect(wrapper.find('.partial-result-notice').exists()).toBe(false)
    const card = wrapper.get('.result-card.is-missing')
    expect(card.get('.result-missing-media.is-failed strong').text()).toBe('生成失败')
    expect(card.get('.result-description strong').text()).toBe('Grok 视频')
    expect(card.get('.result-prompt').text()).toBe('从海面下降到海底')
    expect(card.findAll('.result-tags li').map(tag => tag.text())).toEqual(expect.arrayContaining(['2:3', '1080p', '12 秒']))
    expect(card.get('.result-media-actions.is-unavailable button[aria-label="重新生成这个镜头"]').attributes('disabled')).toBeUndefined()
    await card.get('.result-missing-media .result-shot-retry').trigger('click')
    await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(1))

    expect(createVideo.mock.calls[0][1]).toMatchObject({
      model: 'grok-imagine-video-1.5', prompt: '从海面下降到海底', duration: 12,
      aspectRatio: '2:3', resolution: '1080p', imageDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
    })
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ id: 'retry-old-single-video', status: 'completed' })))
    expect(putHistory.mock.calls.every(([item]) => item.id === 'retry-old-single-video')).toBe(true)
    await flushPromises()
    expect(wrapper.findAll('.history-item')).toHaveLength(1)
    expect(wrapper.find('.result-error').exists()).toBe(false)
  })

  it('does not regenerate a shot through a different group when its original group is unavailable', async () => {
    listHistory.mockResolvedValue([{
      id: 'retry-unavailable-group', type: 'video', status: 'failed', prompt: '保留原分组的镜头',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: '已移除的分组', groupId: 99999,
      createdAt: 1, updatedAt: 2, outputs: [], shotPrompts: ['目标镜头'], shotCount: 1,
    }])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    await wrapper.get('.result-media-actions.is-unavailable button[aria-label="重新生成这个镜头"]').trigger('click')
    await flushPromises()

    expect(createVideo).not.toHaveBeenCalled()
    expect(putHistory).not.toHaveBeenCalled()
    expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('原作品的分组、Key 或模型当前不可用'))
  })

  it('does not offer a shot retry while the original work is still pending', async () => {
    listHistory.mockResolvedValue([{
      id: 'pending-shot-no-retry', type: 'video', status: 'pending', prompt: '仍在生成的两个镜头',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name,
      createdAt: 1, updatedAt: 1, outputs: [], shotCount: 2, shotPrompts: ['镜头一', '镜头二'],
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    expect(wrapper.find('.result-shot-retry').exists()).toBe(false)
    expect(createVideo).not.toHaveBeenCalled()
  })

  it('shows a complete multi-shot video above individually described shot materials', async () => {
    listHistory.mockResolvedValue([{
      id: 'multi-shot-video',
      type: 'video',
      status: 'completed',
      prompt: '镜头 1：森林推进\n镜头 2：城市跟拍',
      model: 'grok-imagine-video',
      provider: 'Grok 视频',
      groupName: group.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['blob:shot-one', 'blob:shot-two'],
      mergedOutput: 'blob:complete-video',
      shotCount: 2,
      shotPrompts: ['森林推进', '城市跟拍'],
      shotDurations: [4, 6],
      shotAspectRatios: ['16:9', '9:16'],
      shotResolutions: ['720p', '1080p'],
      shotActualOutputSizes: ['1280x720', '1080x1920'],
      shotGenerationMethods: ['text', 'image'],
      shotReferenceCounts: [0, 1],
      requestedDuration: 10,
      aspectRatio: '16:9',
      resolution: '720p',
    }])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')

    expect(wrapper.get('.complete-video-card').text()).toContain('所有镜头已按顺序合成')
    expect(wrapper.get('.complete-video-card header p:last-child').text()).toBe('2 个镜头已按时间顺序拼接，完整保留每段画面与声音，可直接预览或下载。')
    expect(wrapper.get<HTMLVideoElement>('.complete-video-media').attributes('src')).toBe('blob:complete-video')
    // The card loads out of sight and only appears once its first frame is ready.
    expect(wrapper.get('.complete-video-card').classes()).toContain('is-preparing')
    expect(wrapper.get('.complete-video-card').attributes('aria-hidden')).toBe('true')
    const completeVideo = wrapper.get<HTMLVideoElement>('.complete-video-media')
    Object.defineProperties(completeVideo.element, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
    })
    for (const video of wrapper.findAll<HTMLVideoElement>('.creator-video-player video')) {
      expect(video.element.controls).toBe(false)
      await video.trigger('loadedmetadata')
      await video.trigger('loadeddata')
    }
    expect(wrapper.findAll('.video-play-toggle')).toHaveLength(3)
    expect(wrapper.get('.complete-video-card').classes()).not.toContain('is-preparing')
    expect(wrapper.get('.complete-video-card').attributes('aria-hidden')).toBeUndefined()
    expect(wrapper.get<HTMLAnchorElement>('.complete-video-card footer a').attributes('download')).toBe('creator-complete-multi-shot-video.mp4')
    expect(wrapper.findAll('.complete-video-card footer .result-tags li').map(tag => tag.text())).toEqual([
      'grok-imagine-video', '16:9', '720p', '总时长 10 秒', '2 个镜头',
    ])
    expect(wrapper.findAll('.result-segment-grid .result-card')).toHaveLength(2)
    expect(wrapper.findAll('.result-segment-grid .result-description p').map(item => item.text())).toEqual(['森林推进', '城市跟拍'])
    expect(wrapper.findAll('.result-segment-grid .result-tags').map(tags => tags.findAll('li').map(tag => tag.text()))).toEqual([
      ['grok-imagine-video', '16:9', '720p', '4 秒', '文生'],
      ['grok-imagine-video', '9:16', '1080p', '6 秒', '首帧图生'],
    ])
    expect(wrapper.find('.result-prompt-cell').exists()).toBe(false)
  })

  it('keeps the complete video card away while shots are still generating', async () => {
    listHistory.mockResolvedValue([{
      id: 'still-generating', type: 'video', status: 'pending',
      prompt: '两个镜头', model: 'grok-imagine-video', provider: 'Grok 视频',
      groupName: group.name, createdAt: Date.now(), updatedAt: Date.now(),
      outputs: ['blob:shot-one', 'blob:shot-two'], shotCount: 3,
    }])
    const wrapper = mount(CreatorStudioView, {
      global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } },
    })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.find('.complete-video-card').exists()).toBe(false)
    expect(wrapper.find('.complete-video-pending').exists()).toBe(false)
  })

  it('preserves worker errors and retries composition using persisted segments', async () => {
    const videoBlobs = [new Blob(['shot-one']), new Blob(['shot-two'])]
    const mergedVideoBlob = new Blob(['complete'], { type: 'video/mp4' })
    listHistory.mockResolvedValue([{
      id: 'retry-composition', type: 'video', status: 'completed',
      prompt: '两个镜头', model: 'grok-imagine-video', provider: 'Grok 视频',
      groupName: group.name, createdAt: Date.now(), updatedAt: Date.now(),
      outputs: ['blob:expired-one', 'blob:expired-two'], videoBlobs,
      shotCount: 2, mergeError: '先前合成失败',
    }])
    composeVideoSegments
      .mockRejectedValueOnce('RuntimeError: WebAssembly compilation blocked')
      .mockResolvedValueOnce(mergedVideoBlob)
    const wrapper = mount(CreatorStudioView, {
      global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } },
    })
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    expect(wrapper.get('.complete-video-card h3').text()).toContain('等待合成')
    expect(wrapper.get('.complete-video-card').text()).not.toContain('已按时间顺序拼接')

    await wrapper.get('.complete-video-pending button').trigger('click')
    await flushPromises()
    expect(composeVideoSegments).toHaveBeenLastCalledWith(videoBlobs)
    expect(wrapper.get('.complete-video-pending').text()).toContain('WebAssembly compilation blocked')
    expect(showWarning).toHaveBeenCalledWith('RuntimeError: WebAssembly compilation blocked')
    expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ videoBlobs }))

    await wrapper.get('.complete-video-pending button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.complete-video-card h3').text()).toBe('所有镜头已按顺序合成')
    expect(wrapper.find('.complete-video-media').exists()).toBe(true)
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ videoBlobs, mergedVideoBlob, mergeError: undefined }))
    expect(getVideoContent).not.toHaveBeenCalled()
    expect(createVideo).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps queued zero indeterminate and shows real progress even when the provider still says pending', async () => {
    vi.useFakeTimers()
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    let resolveFirstStatus: ((status: { id: string; status: string; progress?: number }) => void) | undefined
    let resolveSecondStatus: ((status: { id: string; status: string; progress?: number }) => void) | undefined
    let resolveThirdStatus: ((status: { id: string; status: string; progress?: number }) => void) | undefined
    let resolveFourthStatus: ((status: { id: string; status: string; progress?: number }) => void) | undefined
    getVideoStatus
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirstStatus = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecondStatus = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveThirdStatus = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveFourthStatus = resolve }))
      .mockResolvedValueOnce({ id: 'video-task-1', status: 'completed' })

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('一只小猫奔跑')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    const caption = () => wrapper.get('.result-drawing-media small').text()
    const progressBar = () => wrapper.get('.result-drawing-media .slot-progress')
    expect(caption()).not.toContain('%')
    expect(progressBar().classes()).toContain('indeterminate')
    resolveFirstStatus?.({ id: 'video-task-1', status: 'queued', progress: 0 })
    await flushPromises()
    expect(caption()).toBe('已提交，正在排队')
    expect(progressBar().classes()).toContain('indeterminate')

    await vi.advanceTimersByTimeAsync(4000)
    resolveSecondStatus?.({ id: 'video-task-1', status: 'processing' })
    await flushPromises()
    expect(caption()).toBe('生成中 1%')
    expect(progressBar().classes()).not.toContain('indeterminate')

    await vi.advanceTimersByTimeAsync(4000)
    resolveThirdStatus?.({ id: 'video-task-1', status: 'processing', progress: 0 })
    await flushPromises()
    expect(caption()).toBe('生成中 1%')

    await vi.advanceTimersByTimeAsync(4000)
    resolveFourthStatus?.({ id: 'video-task-1', status: 'pending', progress: 12 })
    await flushPromises()
    expect(caption()).toBe('生成中 12%')
    expect(progressBar().classes()).not.toContain('indeterminate')
    expect(progressBar().get('i').attributes('style')).toContain('width: 12%')

    await vi.advanceTimersByTimeAsync(4000)
    await flushPromises()
    expect(wrapper.find('.result-card.is-drawing').exists()).toBe(false)
    vi.useRealTimers()
  })

  it('shows video status-check errors in the result placeholder with a retry action', async () => {
    const pending = {
      id: 'pending-video-sync-error', type: 'video', status: 'pending', prompt: '采样时的变化',
      model: 'muse-video', provider: 'Muse 视频', groupName: group.name, groupId: group.id,
      createdAt: 1, updatedAt: 2, outputs: [], shotCount: 1, outputCount: 1,
      shotPrompts: ['采样时的变化'], requestId: 'pending-muse-task',
    }
    listHistory.mockResolvedValue([pending])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'muse-video' }])
    let failStatus!: (error: Error) => void
    getVideoStatus.mockImplementationOnce(() => new Promise((_resolve, reject) => { failStatus = reject }))
      .mockRejectedValue(new Error('status payload was temporarily unavailable'))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await vi.waitFor(() => expect(getVideoStatus).toHaveBeenCalledTimes(1))

    // Background tracking already runs, so opening shows its progress, not a status check.
    expect(wrapper.text()).not.toContain('正在同步状态')
    expect(wrapper.find('.result-card.is-drawing').exists()).toBe(true)

    failStatus(new Error('status payload was temporarily unavailable'))
    await flushPromises()

    expect(wrapper.findAll('.result-card')).toHaveLength(1)
    const placeholder = wrapper.get('.result-card .result-missing-media')
    expect(placeholder.classes()).toContain('is-status-error')
    expect(placeholder.get('strong').text()).toBe('任务状态检查失败')
    expect(placeholder.text()).toContain('视频服务暂时不可用')
    expect(wrapper.find('.result-error').exists()).toBe(false)
    expect(placeholder.get('.status-check-command').text()).toContain('同步状态')
    expect(placeholder.get('p').element.compareDocumentPosition(placeholder.get('.status-check-command').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(wrapper.find('.result-card .pending-video-status').exists()).toBe(false)
    expect(wrapper.find('.result-card .video-status-feedback').exists()).toBe(false)
    const headingActions = wrapper.get('.result-heading-actions').findAll('button')
    expect(headingActions[0].classes()).toContain('delete-work-command')
    const regenerate = headingActions.find(button => button.text().includes('重新生成'))
    expect(regenerate?.attributes('disabled')).toBeUndefined()
  })

  it('fails a single-shot video whose page closed before it got a task ID', async () => {
    const pending = {
      id: 'interrupted-submission', type: 'video', status: 'pending', prompt: '让这个女孩跳舞',
      model: 'minimax-h3-2k', provider: 'MiniMax H3 视频', groupName: group.name, groupId: group.id,
      createdAt: 1, updatedAt: 2, outputs: [], shotCount: 1, outputCount: 1, shotPrompts: ['让这个女孩跳舞'],
    }
    listHistory.mockResolvedValue([pending])
    getHistory.mockResolvedValue(pending)
    putHistory.mockResolvedValue(true)
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ id: 'interrupted-submission', status: 'failed', error: expect.stringContaining('没有拿到任务编号') }), 2)
    const placeholder = wrapper.get('.result-card .result-missing-media')
    expect(placeholder.get('strong').text()).toBe('生成失败')
    expect(placeholder.text()).toContain('没有拿到任务编号')
    expect(placeholder.find('.result-shot-retry').exists()).toBe(true)
    expect(wrapper.find('.result-card .pending-video-status').exists()).toBe(false)
  })

  it('keeps a video pending while another window is still submitting it', async () => {
    const request = vi.fn(async (_name: string, _options: unknown, callback: (lock: null) => Promise<void>) => callback(null))
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { locks: { request } }))
    onTestFinished(() => vi.unstubAllGlobals())
    const pending = {
      id: 'submitting-elsewhere', type: 'video', status: 'pending', prompt: '让这个女孩跳舞',
      model: 'minimax-h3-2k', provider: 'MiniMax H3 视频', groupName: group.name, groupId: group.id,
      createdAt: 1, updatedAt: 2, outputs: [], shotCount: 1, outputCount: 1, shotPrompts: ['让这个女孩跳舞'],
    }
    listHistory.mockResolvedValue([pending])
    getHistory.mockResolvedValue(pending)
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(request).toHaveBeenCalledWith('creator-video-shots:submitting-elsewhere', { ifAvailable: true }, expect.any(Function))
    expect(putHistory).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }), expect.anything())
    expect(wrapper.get('.result-card .result-missing-media strong').text()).toBe('等待生成结果')
    // Without a task ID there is nothing to sync, so no empty status bar is left under the card.
    expect(wrapper.find('.result-card .pending-video-status').exists()).toBe(false)
  })

  it('shows a pending video the provider gave up on as failed instead of a status-check error', async () => {
    const pending = {
      id: 'pending-provider-gave-up', type: 'video', status: 'pending', prompt: '采样时的变化',
      model: 'muse-video', provider: 'Muse 视频', groupName: group.name, groupId: group.id,
      createdAt: 1, updatedAt: 2, outputs: [], shotCount: 1, outputCount: 1,
      shotPrompts: ['采样时的变化'], requestId: 'sf_gave_up',
    }
    listHistory.mockResolvedValue([pending])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'muse-video' }])
    getVideoStatus.mockResolvedValue({
      id: 'sf_gave_up', status: 'failed', progress: 13,
      error: { message: 'The provider could not complete this video. Keep the order ID and check usage before submitting a new task.' },
    })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ id: pending.id, status: 'failed' })))
    await flushPromises()

    expect(wrapper.text()).not.toContain('任务状态检查失败')
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    expect(wrapper.get('.result-missing-media.is-failed').text()).toContain('生成失败')
    expect(wrapper.get('.result-missing-media.is-failed').text()).toContain('上游未能完成这个视频')
    expect(createVideo).not.toHaveBeenCalled()
  })

  it('turns an unsupported Seedance model error into a Chinese hint to pick another model', async () => {
    const failed = {
      id: 'failed-unsupported-seedance', type: 'video', status: 'failed', prompt: '草莓落入气泡水',
      model: 'Jseadanco2.0', provider: 'Seedance 视频', groupName: group.name, groupId: group.id,
      createdAt: 1, updatedAt: 2, outputs: [], shotCount: 1, outputCount: 1,
      shotPrompts: ['草莓落入气泡水'], error: 'unsupported Seedance model "Jseadanco2.0"',
    }
    listHistory.mockResolvedValue([failed])
    getHistory.mockResolvedValue(failed)
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    const card = wrapper.get('.result-missing-media.is-failed').text()
    expect(card).toContain('当前视频模型「Jseadanco2.0」暂不可用')
    expect(card).toContain('换一个模型')
    expect(card).not.toContain('unsupported Seedance model')
  })

  it('keeps syncing a pending video through a status outage and loads it once the relay answers', async () => {
    vi.useFakeTimers()
    try {
      const pending = {
        id: 'pending-through-outage', type: 'video', status: 'pending', prompt: '海底的敲击',
        model: 'muse-video', provider: 'Muse 视频', groupName: group.name, groupId: group.id,
        createdAt: 1, updatedAt: 2, outputs: [], shotCount: 1, outputCount: 1,
        shotPrompts: ['海底的敲击'], requestId: 'sf_outage',
      }
      listHistory.mockResolvedValue([pending])
      listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
      listModels.mockResolvedValue([{ id: 'muse-video' }])
      getVideoStatus.mockRejectedValue(Object.assign(new Error('Muse upstream status 502'), { status: 502 }))
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      onTestFinished(() => wrapper.unmount())
      await flushPromises()
      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()

      // Five failed lookups end one tracking round; the work keeps syncing instead of erroring.
      await vi.advanceTimersByTimeAsync(20_000)
      await flushPromises()
      expect(wrapper.find('.result-card.is-drawing').exists()).toBe(true)
      expect(wrapper.get('.result-heading-progress').text()).toContain('任务状态暂时无法查询')
      expect(wrapper.text()).not.toContain('任务状态检查失败')

      getVideoStatus.mockResolvedValue({ id: 'sf_outage', status: 'completed', url: '/v1/videos/sf_outage/content' })
      await vi.advanceTimersByTimeAsync(10_000)
      await flushPromises()
      expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ id: pending.id, status: 'completed' }))
      expect(wrapper.find('.result-card.is-drawing').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('任务状态检查失败')
    } finally {
      vi.useRealTimers()
    }
  })

  it('advances estimated video progress when the provider omits percentages', async () => {
    vi.useFakeTimers()
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockResolvedValue({ id: 'video-task-1', status: 'processing' })
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('镜头缓慢向前推进')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(wrapper.get('.result-drawing-media small').text()).toBe('生成中 1%')
    await vi.advanceTimersByTimeAsync(28_000)
    await flushPromises()

    const estimatedProgress = Number(wrapper.get('.result-drawing-media .slot-progress').attributes('aria-valuenow'))
    expect(estimatedProgress).toBeGreaterThanOrEqual(10)
    expect(estimatedProgress).toBeLessThan(100)
    expect(wrapper.get('.result-drawing-media small').text()).toBe(`生成中 ${estimatedProgress}%`)
    expect(wrapper.get('.result-drawing-media .slot-progress i').attributes('style')).toContain(`width: ${estimatedProgress}%`)

    getVideoStatus.mockResolvedValue({ id: 'video-task-1', status: 'completed' })
    await vi.advanceTimersByTimeAsync(4_000)
    await flushPromises()
    expect(wrapper.find('.result-card.is-drawing').exists()).toBe(false)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('limits reference-to-video to an available 1.5 model', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'grok-imagine-video' },
      { id: 'grok-imagine-video-1.5' },
    ])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await openGrokVideo(wrapper)
    await flushPromises()

    expect(wrapper.get<HTMLSelectElement>('#creator-model').findAll('option').map(option => option.text())).toEqual([
      'grok-imagine-video',
      'grok-imagine-video-1.5',
    ])
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video')
    expect(wrapper.get('#creator-model').text()).toContain('grok-imagine-video')
    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('text')
    expect(wrapper.find('.reference-field').exists()).toBe(false)
    await wrapper.get('#video-params').trigger('click')
    expect(videoParamsDialog(wrapper).findAll('.image-ratio-grid button').map(button => button.attributes('data-ratio'))).toEqual([
      '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9',
    ])
    await videoParamsDialog(wrapper).get('.image-size-cancel').trigger('click')

    // Grok before 1.5 only takes a first frame; references need 1.5.
    const methodOptions = () => wrapper.get('#video-generation-method').findAll('option').map(option => ({
      text: option.text(),
      disabled: (option.element as HTMLOptionElement).disabled,
    }))
    expect(methodOptions()).toEqual([
      { text: '文生视频 · 只用提示词', disabled: false },
      { text: '首帧图生视频 · 1 张首帧图', disabled: false },
      { text: '参考图生视频 · 最多 7 张（当前模型不支持）', disabled: true },
    ])

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('grok-imagine-video-1.5')
    expect(methodOptions().every(option => !option.disabled)).toBe(true)
    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('image')
    expect(wrapper.get('.reference-field').text()).toContain('首帧图')
    expect(wrapper.get('.reference-field').text()).toContain('必选，仅 1 张，作为视频首帧')

    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('reference')
    expect(wrapper.get<HTMLSelectElement>('#creator-model').findAll('option').map(option => option.text())).toEqual([
      'grok-imagine-video',
      'grok-imagine-video-1.5',
    ])
    expect(wrapper.get('.reference-field').text()).toContain('参考图')
    expect(wrapper.get('.reference-field').text()).toContain('最多 7 张')

    // A model without reference support moves the shot to first-frame mode.
    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('grok-imagine-video')
    await flushPromises()
    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('image')
    wrapper.unmount()
  })

  it('sends one first-frame image on Grok models before 1.5', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('image')

    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [
      new File(['frame-one'], 'frame-one.png', { type: 'image/png' }),
      new File(['frame-two'], 'frame-two.png', { type: 'image/png' }),
    ] })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('.model-compatibility-error').exists()).toBe(false)
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video')
    expect(wrapper.findAll('.reference-item')).toHaveLength(1)
    expect(showError).toHaveBeenCalledWith('已保留前 1 张有效参考图')

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('让画面动起来')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(1))
    expect(createVideo).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      model: 'grok-imagine-video',
      imageDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      referenceImageDataUrls: undefined,
    }))
    wrapper.unmount()
  })

  it('submits one source image without automatically switching the selected video model', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'grok-imagine-video' },
      { id: 'grok-imagine-video-1.5' },
    ])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('grok-imagine-video-1.5')
    await setVideoParams(wrapper, { ratio: '4:3' })
    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('image')

    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [
      new File(['source-one'], 'source-one.png', { type: 'image/png' }),
    ] })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.findAll('.reference-item')).toHaveLength(1)
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video-1.5')

    // Image-to-video follows the source image by default, so the ratio grid stays locked.
    expect(wrapper.get('#video-params').text()).toContain('跟随原图')
    await wrapper.get('#video-params').trigger('click')
    const params = videoParamsDialog(wrapper)
    expect(params.get('[data-aspect-source="follow"]').classes()).toContain('active')
    expect(params.get('.video-aspect-source-hint').text()).toContain('跟随原图')
    expect(params.findAll('.image-ratio-grid button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(params.find('.image-ratio-grid button.active').exists()).toBe(false)
    await params.get('.image-size-cancel').trigger('click')

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('让源图中的人物自然转身')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(1))

    expect(createVideo).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      model: 'grok-imagine-video-1.5',
      aspectRatio: '4:3',
      imageDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      referenceImageDataUrls: undefined,
    }))
    expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ shotFollowSourceAspects: [true] }))
    wrapper.unmount()
  })

  it('crops the image-to-video source to a custom ratio when the user opts out of following it', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video-1.5' }])
    const header = new Uint8Array(24)
    header.set([137, 80, 78, 71, 13, 10, 26, 10])
    header.set([73, 72, 68, 82], 12)
    new DataView(header.buffer).setUint32(16, 1600)
    new DataView(header.buffer).setUint32(20, 900)
    const cropped = 'data:image/png;base64,Y3JvcHBlZA=='
    vi.stubGlobal('Image', class {
      naturalWidth = 1600
      naturalHeight = 900
      onload?: () => void
      set src(_source: string) { queueMicrotask(() => this.onload?.()) }
    })
    const drawImage = vi.fn()
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    const dataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(cropped)
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await openGrokVideo(wrapper)
      await flushPromises()
      await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('image')
      const input = wrapper.get<HTMLInputElement>('input[type="file"]')
      Object.defineProperty(input.element, 'files', { configurable: true, value: [new File([header], 'wide.png', { type: 'image/png' })] })
      await input.trigger('change')
      await flushPromises()

      await wrapper.get('#video-params').trigger('click')
      const params = videoParamsDialog(wrapper)
      await params.get('[data-aspect-source="custom"]').trigger('click')
      expect(params.get('.video-aspect-source-hint').text()).toContain('居中裁剪')
      expect(params.findAll('.image-ratio-grid button').filter(button => button.attributes('disabled') !== undefined).map(button => button.attributes('data-ratio'))).toEqual(['21:9'])
      await params.get('.image-ratio-grid button[data-ratio="9:16"]').trigger('click')
      await params.get('.image-size-confirm').trigger('click')
      expect(wrapper.get('#video-params').text()).toContain('9:16')

      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('竖屏镜头缓慢推进')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(1))

      // 1600x900 center-cropped to 9:16 keeps the full height: 506x900 from x=547.
      expect(drawImage).toHaveBeenCalledWith(expect.anything(), 547, 0, 506, 900, 0, 0, 506, 900)
      expect(createVideo).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({ aspectRatio: '9:16', imageDataUrl: cropped }))
      expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ shotFollowSourceAspects: [false] }))
    } finally {
      wrapper.unmount()
      context.mockRestore()
      dataURL.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('keeps seven reference images and submits them through reference-to-video', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video-1.5' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('reference')

    const references = Array.from({ length: 8 }, (_, index) => (
      new File([`reference-${index + 1}`], `reference-${index + 1}.png`, { type: 'image/png' })
    ))
    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: references })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.findAll('.reference-item')).toHaveLength(7)
    expect(showError).toHaveBeenCalledWith('已保留前 7 张有效参考图')

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('保持这些人物、服装和产品一致')
    await setVideoParams(wrapper, { ratio: '2:3' })
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(1))

    expect(createVideo).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      model: 'grok-imagine-video-1.5',
      aspectRatio: '2:3',
      imageDataUrl: undefined,
      referenceImageDataUrls: expect.arrayContaining([
        expect.stringMatching(/^data:image\/png;base64,/),
      ]),
    }))
    expect(createVideo.mock.calls[0][1].referenceImageDataUrls).toHaveLength(7)
    wrapper.unmount()
  })

  it('moves muse-video out of the Grok tab into its own Muse tab and group', async () => {
    const museGroup = { ...group, id: 7709, name: 'Muse', description: '', platform: 'grok', video_model_prices: { seedance: { 'muse-video': 0.3 } } } as Group
    const museKey = { ...createdKey, id: 39, key: 'sk-muse', group_id: museGroup.id, group: museGroup } as ApiKey
    listGroups.mockResolvedValue([group, museGroup])
    listKeys.mockResolvedValue({ items: [createdKey, museKey], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }, { id: 'muse-video' }, { id: 'heavy-grok-720p' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()

    expect(wrapper.findAll('#creator-group option').map(option => option.text())).toEqual([group.name])
    expect(wrapper.findAll('#creator-model option').some(option => option.text().startsWith('Muse'))).toBe(false)

    await wrapper.findAll('.video-capability-switch button').find(button => button.text() === 'Muse')!.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('#creator-group option').map(option => option.text())).toEqual(['Muse'])
    expect(wrapper.findAll('#creator-model option').map(option => option.text())).toEqual(['Muse 视频 · 720p · 按秒 · 0.10/秒'])

    const method = wrapper.get<HTMLSelectElement>('#video-generation-method')
    const options = method.findAll('option').map(option => ({ text: option.text(), disabled: (option.element as HTMLOptionElement).disabled }))
    expect(options.find(option => option.text.startsWith('首帧图生视频'))?.disabled).toBe(false)
    expect(options.find(option => option.text.startsWith('参考图生视频'))?.disabled).toBe(true)
    wrapper.unmount()
  })

  it('moves reference mode to first-frame mode when switching to the Muse tab', async () => {
    const museGroup = { ...group, id: 7709, name: 'Muse', description: '', platform: 'grok', video_model_prices: { seedance: { 'muse-video': 0.3 } } } as Group
    const museKey = { ...createdKey, id: 39, key: 'sk-muse', group_id: museGroup.id, group: museGroup } as ApiKey
    listGroups.mockResolvedValue([group, museGroup])
    listKeys.mockResolvedValue({ items: [createdKey, museKey], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video-1.5' }, { id: 'muse-video' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get('#video-generation-method').setValue('reference')
    await flushPromises()

    await wrapper.findAll('.video-capability-switch button').find(button => button.text() === 'Muse')!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.model-compatibility-error').exists()).toBe(false)
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('muse-video')
    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('image')
    expect(wrapper.get('.reference-field').text()).toContain('必选，仅 1 张，作为视频首帧')
    wrapper.unmount()
  })

  // Quote each H3 tier on its own: per second unless perRequest.
  function mockH3Quotes(quotes: Record<string, [string, number, number, boolean]>) {
    getVideoPricing.mockImplementation(async (_key: string, model: string) => {
      const [resolution, rate, minSeconds, perRequest] = quotes[model.toLowerCase()]
      return { currency: 'USD', prices: { [resolution]: Array.from({ length: 15 }, (_, i) => i + 1 < minSeconds ? null : perRequest ? rate : rate * (i + 1)) } }
    })
  }

  async function openMiniMax(prices: Record<string, number>, models: string[]) {
    const h3Group = { ...group, id: 7700, name: 'MiniMax', description: '', platform: 'minimax', video_model_prices: { 'minimax-h3': prices } } as Group
    const textGroup = { ...group, id: 7701, name: 'MiniMax 文本', description: '', platform: 'minimax' } as Group
    const h3Key = { ...createdKey, id: 30, key: 'sk-h3', group_id: h3Group.id, group: h3Group } as ApiKey
    listGroups.mockResolvedValue([group, h3Group, textGroup])
    listKeys.mockResolvedValue({ items: [createdKey, h3Key], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue(models.map(id => ({ id })))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    expect(wrapper.findAll('#creator-group option').map(option => option.text())).toEqual([group.name])
    await wrapper.findAll('.video-capability-switch button')[2].trigger('click')
    await flushPromises()
    expect(wrapper.findAll('#creator-group option').map(option => option.text())).toEqual(['MiniMax'])
    return wrapper
  }

  it('creates MiniMax H3 video only in priced MiniMax groups and lists priced catalog models', async () => {
    mockH3Quotes({ 'minimaxh3-768': ['768p', 0.08, 5, true], 'xminimex-h3': ['1440p', 0.2, 5, false] })
    // Retired DeepKey IDs and models without a group price are not offered.
    const wrapper = await openMiniMax({ 'minimaxh3-768': 0.08, 'xminimex-h3': 0.2 }, ['Minimax-H3-768p-933-10s-15s', 'xminimex-h3', 'MiniMax-H3-933-1440p-10-15s', 'minimaxh3-768', 'MiniMax-M2'])

    expect(getMiniMaxCatalog).toHaveBeenCalledWith('sk-h3')
    expect(wrapper.findAll('#creator-model option').map(option => option.text()))
      .toEqual([
        'MiniMax H3 标清版 768p · 高速并发 · 0.08/条',
        'MiniMax H3 高清版 2K · 原生不卡脸 · 0.20/秒',
      ])
    expect(wrapper.get('[data-testid="minimax-tier-hint"]').text()).toBe('高速并发 · 按条计费 · 5 / 6 / 7 / 9 / 10 / 11 / 12 / 13 / 14 / 15 秒 · 需参考图')
    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('reference')
    expect(await videoResolutionChoices(wrapper)).toEqual(['768p'])

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('xminimex-h3')
    await flushPromises()
    expect(wrapper.get('[data-testid="minimax-tier-hint"]').text()).toBe('原生不卡脸 · 按秒计费 · 5–15 秒')
    expect(await videoResolutionChoices(wrapper)).toEqual(['1440p'])
    await wrapper.get('#video-params').trigger('click')
    expect(videoParamsDialog(wrapper).findAll('.image-ratio-grid button').map(button => button.attributes('data-ratio')))
      .toEqual(['1:1', '16:9', '9:16'])
    await videoParamsDialog(wrapper).get('.image-size-cancel').trigger('click')
    // Typed durations are clamped to the tier range on commit.
    await wrapper.get('#creator-video-duration').setValue('99')
    expect(wrapper.get<HTMLInputElement>('#creator-video-duration').element.value).toBe('15')
    await wrapper.get('#creator-video-duration').setValue('12')

    await wrapper.get('#video-generation-method').setValue('text')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('海边木栈道慢步')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(1))
    expect(createVideo).toHaveBeenCalledWith('sk-h3', expect.objectContaining({
      model: 'xminimex-h3',
      duration: 12,
      resolution: '1440p',
    }))
    wrapper.unmount()
  })

  it('names and limits MiniMax models from the administrator catalog', async () => {
    getMiniMaxCatalog.mockResolvedValue({ customized: true, entries: [
      { model: 'new-h3', name: 'H3 极速版', note: '大并发', resolution: '1080p', min_seconds: 6, max_seconds: 10, per_request: false, max_reference_images: 0, requires_reference: false, aspect_ratios: ['9:16'] },
      { model: 'xminimex-h3', name: 'H3 原生 2K', note: '原生不卡脸', resolution: '1440p', min_seconds: 5, max_seconds: 15, per_request: false, max_reference_images: 9, requires_reference: false },
    ] })
    mockH3Quotes({ 'new-h3': ['1080p', 0.1, 6, false], 'xminimex-h3': ['1440p', 0.2, 5, false] })
    try {
      const wrapper = await openMiniMax({ 'new-h3': 0.1, 'xminimex-h3': 0.2, 'minimaxh3-768': 2 }, ['xminimex-h3', 'minimaxh3-768', 'new-h3'])
      expect(wrapper.findAll('#creator-model option').map(option => option.text())).toEqual(['H3 极速版 · 0.10/秒', 'H3 原生 2K · 0.20/秒'])
      expect(wrapper.get('[data-testid="minimax-tier-hint"]').text()).toBe('大并发 · 按秒计费 · 6–10 秒 · 仅文生视频')
      expect(wrapper.get('#video-generation-method option[value="reference"]').attributes('disabled')).toBeDefined()
      expect(await videoResolutionChoices(wrapper)).toEqual(['1080p'])
      await wrapper.get('#video-params').trigger('click')
      expect(videoParamsDialog(wrapper).findAll('.image-ratio-grid button').map(button => button.attributes('data-ratio'))).toEqual(['9:16'])
      await videoParamsDialog(wrapper).get('.image-size-cancel').trigger('click')
      wrapper.unmount()
    } finally {
      const { applyMiniMaxCatalog } = await import('@/utils/miniMaxH3')
      applyMiniMaxCatalog(null)
    }
  })

  it('lists priced Seedance lines in catalog order with a line hint', async () => {
    const sdGroup = { ...group, id: 7800, name: 'Seedance', description: '', platform: 'deepseek', video_model_prices: { seedance: { '00sd2.0': 1.5, 'ttsedanco2.0-720': 0.345 } } } as Group
    const textGroup = { ...group, id: 7801, name: 'DeepSeek 文本', description: '', platform: 'deepseek' } as Group
    const sdKey = { ...createdKey, id: 31, key: 'sk-sd', group_id: sdGroup.id, group: sdGroup } as ApiKey
    listGroups.mockResolvedValue([group, sdGroup, textGroup])
    listKeys.mockResolvedValue({ items: [createdKey, sdKey], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'TTsedanco2.0-720' },
      { id: 'Xseadanco2.0' },
      { id: '00sd2.0' },
      { id: 'deepseek-v4-pro' },
    ])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    expect(wrapper.findAll('#creator-group option').map(option => option.text())).toEqual([group.name])
    await wrapper.findAll('.video-capability-switch button')[0].trigger('click')
    await flushPromises()

    // Priced catalog models are listed by name in catalog order; unpriced
    // (Xseadanco2.0) and non-video models are not.
    expect(wrapper.findAll('#creator-group option').map(option => option.text())).toEqual(['Seedance'])
    expect(wrapper.findAll('#creator-model option').map(option => option.text()))
      .toEqual(['Seedance 2.0 720p · 低价按条', 'Seedance 2.0 720p · 官转 · 按秒'])
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('00sd2.0')
    expect(await videoResolutionChoices(wrapper)).toEqual(['720p'])

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('TTsedanco2.0-720')
    await flushPromises()
    expect(wrapper.get('[data-testid="seedance-tier-hint"]').text()).toBe('官转真实满血，原生不卡脸 · 按秒计费 · 5–15 秒')
    expect(wrapper.get('#video-generation-method option[value="image"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#video-generation-method option[value="reference"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('#video-params').trigger('click')
    expect(videoParamsDialog(wrapper).findAll('.image-ratio-grid button').map(button => button.attributes('data-ratio')))
      .toEqual(['1:1', '16:9', '9:16'])
    await videoParamsDialog(wrapper).get('.image-size-cancel').trigger('click')

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('纸飞机掠过湖面')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(createVideo).toHaveBeenCalledWith('sk-sd', expect.objectContaining({
      model: 'TTsedanco2.0-720',
      resolution: '720p',
    }))
    wrapper.unmount()
  })

  it('rejects video references that exceed the optimized 15MB aggregate limit', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video-1.5' }])
    optimizeVideoReferenceImage.mockImplementation(async (file: File) => ({
      file: new File([new Uint8Array(3 * 1024 * 1024)], `${file.name}.webp`, { type: 'image/webp' }),
      width: 1024,
      height: 1024,
      optimized: true,
    }))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('reference')

    const references = Array.from({ length: 6 }, (_, index) => (
      new File([`reference-${index + 1}`], `reference-${index + 1}.png`, { type: 'image/png' })
    ))
    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: references })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.findAll('.reference-item')).toHaveLength(5)
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('压缩后合计不能超过 15MB'))
    wrapper.unmount()
  })

  it('keeps xAI video validation details visible', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    createVideo.mockRejectedValueOnce(Object.assign(
      new Error('reference image resolution is invalid: shortest side must be at least 8 pixels'),
      { status: 400 },
    ))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('镜头向前推进')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(showError).toHaveBeenCalledWith('reference image resolution is invalid: shortest side must be at least 8 pixels')
    expect(wrapper.text()).toContain('reference image resolution is invalid: shortest side must be at least 8 pixels')
    wrapper.unmount()
  })

  it('stops an expired video task before fetching a stale content URL', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoStatus.mockResolvedValueOnce({ id: 'video-task-1', status: 'expired', url: '/v1/videos/video-task-1/content' })
    const wrapper = mount(CreatorStudioView, {
      global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('镜头向前推进')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(getVideoContent).not.toHaveBeenCalled()
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }))
    expect(showError).toHaveBeenCalledWith('视频生成失败')
    wrapper.unmount()
  })

  it('retries transient upstream errors while submitting a video shot', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    createVideo
      .mockRejectedValueOnce(Object.assign(new Error('Upstream service temporarily unavailable'), { status: 502 }))
      .mockRejectedValueOnce(Object.assign(new Error('Service unavailable'), { status: 503 }))
      .mockResolvedValueOnce({ id: 'retried-video-shot' })
    getVideoStatus.mockResolvedValueOnce({ id: 'retried-video-shot', status: 'completed' })

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('让人物跳舞')

    vi.useFakeTimers()
    try {
      const generation = wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      expect(createVideo).toHaveBeenCalledTimes(1)
      expect(wrapper.get('.result-drawing-media').text()).toContain('自动重试（1/2）')

      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      expect(createVideo).toHaveBeenCalledTimes(2)
      expect(wrapper.get('.result-drawing-media').text()).toContain('自动重试（2/2）')

      await vi.advanceTimersByTimeAsync(5000)
      await generation
      await flushPromises()
      expect(createVideo).toHaveBeenCalledTimes(3)
      expect(createVideo.mock.calls.every(([, request]) => request.prompt === '让人物跳舞')).toBe(true)
      expect(showSuccess).toHaveBeenCalledWith('作品生成完成')
      expect(showError).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
      createVideo.mockReset()
    }
  })

  it('resubmits a video task the provider failed because it could not read the image', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    createVideo
      .mockResolvedValueOnce({ id: 'image-fetch-failed' })
      .mockResolvedValueOnce({ id: 'resubmitted-video' })
    getVideoStatus
      .mockResolvedValueOnce({
        id: 'image-fetch-failed',
        status: 'failed',
        error: { message: 'Failed to download the provided image (image_download_error=image_fetch_failed): could not reach the image host' },
      })
      .mockResolvedValueOnce({ id: 'resubmitted-video', status: 'completed' })

    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('图片中的人物朗读')

    vi.useFakeTimers()
    try {
      const generation = wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      expect(wrapper.get('.result-drawing-media').text()).toContain('上游读取参考图失败，3 秒后自动重试（1/2）')
      await vi.advanceTimersByTimeAsync(3000)
      await generation
      await flushPromises()

      expect(createVideo).toHaveBeenCalledTimes(2)
      expect(getVideoStatus.mock.calls.map(([, id]) => id)).toEqual(['image-fetch-failed', 'resubmitted-video'])
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed', requestId: 'resubmitted-video' }))
      expect(showSuccess).toHaveBeenCalledWith('作品生成完成')
      expect(showError).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
      createVideo.mockReset()
    }
  })

  it('keeps polling a submitted video task through transient status errors', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    createVideo.mockResolvedValueOnce({ id: 'polled-video' })
    getVideoStatus
      .mockResolvedValueOnce({ id: 'polled-video', status: 'processing' })
      .mockRejectedValueOnce(Object.assign(new Error('Upstream request failed'), { status: 502 }))
      .mockResolvedValueOnce({ id: 'polled-video', status: 'completed' })

    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('纸船漂过池塘')

    vi.useFakeTimers()
    try {
      const generation = wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(4000)
      await flushPromises()
      expect(wrapper.get('.result-drawing-media').text()).toContain('状态查询暂时失败，正在自动重试（1/4）')
      await vi.advanceTimersByTimeAsync(4000)
      await generation
      await flushPromises()
      expect(getVideoStatus).toHaveBeenCalledTimes(3)
      expect(createVideo).toHaveBeenCalledTimes(1)
      expect(showSuccess).toHaveBeenCalledWith('作品生成完成')
      expect(showError).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
      createVideo.mockReset()
      getVideoStatus.mockReset()
    }
  })

  it('names MiniMax H3 instead of Grok when video submission stays unavailable', async () => {
    const h3Group = { ...group, id: 7700, name: 'MiniMax', description: '', platform: 'minimax', video_model_prices: { 'minimax-h3': { 'xminimex-h3': 0.1 } } } as Group
    const h3Key = { ...createdKey, id: 30, key: 'sk-h3', group_id: h3Group.id, group: h3Group } as ApiKey
    listGroups.mockResolvedValue([group, h3Group])
    listKeys.mockResolvedValue({ items: [createdKey, h3Key], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'Xminimex-h3' }])
    createVideo.mockRejectedValue(Object.assign(new Error('Upstream request failed'), { status: 502 }))

    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.findAll('.mode-option')[1].trigger('click')
    await flushPromises()
    await wrapper.findAll('.video-capability-switch button')[2].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('纸船漂过池塘')

    vi.useFakeTimers()
    try {
      const generation = wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(7000)
      await generation
      await flushPromises()
      const message = showError.mock.calls.at(-1)?.[0] as string
      expect(message).toContain('MiniMax H3 视频上游暂时不可用')
      expect(message).not.toContain('Grok')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
      createVideo.mockReset()
    }
  })

  it('retries a broken video download and keeps the finished task reloadable instead of failed', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoContent.mockReset().mockRejectedValue(new TypeError('Failed to fetch'))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    vi.useFakeTimers()
    try {
      await flushPromises()
      await openGrokVideo(wrapper)
      await flushPromises()
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('晨光卧室')
      const generation = wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(12_000)
      await generation
      await flushPromises()

      expect(getVideoContent).toHaveBeenCalledTimes(3)
      expect(showError).not.toHaveBeenCalled()
      expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('不会重复扣费'))
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed', requestId: 'video-task-1' }))
      expect(wrapper.get('.result-error').text()).toContain('重新加载视频')

      getVideoContent.mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }))
      await wrapper.get('.status-check-command').trigger('click')
      await flushPromises()
      expect(wrapper.find('video').exists()).toBe(true)
      expect(createVideo).toHaveBeenCalledTimes(1)
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('reloads a video previously marked failed by a broken download', async () => {
    const work = {
      id: 'download-failed', type: 'video', status: 'failed', prompt: '情侣', error: 'Failed to fetch',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name, groupId: group.id,
      apiKeyId: createdKey.id, createdAt: 1000, updatedAt: 2000, outputs: [],
      aspectRatio: '16:9', resolution: '720p', requestId: 'video-task-1',
    }
    listHistory.mockResolvedValue([work])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoContent.mockReset().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }))
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.get('.history-item-hitbox').trigger('click')
      // Opening the work retries the dropped download on its own.
      await vi.advanceTimersByTimeAsync(1_500)
      await flushPromises()
      expect(getVideoContent).toHaveBeenCalledTimes(2)
      expect(wrapper.find('video').exists()).toBe(true)
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ id: work.id, status: 'completed', error: undefined }))
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('loads a finished video in place when its opening check was skipped by another running check', async () => {
    const base = {
      type: 'video', prompt: '冰块玻璃杯', model: 'grok-imagine-video', provider: 'Grok 视频',
      groupName: group.name, groupId: group.id, apiKeyId: createdKey.id, outputs: [],
      aspectRatio: '16:9', resolution: '720p',
    }
    const rendering = { ...base, id: 'still-rendering', status: 'pending', requestId: 'video-task-slow', createdAt: 2000, updatedAt: 2000 }
    const finished = { ...base, id: 'finished-elsewhere', status: 'completed', requestId: 'video-task-done', createdAt: 1000, updatedAt: 1000, completedAt: 1500 }
    listHistory.mockResolvedValue([rendering, finished])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    let releaseSlowStatus: (value: unknown) => void = () => undefined
    // Background tracking of the rendering work fails, and its follow-up check hangs.
    let slowCalls = 0
    getVideoStatus.mockReset().mockImplementation((_key: string, requestId: string) => requestId === 'video-task-slow'
      ? ++slowCalls === 1
        ? Promise.reject(new Error('status payload was temporarily unavailable'))
        : new Promise(resolve => { releaseSlowStatus = resolve })
      : Promise.resolve({ id: requestId, status: 'done' }))
    getVideoContent.mockReset().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.findAll('.history-item-hitbox')[0].trigger('click')
      await flushPromises()
      // The first work's status check is still in flight when the finished one is opened.
      await wrapper.findAll('.history-item-hitbox')[1].trigger('click')
      await flushPromises()
      expect(wrapper.get('.result-error').text()).toContain('正在加载视频')
      expect(getVideoContent).not.toHaveBeenCalled()

      releaseSlowStatus({ id: 'video-task-slow', status: 'in_progress', progress: 30 })
      await flushPromises()
      expect(getVideoContent).toHaveBeenCalledWith(createdKey.key, 'video-task-done')
      expect(wrapper.find('video').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps the finished video element when a history save broadcasts a stripped copy', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    let urlCount = 0
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:creator-video-${++urlCount}`)
    // Like the real store after an unsaved write: blob: outputs are not stored.
    let notify: ((work: unknown) => void) | undefined
    subscribeHistory.mockImplementation(listener => { notify = listener; return vi.fn() })
    putHistory.mockImplementation(async work => { notify?.({ ...work, outputs: [...work.outputs] }); return false })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await openGrokVideo(wrapper)
      await flushPromises()
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('晨光卧室')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      const firstVideo = wrapper.get('video')
      const src = firstVideo.attributes('src')
      Object.defineProperty(firstVideo.element, 'videoWidth', { value: 2560, configurable: true })
      Object.defineProperty(firstVideo.element, 'videoHeight', { value: 1440, configurable: true })
      await firstVideo.trigger('loadedmetadata')
      await flushPromises()

      expect(wrapper.get('video').attributes('src')).toBe(src)
      expect(wrapper.get('video').element).toBe(firstVideo.element)
      expect(urlCount).toBe(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps the finished shot players when a missing shot is regenerated in place and saves round-trip', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    let urlCount = 0
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:creator-video-${++urlCount}`)
    const stored = (blobs: Blob[]) => blobs.map(blob => new Blob([blob], { type: blob.type }))
    listHistory.mockResolvedValue([{
      id: 'retry-keeps-players', type: 'video', status: 'completed', prompt: '三个镜头',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name, groupId: group.id, apiKeyId: createdKey.id,
      createdAt: 1, updatedAt: 2, outputs: [],
      videoBlobs: [new Blob(['shot-1'], { type: 'video/mp4' }), new Blob(['shot-3!'], { type: 'video/mp4' })],
      mergedVideoBlob: new Blob(['merged-1-3'], { type: 'video/mp4' }),
      requestId: 'task-1,task-3', shotOutputIndexes: [0, 2], shotCount: 3, outputCount: 3,
      shotPrompts: ['镜头一', '镜头二', '镜头三'], shotDurations: [5, 5, 5],
      error: '已生成 2 / 3 段，其余 1 段生成失败（镜头 2）：上游生成失败',
    }])
    // Like IndexedDB: every save is read back with blob: outputs dropped and new Blob instances.
    let notify: ((work: unknown) => void) | undefined
    subscribeHistory.mockImplementation(listener => { notify = listener; return vi.fn() })
    putHistory.mockImplementation(async work => {
      notify?.({ ...work, outputs: work.outputs.filter((output: string) => !output.startsWith('blob:')), videoBlobs: stored(work.videoBlobs || []) })
      return true
    })
    createVideo.mockResolvedValueOnce({ id: 'task-2' })
    let finishVideo!: (result: unknown) => void
    getVideoStatus.mockImplementationOnce(() => new Promise(resolve => { finishVideo = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      const players = () => [0, 2].map(index => wrapper.get(`[data-result-index="${index}"] video`))
      const before = players().map(player => [player.element, player.attributes('src')])

      await wrapper.get('[data-result-index="1"] .result-shot-retry').trigger('click')
      await vi.waitFor(() => expect(getVideoStatus).toHaveBeenCalledTimes(1))
      await flushPromises()
      expect(players().map(player => [player.element, player.attributes('src')])).toEqual(before)

      finishVideo({ id: 'task-2', status: 'completed', url: '/v1/videos/task-2/content' })
      await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', shotOutputIndexes: [0, 1, 2] })))
      await flushPromises()
      expect(players().map(player => [player.element, player.attributes('src')])).toEqual(before)
      expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(0)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows the reported progress on a shot being regenerated in place', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    listHistory.mockResolvedValue([{
      id: 'retry-progress', type: 'video', status: 'completed', prompt: '两个镜头',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name, groupId: group.id, apiKeyId: createdKey.id,
      createdAt: 1, updatedAt: 2, outputs: ['blob:finished-shot-1'], videoBlobs: [new Blob(['shot-1'], { type: 'video/mp4' })],
      mergedOutput: undefined, requestId: 'task-1', shotOutputIndexes: [0], shotCount: 2, outputCount: 2,
      shotPrompts: ['镜头一', '镜头二'], shotDurations: [5, 5],
    }])
    createVideo.mockResolvedValueOnce({ id: 'task-2' })
    getVideoStatus.mockResolvedValue({ id: 'task-2', status: 'processing', progress: 45 })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    let savesBeforeUnmount = 0
    try {
      await flushPromises()
      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      await wrapper.get('[data-result-index="1"] .result-shot-retry').trigger('click')
      await vi.waitFor(() => expect(getVideoStatus).toHaveBeenCalledTimes(1))
      await flushPromises()

      expect(wrapper.get('[data-result-index="1"] .result-missing-media p').text()).toBe('生成中 45%')
      const bar = wrapper.get('[data-result-index="1"] .slot-progress')
      expect(bar.classes()).not.toContain('indeterminate')
      expect(bar.attributes('aria-valuenow')).toBe('45')
      expect(bar.get('i').attributes('style')).toContain('width: 45%')
    } finally {
      savesBeforeUnmount = putHistory.mock.calls.length
      wrapper.unmount()
    }
    // Unmounting ends the 4 s poll wait at once: no further status request, and
    // the unfinished shot is saved now rather than leaking into a later test.
    await vi.waitFor(() => expect(putHistory.mock.calls.slice(savesBeforeUnmount)
      .some(([saved]) => saved.id === 'retry-progress')).toBe(true), { timeout: 1000 })
    expect(getVideoStatus).toHaveBeenCalledTimes(1)
  })

  it('redraws finished shots while another shot is being regenerated and keeps the original of a failed redraw', async () => {
    const shot1 = new Blob(['shot-1'], { type: 'video/mp4' })
    const shot2 = new Blob(['shot-2'], { type: 'video/mp4' })
    const work = {
      id: 'redraw-shots', type: 'video', status: 'completed', prompt: '三个镜头',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name, groupId: group.id, apiKeyId: createdKey.id,
      createdAt: 1, updatedAt: 2, outputs: ['blob:shot-1', 'blob:shot-2'], videoBlobs: [shot1, shot2],
      mergedVideoBlob: new Blob(['merged'], { type: 'video/mp4' }),
      requestId: 'task-1,task-2', shotOutputIndexes: [0, 1], shotCount: 3, outputCount: 3,
      shotPrompts: ['镜头一', '镜头二', '镜头三'], shotDurations: [5, 5, 5],
      error: '已生成 2 / 3 段，其余 1 段生成失败（镜头 3）：上游生成失败',
    }
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    listHistory.mockResolvedValue([work])
    createVideo.mockResolvedValueOnce({ id: 'retry-3' }).mockResolvedValueOnce({ id: 'redraw-1' }).mockResolvedValueOnce({ id: 'redraw-2' })
    // Each task stays queued until the test finishes it.
    const finishers = new Map<string, (status: unknown) => void>()
    const statuses = new Map<string, Promise<unknown>>()
    getVideoStatus.mockImplementation((_key: string, id: string) => {
      if (!statuses.has(id)) statuses.set(id, new Promise(resolve => finishers.set(id, resolve)))
      return statuses.get(id)!
    })
    const contents: Record<string, Blob> = {
      'retry-3': new Blob(['new-shot-3'], { type: 'video/mp4' }),
      'redraw-1': new Blob(['new-shot-1'], { type: 'video/mp4' }),
    }
    getVideoContent.mockImplementation(async (_key: string, id: string) => contents[id])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    // The finished card offers redraw, sound, fullscreen and download; replay is gone.
    const titles = wrapper.get('[data-result-index="0"] .result-media-actions').findAll('button').map(button => button.attributes('title'))
    expect(titles[0]).toContain('重新生成')
    expect(titles).toContain('全屏播放')
    expect(titles).not.toContain('重新播放')
    expect(titles.at(-1)).toBe('下载作品')

    await wrapper.get('[data-result-index="2"] .result-shot-retry').trigger('click')
    await vi.waitFor(() => expect(getVideoStatus).toHaveBeenCalledWith(createdKey.key, 'retry-3'))
    await flushPromises()
    // Finished shots can still be redrawn while shot 3 is generating.
    const redraw1 = wrapper.get('[data-result-index="0"] .result-redraw-action')
    expect(redraw1.attributes('disabled')).toBeUndefined()
    await redraw1.trigger('click')
    await vi.waitFor(() => expect(getVideoStatus).toHaveBeenCalledWith(createdKey.key, 'redraw-1'))
    await flushPromises()
    await wrapper.get('[data-result-index="1"] .result-redraw-action').trigger('click')
    await vi.waitFor(() => expect(getVideoStatus).toHaveBeenCalledWith(createdKey.key, 'redraw-2'))
    await flushPromises()
    expect(createVideo.mock.calls.map(([, request]) => request.prompt)).toEqual(['镜头三', '镜头一', '镜头二'])
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    for (const index of [0, 1, 2]) {
      expect(wrapper.get(`[data-result-index="${index}"] .result-missing-media`).classes()).toContain('is-regenerating')
    }
    expect(wrapper.get('[data-result-index="0"] .result-missing-media p').text()).toBe('已提交，正在排队')

    // The failed redraw puts shot 2 back at once; the others keep running.
    finishers.get('redraw-2')!({ id: 'redraw-2', status: 'failed', error: '上游生成失败' })
    await flushPromises()
    expect(wrapper.find('[data-result-index="1"] .result-missing-media').exists()).toBe(false)
    expect(wrapper.find('[data-result-index="1"] .video-result-frame').exists()).toBe(true)
    expect(wrapper.get('[data-result-index="0"] .result-missing-media').classes()).toContain('is-regenerating')
    expect(showWarning).toHaveBeenCalledWith('镜头 2 重新生成失败，已保留原视频')

    finishers.get('retry-3')!({ id: 'retry-3', status: 'completed', url: '/v1/videos/retry-3/content' })
    finishers.get('redraw-1')!({ id: 'redraw-1', status: 'completed', url: '/v1/videos/redraw-1/content' })
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ id: work.id, status: 'completed', shotOutputIndexes: [0, 1, 2] })))
    await flushPromises()

    const saved = putHistory.mock.calls.map(([item]) => item).at(-1)
    expect(saved).toMatchObject({ id: work.id, status: 'completed', shotOutputIndexes: [0, 1, 2], requestId: 'redraw-1,task-2,retry-3' })
    expect(saved.error).toBeUndefined()
    expect(putHistory.mock.calls.every(([item]) => item.id === work.id)).toBe(true)
    // The complete video is stitched again from the new shot 1, the kept shot 2 and the new shot 3.
    const stitched = composeVideoSegments.mock.calls.at(-1)![0]
    expect(stitched).toHaveLength(3)
    expect(stitched[0]).toBe(contents['redraw-1'])
    expect(stitched[2]).toBe(contents['retry-3'])
    expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(0)
    expect(wrapper.findAll('.history-item')).toHaveLength(1)
    expect(showSuccess).not.toHaveBeenCalledWith('作品生成完成')
  })

  it('redraws a finished shot of an idle work in place and keeps the original when it fails', async () => {
    const shot1 = new Blob(['shot-1'], { type: 'video/mp4' })
    const shot2 = new Blob(['shot-2'], { type: 'video/mp4' })
    const work = {
      id: 'redraw-idle-shot', type: 'video', status: 'completed', prompt: '两个镜头',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name, groupId: group.id, apiKeyId: createdKey.id,
      createdAt: 1, updatedAt: 2, outputs: ['blob:shot-1', 'blob:shot-2'], videoBlobs: [shot1, shot2],
      mergedVideoBlob: new Blob(['merged'], { type: 'video/mp4' }),
      requestId: 'task-1,task-2', shotOutputIndexes: [0, 1], shotCount: 2, outputCount: 2,
      shotPrompts: ['镜头一', '镜头二'], shotDurations: [5, 5],
    }
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    listHistory.mockResolvedValue([work])
    createVideo.mockResolvedValueOnce({ id: 'redraw-2' })
    let finish: (status: unknown) => void = () => undefined
    getVideoStatus.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    const keptPlayer = wrapper.get('[data-result-index="0"] .video-result-frame').element

    await wrapper.get('[data-result-index="1"] .result-redraw-action').trigger('click')
    await vi.waitFor(() => expect(getVideoStatus).toHaveBeenCalledTimes(1))
    await flushPromises()
    expect(createVideo.mock.calls[0][1].prompt).toBe('镜头二')
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    expect(wrapper.get('[data-result-index="1"] .result-missing-media').classes()).toContain('is-regenerating')
    expect(wrapper.get('[data-result-index="0"] .video-result-frame').element).toBe(keptPlayer)

    composeVideoSegments.mockClear()
    finish({ id: 'redraw-2', status: 'failed', error: '上游生成失败' })
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ id: work.id, status: 'completed' })))
    await flushPromises()
    const saved = putHistory.mock.calls.map(([item]) => item).at(-1)
    expect(saved).toMatchObject({ status: 'completed', shotOutputIndexes: [0, 1], requestId: 'task-1,task-2' })
    expect(saved.error).toBeUndefined()
    expect(saved.videoBlobs[1]).toBe(shot2)
    // Nothing changed, so the complete video is not stitched again.
    expect(composeVideoSegments).not.toHaveBeenCalled()
    expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(0)
    expect(wrapper.get('[data-result-index="0"] .video-result-frame').element).toBe(keptPlayer)
    expect(showWarning).toHaveBeenCalledWith('镜头 2 重新生成失败，已保留原视频')
    expect(showSuccess).not.toHaveBeenCalledWith('作品生成完成')
  })

  it('redraws a finished single video inside its own card instead of a separate placeholder', async () => {
    const original = new Blob(['single-original'], { type: 'video/mp4' })
    const work = {
      id: 'redraw-single-video', type: 'video', status: 'completed', prompt: '深灰石台上立着一只机械腕表',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name, groupId: group.id, apiKeyId: createdKey.id,
      createdAt: 1, updatedAt: 2, outputs: ['blob:single-original'], videoBlobs: [original],
      requestId: 'single-task-1', outputCount: 1, requestedDuration: 10, aspectRatio: '16:9', resolution: '720p',
    }
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: work.model }])
    listHistory.mockResolvedValue([work])
    createVideo.mockResolvedValueOnce({ id: 'single-task-2' })
    let finish: (status: unknown) => void = () => undefined
    getVideoStatus.mockImplementationOnce(() => Promise.resolve({ id: 'single-task-2', status: 'processing', progress: 30 }))
      .mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    vi.useFakeTimers()
    try {
      await wrapper.get('[data-result-index="0"] .result-redraw-action').trigger('click')
      await vi.waitFor(() => expect(getVideoStatus).toHaveBeenCalledTimes(1))
      await flushPromises()
      expect(createVideo.mock.calls[0][1].prompt).toBe(work.prompt)
      // The card stays where the video was and shows the progress in its own frame.
      expect(wrapper.find('.result-error').exists()).toBe(false)
      expect(wrapper.find('.partial-result-notice').exists()).toBe(false)
      expect(wrapper.findAll('.result-grid .result-card')).toHaveLength(1)
      const slot = wrapper.get('[data-result-index="0"] .result-missing-media')
      expect(slot.classes()).toContain('is-regenerating')
      expect(slot.attributes('style')).toContain('aspect-ratio: 16 / 9')
      expect(slot.get('p').text()).toBe('生成中 30%')
      expect(wrapper.get('[data-result-index="0"] .result-description').text()).toContain(work.prompt)
      expect(wrapper.get('.result-heading h2').text()).toBe('正在生成')
      expect(wrapper.get('.result-heading .result-count-pill').text()).toBe('0 / 1 段')

      await vi.advanceTimersByTimeAsync(4000)
      finish({ id: 'single-task-2', status: 'completed' })
      await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ id: work.id, status: 'completed', requestId: 'single-task-2' })))
      await flushPromises()
      expect(wrapper.find('.result-missing-media').exists()).toBe(false)
      expect(wrapper.get<HTMLVideoElement>('[data-result-index="0"] .result-media.video').attributes('src')).toBe('blob:creator-video')
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays a finished shot in fullscreen from its card', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    listHistory.mockResolvedValue([{
      id: 'fullscreen-shots', type: 'video', status: 'completed', prompt: '两个镜头',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name, groupId: group.id, apiKeyId: createdKey.id,
      createdAt: 1, updatedAt: 2, outputs: ['blob:shot-1', 'blob:shot-2'],
      videoBlobs: [new Blob(['shot-1'], { type: 'video/mp4' }), new Blob(['shot-2'], { type: 'video/mp4' })],
      mergedVideoBlob: new Blob(['merged'], { type: 'video/mp4' }),
      requestId: 'task-1,task-2', shotOutputIndexes: [0, 1], shotCount: 2, outputCount: 2,
      shotPrompts: ['镜头一', '镜头二'], shotDurations: [5, 5],
    }])
    const requestFullscreen = vi.fn(async function (this: HTMLElement) { return undefined })
    const original = HTMLElement.prototype.requestFullscreen
    HTMLElement.prototype.requestFullscreen = requestFullscreen as unknown as typeof original
    onTestFinished(() => { HTMLElement.prototype.requestFullscreen = original })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    await wrapper.get('[data-result-index="1"] .result-fullscreen-action').trigger('click')
    await flushPromises()
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
    const frame = requestFullscreen.mock.contexts[0] as unknown as HTMLElement
    expect(wrapper.get('[data-result-index="1"]').element.contains(frame)).toBe(true)
  })

  it('keeps the selected video element when returning to the tab re-reads history', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    let urlCount = 0
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:creator-video-${++urlCount}`)
    // IndexedDB hands back a new Blob instance with the same bytes on every read.
    const storedWork = () => ({
      id: 'video-refocus', type: 'video', status: 'completed', prompt: '晨光卧室',
      model: 'grok-imagine-video', provider: 'Grok 视频', groupName: group.name, groupId: group.id,
      apiKeyId: createdKey.id, createdAt: 1000, updatedAt: 2000, completedAt: 2000,
      outputs: [], videoBlobs: [new Blob(['same video'], { type: 'video/mp4' })],
      outputCount: 1, aspectRatio: '16:9', resolution: '720p', requestId: 'refocus-task',
    })
    listHistory.mockImplementation(async () => [storedWork()])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      const firstVideo = wrapper.get('video')

      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()

      expect(wrapper.get('video').element).toBe(firstVideo.element)
      expect(urlCount).toBe(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('submits every text-only professional shot with the text-to-video model', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'grok-imagine-video-1.5' },
      { id: 'grok-imagine-video' },
    ])
    createVideo
      .mockResolvedValueOnce({ id: 'video-shot-1' })
      .mockRejectedValueOnce(new Error('stop after checking the second request'))
    getVideoStatus.mockResolvedValueOnce({ id: 'video-shot-1', status: 'completed' })

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLInputElement>('.toggle-row input').setValue(true)
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第一个镜头')
    await wrapper.get('.sequence-add').trigger('click')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第二个镜头')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(createVideo).toHaveBeenCalledTimes(2)
    expect(createVideo.mock.calls.map(([, request]) => request.model)).toEqual([
      'grok-imagine-video',
      'grok-imagine-video',
    ])
    expect(createVideo.mock.calls.map(([, request]) => request.prompt)).toEqual([
      '第一个镜头',
      '第二个镜头',
    ])
  })

  it('moves a prompt written before opening the shot editor into the first shot', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('手表镜头缓慢推进')
    await wrapper.get<HTMLInputElement>('.toggle-row input').setValue(true)

    expect(wrapper.get('.sequence-shot-prompt').text()).toBe('手表镜头缓慢推进')
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('手表镜头缓慢推进')
    wrapper.unmount()
  })

  it('keeps finished professional shots when another shot fails', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    createVideo
      .mockResolvedValueOnce({ id: 'video-shot-1' })
      .mockRejectedValueOnce(Object.assign(new Error('Invalid URL (POST /v1/videos/generations)'), { status: 400 }))
      .mockResolvedValueOnce({ id: 'video-shot-3' })
    getVideoStatus.mockImplementation(async (_key: string, id: string) => ({ id, status: 'completed' }))

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    try {
      await flushPromises()
      await openGrokVideo(wrapper)
      await flushPromises()
      await wrapper.get<HTMLInputElement>('.toggle-row input').setValue(true)
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第一个镜头')
      await wrapper.get('.sequence-add').trigger('click')
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第二个镜头')
      await wrapper.get('.sequence-add').trigger('click')
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第三个镜头')
      await wrapper.get('.generate-button').trigger('click')
      // Under a loaded test run the shots, downloads and stitching need more than one flush.
      await vi.waitFor(() => expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('已生成 2 / 3 段')))
      await flushPromises()

      expect(createVideo).toHaveBeenCalledTimes(3)
      expect(showError).not.toHaveBeenCalled()
      expect(composeVideoSegments).toHaveBeenCalledTimes(1)
      expect(composeVideoSegments.mock.calls[0][0]).toHaveLength(2)
      expect(wrapper.find('.result-error').exists()).toBe(false)
      expect(wrapper.get('.partial-result-notice').text()).toContain('镜头 2')
      expect(wrapper.get('.partial-result-notice p').text()).toContain('Invalid URL')
      expect(wrapper.findAll('.result-segment-grid .result-description strong').map(item => item.text())).toEqual(['Grok 视频 · 镜头 1', 'Grok 视频 · 镜头 2', 'Grok 视频 · 镜头 3'])
      expect(wrapper.findAll('.result-segment-grid .result-description p').map(item => item.text())).toEqual(['第一个镜头', '第二个镜头', '第三个镜头'])
      expect(wrapper.find('.result-card.is-missing .result-missing-prompt').exists()).toBe(false)
      const saved = putHistory.mock.calls.at(-1)?.[0]
      expect(saved).toMatchObject({ status: 'completed', requestId: 'video-shot-1,video-shot-3', shotOutputIndexes: [0, 2] })
      const completedDuration = saved.shotDurations[0] + saved.shotDurations[2]
      expect(wrapper.get('.complete-video-card footer .result-tags').text()).toContain(`总时长 ${completedDuration} 秒`)
      expect(wrapper.get('.complete-video-card footer .result-tags').text()).not.toContain(`总时长 ${saved.requestedDuration} 秒`)
    } finally {
      wrapper.unmount()
      createVideo.mockReset()
      getVideoStatus.mockReset()
    }
  })

  it('submits every professional shot at once and stitches them in shot order', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    createVideo
      .mockResolvedValueOnce({ id: 'parallel-shot-1' })
      .mockResolvedValueOnce({ id: 'parallel-shot-2' })
    // Shot 2 finishes first; shot 1 is still rendering on its first poll.
    const shot1Status = vi.fn()
      .mockResolvedValueOnce({ id: 'parallel-shot-1', status: 'processing' })
      .mockResolvedValue({ id: 'parallel-shot-1', status: 'completed' })
    getVideoStatus.mockImplementation(async (_key: string, id: string) => id === 'parallel-shot-1'
      ? shot1Status()
      : { id, status: 'completed' })
    const shotBlobs: Record<string, Blob> = {
      'parallel-shot-1': new Blob(['shot-one'], { type: 'video/mp4' }),
      'parallel-shot-2': new Blob(['shot-two'], { type: 'video/mp4' }),
    }
    getVideoContent.mockImplementation(async (_key: string, id: string) => shotBlobs[id])

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    vi.useFakeTimers()
    try {
      await flushPromises()
      await openGrokVideo(wrapper)
      await flushPromises()
      await wrapper.get<HTMLInputElement>('.toggle-row input').setValue(true)
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第一个镜头')
      await wrapper.get('.sequence-add').trigger('click')
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第二个镜头')
      void wrapper.get('.generate-button').trigger('click')
      await flushPromises()

      // Both shots were submitted before either finished.
      expect(createVideo).toHaveBeenCalledTimes(2)
      // Each shot draws into its own card; the finished shot 2 already plays while shot 1 renders.
      expect(wrapper.get('.result-heading-progress').text()).toBe('正在生成')
      expect(wrapper.get('.result-heading-pills').text()).toContain('1 / 2 段')
      const shotCards = wrapper.findAll('.result-card')
      expect(shotCards).toHaveLength(2)
      expect(shotCards[0].classes()).toContain('is-drawing')
      expect(shotCards[1].find('.creator-video-player').exists()).toBe(true)
      // The finished shot 2 is already saved while shot 1 still renders.
      const partial = putHistory.mock.calls.at(-1)?.[0]
      expect(partial).toMatchObject({ status: 'pending', shotOutputIndexes: [1, 0] })
      expect(partial.videoBlobs).toEqual([shotBlobs['parallel-shot-2']])

      await vi.advanceTimersByTimeAsync(4000)
      await flushPromises()

      expect(composeVideoSegments).toHaveBeenCalledTimes(1)
      expect(composeVideoSegments.mock.calls[0][0]).toEqual([shotBlobs['parallel-shot-1'], shotBlobs['parallel-shot-2']])
      const saved = putHistory.mock.calls.at(-1)?.[0]
      expect(saved).toMatchObject({
        status: 'completed',
        requestId: 'parallel-shot-1,parallel-shot-2',
        shotOutputIndexes: [0, 1],
        shotQueue: undefined,
      })
      expect(showSuccess).toHaveBeenCalledWith('作品生成完成')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
      createVideo.mockReset()
      getVideoStatus.mockReset()
      getVideoContent.mockReset().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }))
    }
  })

  it('updates the history count as soon as a finished shot is on screen, before it is stored', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    createVideo
      .mockResolvedValueOnce({ id: 'stored-shot-1' })
      .mockResolvedValueOnce({ id: 'stored-shot-2' })
    getVideoStatus.mockImplementation(async (_key: string, id: string) => id === 'stored-shot-1'
      ? { id, status: 'processing' }
      : { id, status: 'completed' })
    getVideoContent.mockResolvedValue(new Blob(['shot-two'], { type: 'video/mp4' }))
    // Storing the finished shot in IndexedDB is slow; it never finishes here.
    putHistory.mockImplementation(async work => work.videoBlobs?.length ? new Promise(() => {}) : true)
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    vi.useFakeTimers()
    try {
      await flushPromises()
      await openGrokVideo(wrapper)
      await flushPromises()
      await wrapper.get<HTMLInputElement>('.toggle-row input').setValue(true)
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第一个镜头')
      await wrapper.get('.sequence-add').trigger('click')
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第二个镜头')
      void wrapper.get('.generate-button').trigger('click')
      await flushPromises()

      expect(wrapper.get('.result-heading-pills').text()).toContain('1 / 2 段')
      expect(wrapper.text()).toContain('正在同时生成 2 个镜头（已完成 1 个）')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
      createVideo.mockReset()
      getVideoStatus.mockReset()
      getVideoContent.mockReset().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }))
      putHistory.mockReset().mockResolvedValue(true)
    }
  })

  it('keeps references and video parameters independent for every professional shot', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'grok-imagine-video' },
      { id: 'grok-imagine-video-1.5' },
    ])
    createVideo
      .mockResolvedValueOnce({ id: 'independent-shot-1' })
      .mockRejectedValueOnce(new Error('stop after checking independent requests'))
    getVideoStatus.mockResolvedValueOnce({ id: 'independent-shot-1', status: 'completed' })
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLInputElement>('.toggle-row input').setValue(true)

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('grok-imagine-video-1.5')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第一个图生镜头')
    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('image')
    await setVideoParams(wrapper, { ratio: '9:16' })
    const firstSource = new File(['first-source'], 'first-source.png', { type: 'image/png' })
    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [firstSource] })
    await input.trigger('change')
    await flushPromises()

    await wrapper.get('.sequence-add').trigger('click')
    expect(wrapper.findAll('.sequence-shot')).toHaveLength(2)
    expect(wrapper.findAll('.reference-item')).toHaveLength(0)
    expect(wrapper.findAll('.sequence-shot')[0].text()).toContain('1 张参考图')

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第二个参考图镜头')
    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('reference')
    await flushPromises()
    await setVideoParams(wrapper, { ratio: '16:9' })
    await setVideoParams(wrapper, { resolution: '1080p' })
    const secondReferences = [
      new File(['second-a'], 'second-a.png', { type: 'image/png' }),
      new File(['second-b'], 'second-b.png', { type: 'image/png' }),
    ]
    Object.defineProperty(input.element, 'files', { configurable: true, value: secondReferences })
    await input.trigger('change')
    await flushPromises()

    await wrapper.findAll('.sequence-shot')[0].trigger('click')
    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('image')
    expect(wrapper.get('#video-params').attributes('data-ratio')).toBe('9:16')
    expect(wrapper.get('#video-params').attributes('data-resolution')).toBe('720p')
    expect(wrapper.findAll('.reference-item')).toHaveLength(1)

    await wrapper.findAll('.sequence-shot')[1].trigger('click')
    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('reference')
    expect(wrapper.get('#video-params').attributes('data-ratio')).toBe('16:9')
    expect(wrapper.get('#video-params').attributes('data-resolution')).toBe('1080p')
    expect(wrapper.findAll('.reference-item')).toHaveLength(2)
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video-1.5')

    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(2))

    expect(createVideo.mock.calls[0][1]).toMatchObject({
      model: 'grok-imagine-video-1.5',
      prompt: '第一个图生镜头',
      aspectRatio: '9:16',
      resolution: '720p',
      imageDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      referenceImageDataUrls: undefined,
    })
    expect(createVideo.mock.calls[1][1]).toMatchObject({
      model: 'grok-imagine-video-1.5',
      prompt: '第二个参考图镜头',
      aspectRatio: '16:9',
      resolution: '1080p',
      imageDataUrl: undefined,
      referenceImageDataUrls: [
        expect.stringMatching(/^data:image\/png;base64,/),
        expect.stringMatching(/^data:image\/png;base64,/),
      ],
    })
    expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
      shotAspectRatios: ['9:16', '16:9'],
      shotResolutions: ['720p', '1080p'],
      shotGenerationMethods: ['image', 'reference'],
      shotReferenceCounts: [1, 2],
    }))
    wrapper.unmount()
  })

  it('keeps a 1:1 image request at 1024x1024 and lets the result follow its intrinsic height', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('正方形森林肖像')
    await wrapper.get('#creator-output-size').trigger('click')
    await wrapper.findAll('.image-ratio-grid button')[0].trigger('click')
    await wrapper.get('.image-size-confirm').trigger('click')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      aspectRatio: '1:1',
      size: '1024x1024',
      responseFormat: 'b64_json',
    }))
    expect(wrapper.get<HTMLElement>('.result-media').attributes('style')).toContain('aspect-ratio: 1 / 1')
    expect(wrapper.get('.result-media').classes()).toContain('fitted')
    expect(wrapper.get('.result-media img').exists()).toBe(true)
    expect(wrapper.get('.result-parameters').text()).toContain('完成耗时')
    expect(wrapper.get('.result-parameters').text()).toContain('参考图')
    expect(wrapper.get('.result-parameters').text()).toContain('Grok 生图')
  })

  it('uses the selected landscape ratio to fill the result media height', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('宽屏海底晚宴')
    await wrapper.get('#creator-output-size').trigger('click')
    await wrapper.findAll('.image-ratio-grid button')[1].trigger('click')
    await wrapper.get('.image-size-confirm').trigger('click')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    const media = wrapper.get<HTMLElement>('.result-media')
    expect(media.classes()).toContain('landscape')
    expect(media.attributes('style')).toContain('aspect-ratio: 3 / 2')
  })

  it('uses automatic output size by default for an Image2 request', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-1' }, { id: 'gpt-image-1.5' }, { id: 'gpt-image-2' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await flushPromises()
    const modelSelect = wrapper.get<HTMLSelectElement>('#creator-model')
    expect(modelSelect.element.value).toBe('gpt-image-2')
    expect(modelSelect.findAll('option').map(option => option.attributes('value'))).not.toContain('gpt-image-2-4k')
    expect(wrapper.find('#creator-aspect').exists()).toBe(false)
    expect(wrapper.find('#creator-resolution').exists()).toBe(false)
    expect(wrapper.get('#creator-output-size').text()).toContain('自动')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('正方形产品照片')
    expect(wrapper.text()).not.toContain('透明背景')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledWith(image2Key.key, expect.objectContaining({
      model: 'gpt-image-2',
      size: 'auto',
      protocol: 'openai',
      background: 'auto',
    }))
    const request = generateImage.mock.calls.at(-1)?.[1]
    expect(request).not.toHaveProperty('aspectRatio')
    expect(request).not.toHaveProperty('imageSize')
    expect(request).not.toHaveProperty('responseFormat')
  })

  it('selects Image2 ratio sizes in a modal and uses the standard model for 4K', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }, { id: 'adobe-firefly-gpt-image-2-4k' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('宽屏未来城市')

    await wrapper.get('#creator-output-size').trigger('click')
    let dialog = wrapper.getComponent(BaseDialog)
    await dialog.findAll('.image-size-mode-tabs button').find(button => button.text() === '按比例')!.trigger('click')
    expect(dialog.props('appearance')).toBe('soft')
    expect(dialog.get('.modal-overlay').classes()).toContain('modal-overlay--soft')
    expect(dialog.get('.modal-content').classes()).toContain('modal-content--soft')
    expect(dialog.get('.image-size-confirm').text()).toBe('确定')
    expect(wrapper.get('.image-quality-field').classes()).toContain('wide')
    expect(wrapper.get('.image-quality-field').text()).toContain('画面质量')
    expect(dialog.text()).toContain('自动')
    expect(dialog.text()).toContain('按比例')
    expect(dialog.text()).toContain('自定义宽高')
    expect(dialog.findAll('.image-ratio-grid button').map(button => button.text())).toEqual([
      '1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '21:9',
    ])
    await dialog.findAll('.image-ratio-grid button')[1].trigger('click')
    await dialog.get('.image-size-confirm').trigger('click')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(generateImage.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ size: '1024x688' }))

    await wrapper.get('#creator-output-size').trigger('click')
    dialog = wrapper.getComponent(BaseDialog)
    await dialog.findAll('.image-resolution-grid button')[1].trigger('click')
    await dialog.findAll('.image-ratio-grid button')[3].trigger('click')
    await dialog.get('.image-size-confirm').trigger('click')
    expect(wrapper.get('#creator-output-size').text()).toContain('2K · 2048×1152')
    await wrapper.get('.field-block .stepper button:last-child').trigger('click')
    await wrapper.get('.field-block .stepper button:last-child').trigger('click')
    expect(wrapper.get('.field-block .stepper').text()).toContain('3 张')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(generateImage.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ size: '2048x1152' }))

    await wrapper.get('#creator-output-size').trigger('click')
    dialog = wrapper.getComponent(BaseDialog)
    await dialog.findAll('.image-resolution-grid button')[2].trigger('click')
    await dialog.get('.image-size-confirm').trigger('click')
    await flushPromises()
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('gpt-image-2')
    expect(wrapper.get('#creator-output-size').text()).toContain('4K · 3840×2160')
    expect(wrapper.get('.field-block .stepper').text()).toContain('3 张')
    expect(wrapper.get('.field-block .stepper button:last-child').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('4K 使用 gpt-image-2 逐张提交')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(generateImage.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({
      model: 'gpt-image-2',
      size: '3840x2160',
      n: 1,
    }))

    await wrapper.get('#creator-output-size').trigger('click')
    dialog = wrapper.getComponent(BaseDialog)
    await dialog.findAll('.image-ratio-grid button')[4].trigger('click')
    await dialog.get('.image-size-confirm').trigger('click')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(generateImage.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({
      model: 'gpt-image-2',
      size: '2160x3840',
    }))

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('gpt-image-2')
    await flushPromises()
    expect(wrapper.get('#creator-output-size').text()).toContain('4K')
  })

  it('supports Image2 automatic and normalized custom size modes', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }, { id: 'gpt-image-2-4k' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('自定义尺寸产品图')
    await wrapper.get('#creator-output-size').trigger('click')
    let dialog = wrapper.getComponent(BaseDialog)
    await dialog.findAll('.image-size-mode-tabs button')[0].trigger('click')
    await dialog.get('.image-size-confirm').trigger('click')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('gpt-image-2')
    expect(generateImage.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ model: 'gpt-image-2', size: 'auto' }))

    await wrapper.get('#creator-output-size').trigger('click')
    dialog = wrapper.getComponent(BaseDialog)
    await dialog.findAll('.image-size-mode-tabs button')[2].trigger('click')
    const inputs = dialog.findAll<HTMLInputElement>('.image-custom-size input')
    await inputs[0].setValue('1919')
    await inputs[1].setValue('1079')
    await dialog.get('.image-size-confirm').trigger('click')
    expect(wrapper.get('#creator-output-size').text()).toContain('1920×1072')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(generateImage.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ size: '1920x1072' }))
  })

  it('generates multiple Image2 outputs as separate single-image requests', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('宽屏未来城市')
    await wrapper.get('#creator-output-size').trigger('click')
    const dialog = wrapper.getComponent(BaseDialog)
    await dialog.findAll('.image-size-mode-tabs button').find(button => button.text() === '按比例')!.trigger('click')
    await dialog.findAll('.image-resolution-grid button')[1].trigger('click')
    await dialog.findAll('.image-ratio-grid button')[3].trigger('click')
    await dialog.get('.image-size-confirm').trigger('click')
    await wrapper.get('.field-block .stepper button:last-child').trigger('click')
    expect(wrapper.get('.field-block .stepper').text()).toContain('2 张')

    generateImage.mockClear()
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledTimes(2)
    expect(generateImage.mock.calls.map(([, request]) => request.n)).toEqual([1, 1])
    expect(generateImage.mock.calls.map(([, request]) => request.size)).toEqual(['2048x1152', '2048x1152'])
    expect(wrapper.findAll('.result-card')).toHaveLength(2)
    expect(showError).not.toHaveBeenCalled()
  })

  it('explains incompatible image accounts instead of exposing the upstream message', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockRejectedValueOnce(new Error('No available compatible accounts'))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('测试兼容账号提示')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('当前创作分组没有可用的兼容图片账号')
    expect(wrapper.text()).not.toContain('No available compatible accounts')
  })

  it.each([
    ['image2', 'gpt-image-2', 'Service temporarily unavailable', 503, '当前创作分组暂无可用的 GPT Image 账号'],
    ['banner', 'gemini-3.1-flash-image', 'No available accounts', 503, '当前创作分组暂无可用的 Gemini（Banana） 账号'],
    ['image2', 'gpt-image-2', 'Upstream service temporarily unavailable', 502, 'GPT Image 上游暂时不可用，请稍后重试。'],
    ['banner', 'gemini-3.1-flash-image', 'Upstream service temporarily unavailable', 502, 'Gemini（Banana） 上游暂时不可用，请稍后重试。'],
  ] as const)('names the %s provider instead of Grok for upstream failures (%#)', async (capability, model, upstreamMessage, status, expected) => {
    const isImage2 = capability === 'image2'
    listGroups.mockResolvedValue([isImage2 ? image2Group : bananaGroup])
    listKeys.mockResolvedValue({ items: [isImage2 ? image2Key : bananaKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: model }])
    generateImage.mockRejectedValue(Object.assign(new Error(upstreamMessage), { status }))
    vi.useFakeTimers()
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()

      await wrapper.findAll('.capability-switch button')[isImage2 ? 0 : 2].trigger('click')
      await flushPromises()
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('上游错误提示')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()

      // The only model of the group is retried once before the failure is shown.
      expect(generateImage).toHaveBeenCalledTimes(2)
      expect(showError).toHaveBeenCalledWith(expect.stringContaining(expected))
      expect(wrapper.text()).toContain(expected)
      expect(wrapper.text()).not.toContain('Grok 上游服务暂时不可用')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('explains a fixed 4K account mapping mismatch without exposing the upstream message', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockRejectedValueOnce(new Error('model adobe-firefly-gpt-image-2-4k is a fixed 4K SKU, but size requests 2K'))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('测试固定 4K 映射提示')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('当前创作分组把请求路由到了固定 4K 图片模型')
    expect(wrapper.text()).not.toContain('adobe-firefly-gpt-image-2-4k')
  })

  it('does not mislabel a standard Image2 n=1 error as a 4K restriction', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockRejectedValueOnce(new Error('model gpt-image-2 only supports n=1'))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('测试单图限制提示')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('当前图片模型每次请求只能生成 1 张图片')
    expect(wrapper.text()).not.toContain('当前 4K 图片模型每次只能生成 1 张图片')
  })

  it('retries a temporary Grok upstream failure once and completes the work', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    const temporaryError = Object.assign(new Error('Upstream service temporarily unavailable'), { status: 502 })
    generateImage
      .mockRejectedValueOnce(temporaryError)
      .mockResolvedValueOnce({ data: [{ url: 'data:image/png;base64,UkVUUlk=' }] })
    vi.useFakeTimers()
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('高质量方形产品图')
    const generation = wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.result-workspace.is-generating').text()).toContain('正在调用图片模型')
    expect(wrapper.get('.result-workspace.is-generating').text()).not.toMatch(/自动重试|正在重试|重新调用/)
    await vi.advanceTimersByTimeAsync(2000)
    await generation
    await flushPromises()

    expect(generateImage).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.result-card')).toHaveLength(1)
    expect(showSuccess).toHaveBeenCalledWith('作品生成完成')
    expect(showError).not.toHaveBeenCalled()
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('retries the current model when it returned no usable image', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ url: 'data:image/png;base64,RU1QVFk=' }] })
    vi.useFakeTimers()
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.capability-switch button')[0].trigger('click')
      await flushPromises()
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('空结果重试')
      const generation = wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      expect(wrapper.get('.result-workspace.is-generating').text()).toContain('正在调用图片模型')
      expect(wrapper.get('.result-workspace.is-generating').text()).not.toMatch(/自动重试|正在重试|重新调用/)
      await vi.advanceTimersByTimeAsync(2000)
      await generation
      await flushPromises()

      expect(generateImage).toHaveBeenCalledTimes(2)
      expect(generateImage.mock.calls.map(([, request]) => request.model)).toEqual(['gpt-image-2', 'gpt-image-2'])
      expect(showSuccess).toHaveBeenCalledWith('作品生成完成')
      expect(showError).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('explains an image that stays empty after the automatic retry', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockResolvedValue({ data: [] })
    vi.useFakeTimers()
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.capability-switch button')[0].trigger('click')
      await flushPromises()
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('一直空结果')
      const generation = wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(2000)
      await generation
      await flushPromises()

      expect(generateImage).toHaveBeenCalledTimes(2)
      expect(showError).toHaveBeenCalledWith(expect.stringContaining('模型没有返回可用图片，已自动重试仍未成功'))
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }))
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('falls back to another model of the group after the selected model fails twice', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-image' }, { id: 'grok-imagine-image-quality' }])
    const temporaryError = Object.assign(new Error('Upstream service temporarily unavailable'), { status: 502 })
    generateImage
      .mockRejectedValueOnce(temporaryError)
      .mockRejectedValueOnce(temporaryError)
      .mockResolvedValueOnce({ data: [{ url: 'data:image/png;base64,RkFMTEJBQ0s=' }] })
    vi.useFakeTimers()
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.capability-switch button')[1].trigger('click')
      await flushPromises()
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('切换模型重试')
      const generation = wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      expect(wrapper.get('.result-workspace.is-generating').text()).toContain('正在调用图片模型')
      expect(wrapper.get('.result-workspace.is-generating').text()).not.toMatch(/自动切换|正在重试|重新调用/)
      await vi.advanceTimersByTimeAsync(2000)
      await generation
      await flushPromises()

      const models = generateImage.mock.calls.map(([, request]) => request.model)
      expect(models).toHaveLength(3)
      expect(models[1]).toBe(models[0])
      expect(models[2]).not.toBe(models[0])
      expect(['grok-imagine-image', 'grok-imagine-image-quality']).toContain(models[2])
      const saved = putHistory.mock.calls.at(-1)?.[0]
      expect(saved).toMatchObject({ status: 'completed', model: models[0], fallbackModels: [models[2]] })
      expect(wrapper.text()).toContain(`已自动切换 ${models[2]}`)
      expect(showSuccess).toHaveBeenCalledWith('作品生成完成')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('tries every other model of the group once before giving up', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    const groupModels = ['grok-imagine-image', 'grok-imagine-image-quality', 'grok-imagine-image-fast']
    listModels.mockResolvedValue(groupModels.map(id => ({ id })))
    generateImage.mockRejectedValue(Object.assign(new Error('Upstream service temporarily unavailable'), { status: 502 }))
    vi.useFakeTimers()
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.capability-switch button')[1].trigger('click')
      await flushPromises()
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('所有模型都失败')
      const generation = wrapper.get('.generate-button').trigger('click')
      for (let step = 0; step < 4; step++) {
        await flushPromises()
        await vi.advanceTimersByTimeAsync(2000)
      }
      await generation
      await flushPromises()

      const models = generateImage.mock.calls.map(([, request]) => request.model)
      expect(models).toHaveLength(groupModels.length + 1)
      expect(models[1]).toBe(models[0])
      expect([...models.slice(1)].sort()).toEqual([...groupModels].sort())
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }))
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('submits a new image task after a server task failed without an image', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    submitImageTask
      .mockResolvedValueOnce({ id: 'timed-out-task' })
      .mockResolvedValueOnce({ id: 'second-task' })
    getImageTask
      .mockResolvedValueOnce({ status: 'failed', error: Object.assign(new Error('image generation task was interrupted or timed out; no image was returned'), { status: 504 }) })
      .mockResolvedValueOnce({ status: 'completed', result: { data: [{ url: 'data:image/png;base64,VEFTSw==' }] } })
    vi.useFakeTimers()
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.capability-switch button')[0].trigger('click')
      await flushPromises()
      await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('任务失败重试')
      const generation = wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(2000)
      await generation
      await flushPromises()

      expect(submitImageTask).toHaveBeenCalledTimes(2)
      expect(generateImage).not.toHaveBeenCalled()
      const saved = putHistory.mock.calls.at(-1)?.[0]
      expect(saved).toMatchObject({ status: 'completed' })
      expect(saved.imageTaskIds || []).toEqual([])
      expect(showSuccess).toHaveBeenCalledWith('作品生成完成')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
      submitImageTask.mockReset().mockResolvedValue(null)
      getImageTask.mockReset()
    }
  })

  it('does not retry an image rejected by content moderation', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockRejectedValueOnce(Object.assign(new Error('Your request was rejected by the safety system'), { status: 502 }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[0].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('审核拒绝')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not retry a non-transient Grok validation error', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    generateImage.mockRejectedValueOnce(Object.assign(new Error('invalid aspect ratio'), { status: 400 }))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('参数错误不应重试')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('invalid aspect ratio')
  })

  it.each(['pending', 'completed', 'failed'])('preserves an image request across page navigation when returning %s', async (outcome) => {
    const storedWorks = new Map()
    putHistory.mockImplementation(async work => { storedWorks.set(work.id, { ...work }) })
    listHistory.mockImplementation(async () => Array.from(storedWorks.values()))
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    let finish!: (value: { data: Array<{ url: string }> }) => void
    let fail!: (reason: Error) => void
    generateImage.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject }))
    const currentPage = ref('creator')
    const session = ref<number | string>(1)
    const otherMounted = vi.fn()
    const OtherPage = defineComponent({ name: 'OtherPage', setup() { otherMounted(); return () => h('p', '其他页面') } })
    const wrapper = mount(defineComponent({
      setup: () => () => h(StudioRouteCache, {
        sessionKey: session.value,
        view: h(currentPage.value === 'creator' ? CreatorStudioView : OtherPage),
      }),
    }), { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('切换页面继续生成')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(generateImage).toHaveBeenCalledTimes(1)
    const removeListener = vi.spyOn(window, 'removeEventListener')
    currentPage.value = 'other'
    await flushPromises()
    expect(wrapper.text()).toBe('其他页面')
    expect(removeListener).toHaveBeenCalledWith('paste', expect.any(Function))
    if (outcome === 'completed') finish({ data: [{ url: '/completed-away.png' }] })
    if (outcome === 'failed') fail(new Error('生成失败，请重试'))
    await flushPromises()
    currentPage.value = 'creator'
    await flushPromises()
    expect(listHistory.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('切换页面继续生成')
    if (outcome === 'pending') {
      expect(wrapper.find('.result-workspace.is-generating .result-heading-progress').exists()).toBe(true)
      expect(wrapper.find('.generation-frame-ring').exists()).toBe(true)
      expect(wrapper.get('.generate-button').attributes('disabled')).toBeDefined()
      finish({ data: [{ url: '/completed-away.png' }] })
      await flushPromises()
    }
    expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(false)
    if (outcome === 'failed') expect(wrapper.text()).toContain('生成失败，请重试')
    else expect(wrapper.get('.result-media img').attributes('src')).toBe('/completed-away.png')
    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ status: outcome === 'failed' ? 'failed' : 'completed' }))
    currentPage.value = 'other'
    await flushPromises()
    expect(otherMounted).toHaveBeenCalledTimes(2)
    session.value = 'guest'
    await flushPromises()
    session.value = 2
    currentPage.value = 'creator'
    await flushPromises()
    expect(listHistory.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('')
    wrapper.unmount()
    removeListener.mockRestore()
  })

  it('runs creations in the same page with independent progress, parameters and elapsed times', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    let finishFirstA!: (result: unknown) => void
    let finishFirstB!: (result: unknown) => void
    let finishSecond!: (result: unknown) => void
    generateImage.mockImplementationOnce(() => new Promise(resolve => { finishFirstA = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { finishFirstB = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve }))
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('#creator-prompt').setValue('第一组图')
      const settings = wrapper.get<HTMLElement>('.settings-scroll').element
      settings.scrollTop = 420
      const promptFocus = vi.spyOn(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element, 'focus')
      await wrapper.get('button[title="增加数量"]').trigger('click')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      expect(settings.scrollTop).toBe(420)
      expect(wrapper.get('.generate-button').attributes('disabled')).toBeDefined()
      expect(wrapper.get('.result-workspace.is-generating .result-heading h2').text()).toBe('正在生成')
      // The running batch is drawn straight into result cards, with the info table already shown.
      expect(wrapper.find('.generation-panel').exists()).toBe(false)
      expect(wrapper.find('.result-workspace.is-generating .result-parameters').exists()).toBe(true)
      // Both images are requested at once, so both ratio-shaped frames are drawing.
      expect(generateImage.mock.calls.map(call => call[1].prompt)).toEqual(['第一组图', '第一组图'])
      expect(wrapper.findAll('.result-card').map(card => card.classes('is-drawing'))).toEqual([true, true])
      // The live progress is the title, with the image count and a ticking duration pill beside it.
      expect(wrapper.get('.result-heading h2').text()).toBe('正在生成')
      expect(wrapper.find('.result-heading .generation-done-count').exists()).toBe(false)
      expect(wrapper.get('.result-heading .result-count-pill').text()).toContain('2 张')
      expect(wrapper.get('.result-heading .generation-elapsed-pill').text()).toMatch(/耗时 \d+ 秒/)
      expect(wrapper.get('.result-card .result-prompt').text()).toContain('第一组图')
      expect(wrapper.findAll('.result-card .result-tags li').length).toBeGreaterThan(0)
      expect(wrapper.find('a.new-creation-link').exists()).toBe(false)
      await wrapper.get('.new-creation-command').trigger('click')
      expect(settings.scrollTop).toBe(420)
      expect(promptFocus).not.toHaveBeenCalled()
      promptFocus.mockRestore()
      expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('')
      expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(false)
      expect(wrapper.find('.generation-tasks').exists()).toBe(false)
      expect(wrapper.findAll('.history-item.generating')).toHaveLength(1)
      expect(wrapper.get('.history-item.generating .history-progress').text()).toContain('正在同时生成 2 张图片')
      now.mockReturnValue(20_000)
      await wrapper.get('#creator-prompt').setValue('第二张图')
      await wrapper.get('button[title="减少数量"]').trigger('click')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      expect(generateImage.mock.calls.map(call => call[1].prompt)).toEqual(['第一组图', '第一组图', '第二张图'])
      expect(wrapper.findAll('.history-item.generating')).toHaveLength(2)
      expect(wrapper.get('.history-tab-generating').text()).toBe('2')
      // Selecting either running work shows its own progress, without resubmitting.
      await wrapper.get('[aria-label="打开作品：第一组图"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('.result-workspace.is-generating .result-heading h2').text()).toBe('正在生成')
      await wrapper.findAll('.history-item-hitbox')[0].trigger('click')
      await flushPromises()
      expect(wrapper.get('.result-workspace.is-generating').text()).toContain('正在调用图片模型')
      expect(wrapper.text()).not.toContain('无法恢复')
      now.mockReturnValue(25_000)
      finishSecond({ data: [{ url: '/second-result.png' }] })
      await flushPromises()
      expect(wrapper.get('.result-media img').attributes('src')).toBe('/second-result.png')
      expect(wrapper.findAll('.history-item.generating')).toHaveLength(1)
      // A's images finish out of order; each is saved without dropping the other.
      finishFirstB({ data: [{ url: '/first-b.png' }] })
      await flushPromises()
      expect(wrapper.findAll('.history-item.generating')).toHaveLength(1)
      now.mockReturnValue(40_000)
      finishFirstA({ data: [{ url: '/first-a.png' }] })
      await flushPromises()
      expect(generateImage.mock.calls.map(call => call[1].prompt)).toEqual(['第一组图', '第一组图', '第二张图'])
      expect(wrapper.get('.result-media img').attributes('src')).toBe('/second-result.png')
      expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('第二张图')
      expect(wrapper.find('.history-item.generating').exists()).toBe(false)
      expect(wrapper.find('.history-tab-generating').exists()).toBe(false)
      const completed = putHistory.mock.calls.map(call => call[0]).filter(work => work.status === 'completed')
      expect(completed).toEqual(expect.arrayContaining([
        expect.objectContaining({ prompt: '第一组图', outputCount: 2, generationDurationMs: 30_000, outputs: ['/first-b.png', '/first-a.png'] }),
        expect.objectContaining({ prompt: '第二张图', outputCount: 1, generationDurationMs: 5_000, outputs: ['/second-result.png'] }),
      ]))
    } finally {
      wrapper.unmount()
      now.mockRestore()
    }
  })

  it('counts a generated image as done only after its original is saved in the browser', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    let resolveDownload!: (blob: Blob) => void
    downloadImage.mockReturnValue(new Promise(resolve => { resolveDownload = resolve }))
    generateImage.mockResolvedValueOnce({ data: [{ url: 'https://cdn.example.com/first.png' }] })
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(() => new Promise(() => {}))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('#creator-prompt').setValue('原图保存后才算完成')
      await wrapper.get('button[title="增加数量"]').trigger('click')
      await wrapper.get('button[title="增加数量"]').trigger('click')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      // The first image exists upstream but its original is still downloading.
      await vi.waitFor(() => expect(downloadImage).toHaveBeenCalledWith(image2Key.key, 'https://cdn.example.com/first.png'))
      await flushPromises()
      expect(wrapper.get('.result-heading .result-count-pill').text()).toBe('0 / 3 张')
      expect(wrapper.text()).toContain('正在同时生成 3 张图片（已完成 0 张）')

      resolveDownload(new Blob(['image'], { type: 'image/png' }))
      await vi.waitFor(() => expect(wrapper.get('.result-heading .result-count-pill').text()).toBe('1 / 3 张'))
      expect(wrapper.text()).toContain('正在同时生成 3 张图片（已完成 1 张）')
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps failed and out-of-order image frames in their original slots while others are drawing', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    let finishFirst!: (value: unknown) => void
    generateImage.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
      .mockRejectedValueOnce(new Error('第二张失败'))
      .mockResolvedValueOnce({ data: [{ url: 'data:image/png;base64,Qw==' }] })
    let notify: ((work: unknown) => void) | undefined
    subscribeHistory.mockImplementation(listener => { notify = listener; return vi.fn() })
    putHistory.mockImplementation(async work => { notify?.({ ...work, outputs: [...work.outputs] }); return true })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('#creator-prompt').setValue('保留失败图片的原始提示词')
      await wrapper.get('button[title="增加数量"]').trigger('click')
      await wrapper.get('button[title="增加数量"]').trigger('click')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      const frames = wrapper.findAll('.result-card')
      expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(true)
      expect(frames.map(frame => frame.classes('is-drawing'))).toEqual([true, false, false])
      expect(frames[1].classes()).toContain('is-missing')
      expect(frames[1].attributes('aria-hidden')).toBeUndefined()
      expect(frames[1].get('.result-prompt').text()).toContain('保留失败图片的原始提示词')
      expect(frames[2].get('img').attributes('src')).toBe('data:image/png;base64,Qw==')
      // The heading stays short; progress and the failure sit in pills beside it.
      expect(wrapper.get('.result-heading h2').text()).toBe('正在生成')
      expect(wrapper.get('.result-heading .result-count-pill').text()).toBe('1 / 3 张')
      expect(wrapper.get('.result-heading .result-failed-pill').text()).toBe('1 张失败')
      finishFirst({ data: [{ url: 'data:image/png;base64,QQ==' }] })
      await flushPromises()
      const cards = wrapper.findAll('.result-card')
      expect(cards[0].get('img').attributes('src')).toBe('data:image/png;base64,QQ==')
      expect(cards[1].classes()).toContain('is-missing')
      expect(cards[2].get('img').attributes('src')).toBe('data:image/png;base64,Qw==')
    } finally { wrapper.unmount() }
  })

  it('shows every image of a running batch as a drawing card', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('#creator-prompt').setValue('四张图布局')
      for (let index = 1; index < 4; index++) await wrapper.get('button[title="增加数量"]').trigger('click')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()

      const cards = wrapper.findAll('.result-workspace.is-generating .result-card')
      expect(cards).toHaveLength(4)
      expect(cards.every(card => card.classes('is-drawing'))).toBe(true)
      // Drawing cards keep the requested ratio and the finished card's (disabled) toolbar.
      expect(cards[0].get('.result-drawing-media').attributes('style')).toContain('aspect-ratio')
      expect(cards[0].findAll('.result-media-actions .result-action-label').map(label => label.text())).toEqual(['预览', '重新生成', '编辑', '下载'])
      expect(cards[0].findAll('.result-media-actions button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('redraws a finished image in its own frame while the rest of the batch is still drawing', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    let finishSecond!: (result: unknown) => void
    let finishRedraw!: (result: unknown) => void
    generateImage.mockResolvedValueOnce({ data: [{ url: 'data:image/png;base64,Rmlyc3Q=' }] })
      .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { finishRedraw = resolve }))
    let notify: ((work: unknown) => void) | undefined
    subscribeHistory.mockImplementation(listener => { notify = listener; return vi.fn() })
    putHistory.mockImplementation(async work => { notify?.({ ...work, outputs: [...work.outputs] }); return true })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('#creator-prompt').setValue('两张图')
      await wrapper.get('button[title="增加数量"]').trigger('click')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()

      // Same order as the finished result cards: preview, redraw, edit, download.
      expect(wrapper.findAll('.result-card')[0].findAll('.result-media-actions .result-action-label').map(label => label.text())).toEqual([
        '预览', '重新生成', '编辑', '下载',
      ])
      await wrapper.get('.result-card .result-redraw-action').trigger('click')
      await flushPromises()
      expect(generateImage).toHaveBeenCalledTimes(3)
      // The redrawn frame keeps its original until the new image arrives; the run keeps going.
      expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(true)
      expect(wrapper.findAll('.result-card').map(card => card.classes('is-drawing'))).toEqual([false, true])
      expect(wrapper.get('.result-card .result-redraw-action').attributes('disabled')).toBeDefined()

      finishRedraw({ data: [{ url: 'data:image/png;base64,TmV3' }] })
      finishSecond({ data: [{ url: 'data:image/png;base64,U2Vjb25k' }] })
      await flushPromises()
      const saved = putHistory.mock.calls.at(-1)?.[0]
      expect(saved?.status).toBe('completed')
      const bySlot = new Map(saved?.outputs.map((output: string, index: number) => [saved.imageOutputIndexes?.[index] ?? index, output]))
      expect(bySlot.get(0)).toBe('data:image/png;base64,TmV3')
      expect(bySlot.get(1)).toBe('data:image/png;base64,U2Vjb25k')
    } finally {
      wrapper.unmount()
    }
  })

  it('redraws a finished image while a refreshed work is still syncing and keeps the original when it fails', async () => {
    listGroups.mockResolvedValue([image2Group])
    listHistory.mockResolvedValue([{
      id: 'resumed-image', type: 'image', status: 'pending', prompt: '雪山星空下的帐篷',
      model: 'gpt-image-2', provider: 'Image2 生图', groupName: image2Group.name, groupId: image2Group.id,
      apiKeyId: image2Key.id, imageCapability: 'image2', createdAt: Date.now() - 60_000, updatedAt: Date.now() - 50_000,
      outputs: ['data:image/png;base64,T2xk'], imageOutputIndexes: [0], outputCount: 2,
      imageTaskIds: ['imgtask_b'], imageTaskIndexes: { imgtask_b: 1 },
    }])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    let finishSecond!: (status: unknown) => void
    getImageTask.mockImplementation(() => new Promise(resolve => { finishSecond = resolve }))
    generateImage.mockRejectedValueOnce(new Error('上游暂时不可用'))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(true)
      const redraw = wrapper.get('.result-card .result-redraw-action')
      expect(redraw.attributes('disabled')).toBeUndefined()

      await redraw.trigger('click')
      await flushPromises()
      expect(generateImage).toHaveBeenCalledTimes(1)
      expect(generateImage).toHaveBeenCalledWith(image2Key.key, expect.objectContaining({ prompt: '雪山星空下的帐篷', n: 1 }))
      expect(showWarning).toHaveBeenCalledWith('图片 1 重新生成失败，已保留原图')
      expect(wrapper.findAll('.result-card')[0].get('img').attributes('src')).toBe('data:image/png;base64,T2xk')

      finishSecond({ status: 'completed', result: { data: [{ url: 'data:image/png;base64,Qg==' }] } })
      await flushPromises()
      // Only this work's saves; async work left over from other tests may also write history.
      const saved = putHistory.mock.calls.map(([work]) => work).filter(work => work.id === 'resumed-image').at(-1)
      expect(saved?.status).toBe('completed')
      const bySlot = new Map(saved?.outputs.map((output: string, index: number) => [saved.imageOutputIndexes?.[index] ?? index, output]))
      expect(bySlot.get(0)).toBe('data:image/png;base64,T2xk')
      expect(bySlot.get(1)).toBe('data:image/png;base64,Qg==')
      expect(saved?.error).toBeUndefined()
    } finally {
      wrapper.unmount()
      getImageTask.mockReset()
    }
  })

  it('opens and downloads finished images while the rest of the batch is still drawing', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    let finishSecond!: (result: unknown) => void
    generateImage.mockResolvedValueOnce({ data: [{ url: 'data:image/png;base64,Rmlyc3Q=' }] })
      .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve }))
    let downloaded: { href: string; filename: string } | undefined
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloaded = { href: this.href, filename: this.download }
    })
    // Like the real store, each save notifies the page with a fresh copy.
    let notify: ((work: unknown) => void) | undefined
    subscribeHistory.mockImplementation(listener => { notify = listener; return vi.fn() })
    putHistory.mockImplementation(async work => { notify?.({ ...work, outputs: [...work.outputs] }); return true })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.get('#creator-prompt').setValue('两张图')
      await wrapper.get('button[title="增加数量"]').trigger('click')
      await wrapper.get('.generate-button').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.result-card').map(card => card.classes('is-drawing'))).toEqual([false, true])
      // Only the finished frame is interactive.
      expect(wrapper.findAll('.result-card button[title="预览作品"]:not([disabled])')).toHaveLength(1)

      await wrapper.get('.result-card button[title="预览作品"]:not([disabled])').trigger('click')
      expect(wrapper.getComponent('.image-preview-content').props('src')).toBe('data:image/png;base64,Rmlyc3Q=')
      // Phones hide the frame buttons, so the preview offers save and edit too.
      const previewActions = wrapper.findAll('.preview-action')
      expect(previewActions).toHaveLength(2)
      expect(previewActions[0].text()).toContain('下载')
      expect(previewActions[1].text()).toContain('编辑')
      await previewActions[0].trigger('click')
      await flushPromises()
      expect(downloaded?.href).toBe('data:image/png;base64,Rmlyc3Q=')
      downloaded = undefined
      await wrapper.get('.preview-close').trigger('click')

      await wrapper.get('.result-card button[title="下载作品"]:not([disabled])').trigger('click')
      await flushPromises()
      expect(downloaded?.href).toBe('data:image/png;base64,Rmlyc3Q=')
      expect(downloaded?.filename).toMatch(/^creator-\d+-1\.png$/)
      expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(true)

      await wrapper.get('.result-card button[title="预览作品"]:not([disabled])').trigger('click')
      expect(wrapper.getComponent('.image-preview-content').props('src')).toBe('data:image/png;base64,Rmlyc3Q=')
      await wrapper.get('.preview-close').trigger('click')

      // Editing hands the finished image to the form while the rest keep drawing.
      await wrapper.get('.result-card button[aria-label="编辑这张照片"]:not([disabled])').trigger('click')
      await flushPromises()
      expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(false)
      expect(wrapper.findAll('.reference-item')).toHaveLength(1)
      finishSecond({ data: [{ url: 'data:image/png;base64,U2Vjb25k' }] })
      await flushPromises()
    } finally {
      wrapper.unmount()
      anchorClick.mockRestore()
    }
  })

  it.each(['completed', 'failed'])('keeps browsing and the next draft intact when a background image %s', async outcome => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const oldWork = { id: 'old', type: 'image', status: 'completed', prompt: '历史图片', model: 'gpt-image-2', provider: 'image2', groupName: image2Group.name, createdAt: 1, updatedAt: 1, outputs: ['/old.png'] }
    listHistory.mockResolvedValue([oldWork])
    let finishFirst!: (value: unknown) => void
    let failFirst!: (error: Error) => void
    let finishSecond!: (value: unknown) => void
    generateImage.mockImplementationOnce(() => new Promise((resolve, reject) => { finishFirst = resolve; failFirst = reject }))
      .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('任务 A')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await wrapper.get('.new-creation-command').trigger('click')
    await wrapper.get('#creator-prompt').setValue('任务 B')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="打开作品：历史图片"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.result-media img').attributes('src')).toBe('/old.png')
    expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(false)
    expect(wrapper.findAll('.history-item.generating')).toHaveLength(2)
    if (outcome === 'failed') failFirst(new Error('No available compatible accounts'))
    else finishFirst({ data: [{ url: '/a.png' }] })
    await flushPromises()
    expect(wrapper.get('.result-media img').attributes('src')).toBe('/old.png')
    expect(wrapper.findAll('.history-item.generating')).toHaveLength(1)
    await wrapper.get('.history-item.generating .history-item-hitbox').trigger('click')
    await flushPromises()
    expect(wrapper.find('.result-workspace.is-generating .result-heading-progress').exists()).toBe(true)
    await wrapper.get('.new-creation-command').trigger('click')
    await wrapper.get('#creator-prompt').setValue('尚未提交的新草稿')
    finishSecond({ data: [{ url: '/b.png' }] })
    await flushPromises()
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('尚未提交的新草稿')
    expect(wrapper.find('.result-workspace').exists()).toBe(false)
    expect(wrapper.find('.history-item.generating').exists()).toBe(false)
    expect(wrapper.get('.generate-button').attributes('disabled')).toBeUndefined()
    expect(generateImage).toHaveBeenCalledTimes(2)
    expect(putHistory.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
      expect.objectContaining({ prompt: '任务 A', status: outcome }),
      expect.objectContaining({ prompt: '任务 B', status: 'completed' }),
    ]))
    wrapper.unmount()
  })

  it('resets the settings panel to its initial state in one click', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('待清空的草稿')
    await wrapper.get('#creator-quality').setValue('high')
    await wrapper.get('#creator-format').setValue('jpeg')
    await wrapper.findAll('.capability-switch button').find(button => button.text() === 'Banner')!.trigger('click')
    await flushPromises()

    await wrapper.get('.reset-settings-action').trigger('click')
    await flushPromises()
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('')
    expect(wrapper.get('.capability-switch button.active').text()).toBe('Image')
    expect(wrapper.get<HTMLSelectElement>('#creator-quality').element.value).toBe('auto')
    expect(wrapper.get<HTMLSelectElement>('#creator-format').element.value).toBe('png')
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('gpt-image-2')
    expect(generateImage).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps an in-flight task visible when history refresh races its initial save', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    let save!: () => void
    putHistory.mockImplementationOnce(() => new Promise<void>(resolve => { save = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('正在保存的任务')
    await wrapper.get('.generate-button').trigger('click')
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(true)
    expect(wrapper.findAll('.history-item-hitbox')).toHaveLength(1)
    expect(wrapper.find('.history-item button:not(.history-item-hitbox)').exists()).toBe(false)
    save()
    await flushPromises()
    expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps video polling independent while an image is created and viewed', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    let finishVideo!: (value: unknown) => void
    let finishImage!: (value: unknown) => void
    getVideoStatus.mockImplementationOnce(() => new Promise(resolve => { finishVideo = resolve }))
    generateImage.mockImplementationOnce(() => new Promise(resolve => { finishImage = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('后台视频')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(getVideoStatus).toHaveBeenCalledTimes(1)
    await wrapper.findAll('.mode-option')[0].trigger('click')
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('前台图片')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    // Each history tab badges its own running work.
    expect(wrapper.findAll('.history-tab-generating').map(badge => badge.text())).toEqual(['1', '1'])
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('[aria-label="打开作品：后台视频"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.result-card.is-drawing').text()).toContain('正在生成视频')
    expect(getVideoStatus).toHaveBeenCalledTimes(1)
    await wrapper.findAll('.history-tabs button')[0].trigger('click')
    await wrapper.get('[aria-label="打开作品：前台图片"]').trigger('click')
    await flushPromises()
    finishVideo({ id: 'video-task-1', status: 'completed' })
    await flushPromises()
    expect(wrapper.find('.result-workspace.is-generating .result-heading-progress').exists()).toBe(true)
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('前台图片')
    expect(wrapper.findAll('.history-tab-generating').map(badge => badge.text())).toEqual(['1'])
    finishImage({ data: [{ url: '/foreground.png' }] })
    await flushPromises()
    expect(wrapper.get('.result-media img').attributes('src')).toBe('/foreground.png')
    expect(createVideo).toHaveBeenCalledTimes(1)
    expect(generateImage).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('loads only the changed work from another window without changing the draft or generating', async () => {
    const unsubscribe = vi.fn()
    subscribeExternalHistory.mockReturnValue(unsubscribe)
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('当前窗口的草稿')
    const listCalls = listHistory.mock.calls.length
    const receive = subscribeExternalHistory.mock.calls[0][0]
    getHistory.mockResolvedValue({ id: 'other-window', type: 'image', status: 'completed', prompt: '另一个窗口完成', model: 'gpt-image-2', provider: 'image2', groupName: 'Image2', createdAt: 1, updatedAt: 2, outputs: ['/external.png'] })
    receive({ type: 'put', id: 'other-window' })
    await flushPromises()
    expect(getHistory).toHaveBeenCalledWith('other-window')
    expect(wrapper.get('.history-item-hitbox').attributes('aria-label')).toContain('另一个窗口完成')
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('当前窗口的草稿')
    expect(listHistory).toHaveBeenCalledTimes(listCalls)
    expect(generateImage).not.toHaveBeenCalled()
    receive({ type: 'remove', id: 'other-window' })
    await flushPromises()
    expect(wrapper.find('.history-item-hitbox').exists()).toBe(false)
    wrapper.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('replaces the selected pending snapshot when another instance finishes writing history', async () => {
    const pending = {
      id: 'background-image', type: 'image', status: 'pending', prompt: '后台完成的图片',
      model: 'grok-imagine-image', provider: 'grok', groupName: group.name,
      createdAt: 1, updatedAt: 1, outputs: [],
    }
    listHistory.mockResolvedValue([pending])
    const unsubscribe = vi.fn()
    subscribeHistory.mockReturnValue(unsubscribe)
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    expect(wrapper.text()).toContain('正在等待图片结果')
    expect(wrapper.text()).toContain('结果保存后会自动同步')
    expect(wrapper.text()).not.toContain('无法恢复')
    subscribeHistory.mock.calls[0][0]({ ...pending, status: 'completed', updatedAt: 2, outputs: ['/saved-result.png'] })
    await flushPromises()
    expect(wrapper.get('.result-media img').attributes('src')).toBe('/saved-result.png')
    expect(wrapper.find('.history-status.pending').exists()).toBe(false)
    expect(generateImage).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('shows result actions for a pending work that already has saved images', async () => {
    const pending = {
      id: 'pending-with-images', type: 'image', status: 'pending', prompt: '已保存的花朵',
      model: 'gemini-nano-banana-2.1', provider: 'Banner 生图', groupName: group.name,
      createdAt: 1, updatedAt: 1, outputCount: 2, outputs: ['/flower-1.png', '/flower-2.png'],
    }
    listHistory.mockResolvedValue([pending])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    const heading = wrapper.get('.result-heading')
    expect(heading.text()).toContain('本次创作')
    expect(heading.text()).not.toContain('等待生成结果')
    expect(heading.get('.result-count-pill').text()).toContain('2 张')
    expect(heading.find('.result-duration-pill').exists()).toBe(false)
    expect(heading.text()).toContain('重新生成')
    expect(heading.text()).toContain('新建创作')
    expect(wrapper.text()).not.toContain('当前请求使用你的 Sub2API Key')
    const parameters = wrapper.get('.result-parameters')
    expect(parameters.text()).toContain('gemini-nano-banana-2.1')
    expect(parameters.text()).toContain('提交时间')
    expect(parameters.text()).not.toContain('完成耗时')
    expect(parameters.text()).not.toContain('已保存的花朵')
    expect(wrapper.get('.result-card .result-prompt').text()).toBe('已保存的花朵')
    wrapper.unmount()
  })

  it('brings a finished work prompt back into the editor from the result heading', async () => {
    listHistory.mockResolvedValue([{
      id: 'finished-reuse', type: 'image', status: 'completed', prompt: '变成南极',
      model: 'gemini-nano-banana-2.1', provider: 'Banner 生图', groupName: group.name,
      createdAt: 1, updatedAt: 1, outputCount: 1, outputs: ['/aurora.png'],
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    const continueGroup = wrapper.get('.result-heading-continue')
    expect(continueGroup.findAll('button > span:last-child').map(label => label.text())).toEqual(['带入提示词继续', '新建创作'])
    await continueGroup.get('.result-reuse-command').trigger('click')
    await flushPromises()
    expect(wrapper.find('.result-workspace').exists()).toBe(false)
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('变成南极')
    expect(wrapper.get('.generate-button').text()).toContain('开始生成')
    wrapper.unmount()
  })

  it('on mobile, returns to the page top after bringing a finished prompt back', async () => {
    listHistory.mockResolvedValue([{
      id: 'mobile-reuse', type: 'image', status: 'completed', prompt: '变成南极',
      model: 'gemini-nano-banana-2.1', provider: 'Banner 生图', groupName: group.name,
      createdAt: 1, updatedAt: 1, outputCount: 1, outputs: ['/aurora.png'],
    }])
    const restoreViewport = mockViewportWidth(390)
    const originalScrollIntoView = Element.prototype.scrollIntoView
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this) }
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()
      await wrapper.get('[aria-label="打开作品：变成南极"]').trigger('click')
      await flushPromises()
      windowScrollTo.mockClear()
      scrolled.length = 0

      await wrapper.get('.result-reuse-command').trigger('click')
      await flushPromises()
      expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('变成南极')
      expect(windowScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
      expect(scrolled).toHaveLength(0)
      wrapper.unmount()
    } finally {
      restoreViewport()
      Element.prototype.scrollIntoView = originalScrollIntoView
      windowScrollTo.mockRestore()
    }
  })

  it('shortens long failure reasons saved by older versions on failed image cards', async () => {
    listHistory.mockResolvedValue([{
      id: 'legacy-long-reason', type: 'image', status: 'failed', prompt: '旧的长原因', model: 'gpt-image-2.5-sunburst',
      provider: 'Image2 生图', groupName: group.name, createdAt: 1, updatedAt: 1, outputCount: 2, outputs: [],
      error: 'GPT Image 上游服务暂时不可用，请稍后点击“重新生成”；如果频繁出现，请检查该分组的 GPT Image 账号状态。',
    }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.get('.partial-result-notice strong').text()).toBe('2 张图片未生成')
    expect(wrapper.get('.partial-result-notice p').text()).toBe('GPT Image 上游暂时不可用，请稍后重试。')
    expect(wrapper.findAll('.result-missing-media.is-image p').map(item => item.text()))
      .toEqual(['点击“重新生成”，单独重做这张图片', '点击“重新生成”，单独重做这张图片'])
    wrapper.unmount()
  })

  it('shows work parameters for failed and unfinished image works', async () => {
    const failed = {
      id: 'failed-image', type: 'image', status: 'failed', prompt: '失败的雪山日出',
      model: 'gpt-image-2.5-sunburst', provider: 'Image2 生图', groupName: group.name,
      createdAt: 1, updatedAt: 5_000, outputCount: 2, outputs: [], error: '上游超时',
    }
    const failedSingle = {
      ...failed, id: 'failed-single-image', prompt: '失败的单张图片', outputCount: 1,
    }
    const pending = {
      id: 'pending-image', type: 'image', status: 'pending', prompt: '仍在生成的草原',
      model: 'gpt-image-2.5-sunburst', provider: 'Image2 生图', groupName: group.name,
      createdAt: 2, updatedAt: 2, outputCount: 1, outputs: [],
    }
    listHistory.mockResolvedValue([pending, failed, failedSingle])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    const items = wrapper.findAll('.history-item-hitbox')
    await items[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.result-error').exists()).toBe(false)
    expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(2)
    expect(wrapper.get('.partial-result-notice p').text()).toBe('上游超时')
    expect(wrapper.findAll('.result-missing-media p').map(item => item.text())).toEqual(['点击“重新生成”，单独重做这张图片', '点击“重新生成”，单独重做这张图片'])
    expect(wrapper.findAll('.result-card .result-shot-retry')).toHaveLength(2)
    const failedHeading = wrapper.get('.result-heading-actions')
    expect(failedHeading.find('[aria-label="删除这条作品"]').exists()).toBe(true)
    expect(failedHeading.text()).toContain('重新生成')
    expect(failedHeading.text()).toContain('新建创作')
    // Download stays in the row, disabled while there is nothing to download.
    expect(failedHeading.get('.download-all-command').attributes('disabled')).toBeDefined()
    let parameters = wrapper.get('.result-parameters')
    expect(parameters.text()).toContain('gpt-image-2.5-sunburst')
    expect(parameters.text()).toContain('2 张')
    expect(parameters.text()).toContain('完成耗时')
    expect(parameters.text()).not.toContain('失败的雪山日出')
    expect(wrapper.findAll('.result-card .result-prompt').map(item => item.text())).toEqual(['失败的雪山日出', '失败的雪山日出'])
    expect(wrapper.findAll('.result-card.is-missing')).toHaveLength(2)
    expect(wrapper.findAll('.result-missing-prompt')).toHaveLength(0)

    await items[2].trigger('click')
    await flushPromises()
    expect(wrapper.get('.result-error').text()).toContain('上游超时')
    // The single failure card is the whole result; no empty slot is repeated below it.
    expect(wrapper.find('.result-grid').exists()).toBe(false)
    expect(wrapper.find('.partial-result-notice').exists()).toBe(false)

    await items[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('正在等待图片结果')
    expect(wrapper.get('.result-card .result-missing-media strong').text()).toBe('等待生成结果')
    const waitingRegenerate = wrapper.get('.result-heading-actions').findAll('button').find(button => button.text().includes('重新生成'))
    expect(waitingRegenerate?.attributes('disabled')).toBeDefined()
    parameters = wrapper.get('.result-parameters')
    expect(parameters.text()).toContain('提交时间')
    expect(parameters.text()).not.toContain('完成耗时')
    expect(parameters.text()).not.toContain('仍在生成的草原')
    expect(wrapper.get('.result-card .result-prompt').text()).toBe('仍在生成的草原')
    wrapper.unmount()
  })

  it('refreshes the selected work from storage without generating or changing the prompt', async () => {
    const pending = {
      id: 'stored-result', type: 'image', status: 'pending', prompt: '已保存的结果',
      model: 'grok-imagine-image', provider: 'grok', groupName: group.name,
      createdAt: 1, updatedAt: 1, outputs: [],
    }
    listHistory.mockResolvedValue([pending])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    listHistory.mockResolvedValue([{ ...pending, status: 'completed', updatedAt: 2, outputs: ['/recovered.png'] }])
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.get('.result-media img').attributes('src')).toBe('/recovered.png')
    expect(generateImage).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows indeterminate progress while submitting and keeps it visible after generation starts', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    let releasePendingHistory: (() => void) | undefined
    let finishImage: ((value: { data: Array<{ url: string }> }) => void) | undefined
    putHistory.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releasePendingHistory = resolve
    }))
    generateImage.mockImplementationOnce(() => new Promise((resolve) => {
      finishImage = resolve
    }))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('一张方形产品图')
    await wrapper.get('.generate-button').trigger('click')

    expect(wrapper.get('.result-workspace.is-generating .result-heading .generation-elapsed-pill').text()).toContain('耗时')
    expect(wrapper.find('.result-card.is-drawing .generation-frame-ring').exists()).toBe(true)

    releasePendingHistory?.()
    await flushPromises()
    expect(generateImage).toHaveBeenCalled()
    expect(wrapper.find('.result-card.is-drawing .generation-frame-ring').exists()).toBe(true)

    finishImage?.({ data: [{ url: 'data:image/png;base64,UE5H' }] })
    await flushPromises()
    expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(false)
  })

  it('brings a running video prompt back so another model can generate it', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }, { id: 'grok-imagine-video-1.5' }])
    createVideo.mockImplementationOnce(() => new Promise(() => {}))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('一位讲解者坐在书房中面向镜头讲话')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(createVideo).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.result-card.is-drawing').exists()).toBe(true)

    expect(wrapper.get('.result-reuse-command').text()).toContain('带入提示词继续')
    await wrapper.get('.result-reuse-command').trigger('click')
    await flushPromises()

    expect(wrapper.find('.result-card.is-drawing').exists()).toBe(false)
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('一位讲解者坐在书房中面向镜头讲话')
    expect(wrapper.get('.generate-button').text()).toContain('开始生成')

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('grok-imagine-video-1.5')
    await flushPromises()
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(2))
    expect(createVideo.mock.calls[0][1]).toEqual(expect.objectContaining({ model: 'grok-imagine-video' }))
    expect(createVideo.mock.calls[1][1]).toEqual(expect.objectContaining({
      model: 'grok-imagine-video-1.5',
      prompt: '一位讲解者坐在书房中面向镜头讲话',
    }))
    wrapper.unmount()
  })

  it('shows indeterminate progress while a video request is being submitted', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    let finishVideoSubmission: ((value: { id: string }) => void) | undefined
    createVideo.mockImplementationOnce(() => new Promise(resolve => {
      finishVideoSubmission = resolve
    }))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await openGrokVideo(wrapper)
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('一只小猫奔跑')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(createVideo).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.result-heading-progress').text()).toBe('正在提交')
    expect(wrapper.get('.result-heading .result-count-pill').text()).toBe('0 / 1 段')
    expect(wrapper.get('.result-drawing-media .slot-progress').classes()).toContain('indeterminate')
    expect(wrapper.get('.result-drawing-media small').text()).toBe('正在提交任务')

    finishVideoSubmission?.({ id: 'video-task-1' })
    await flushPromises()
    expect(wrapper.find('.result-card.is-drawing').exists()).toBe(false)
  })

  it('keeps an image task bound to image mode when the user opens the video workspace', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    let releasePendingHistory: (() => void) | undefined
    let finishImage: ((value: { data: Array<{ url: string }> }) => void) | undefined
    putHistory.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releasePendingHistory = resolve
    }))
    generateImage.mockImplementationOnce(() => new Promise((resolve) => {
      finishImage = resolve
    }))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('一张正在生成的图片')
    await wrapper.get('.generate-button').trigger('click')
    expect(wrapper.find('.result-workspace.is-generating .result-heading-progress').exists()).toBe(true)

    await openGrokVideo(wrapper)
    await flushPromises()
    expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('正在制作你的视频')

    releasePendingHistory?.()
    await flushPromises()
    expect(generateImage).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      model: 'grok-imagine-image',
      prompt: '一张正在生成的图片',
    }))
    expect(createVideo).not.toHaveBeenCalled()

    await wrapper.findAll('.mode-option')[0].trigger('click')
    await flushPromises()
    expect(wrapper.find('.result-workspace.is-generating .result-heading-progress').exists()).toBe(true)

    finishImage?.({ data: [{ url: 'data:image/png;base64,UE5H' }] })
    await flushPromises()
    expect(wrapper.find('.result-workspace.is-generating').exists()).toBe(false)
  })

  it('previews video costs for duration, resolution and mixed professional shots', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    const total = () => wrapper.get('.video-cost-preview .image-cost-total strong').text()
    expect(getVideoPricing).toHaveBeenLastCalledWith(createdKey.key, 'grok-imagine-video', expect.any(AbortSignal))
    expect(total()).toBe('$0.80')
    await wrapper.get('button[title="增加时长"]').trigger('click')
    expect(total()).toBe('$0.90')
    await wrapper.get('#video-params').trigger('click')
    const params = videoParamsDialog(wrapper)
    expect(params.get('.image-resolution-grid button[data-resolution="480p"]').text()).toContain('$0.45 / 9 秒')
    expect(params.get('.video-params-cost strong').text()).toBe('$0.90 USD')
    await params.get('.image-resolution-grid button[data-resolution="480p"]').trigger('click')
    expect(params.get('.video-params-cost strong').text()).toBe('$0.45 USD')
    expect(total()).toBe('$0.90')
    await params.get('.image-size-cancel').trigger('click')
    await setVideoParams(wrapper, { resolution: '480p' })
    expect(total()).toBe('$0.45')
    await wrapper.get('.toggle-row input').setValue(true)
    await setVideoParams(wrapper, { resolution: '720p' })
    await wrapper.get('.sequence-add').trigger('click')
    await setVideoParams(wrapper, { resolution: '480p' })
    expect(total()).toBe('$1.20')
    await wrapper.get('button[title="增加时长"]').trigger('click')
    expect(total()).toBe('$1.25')
    expect(createVideo).not.toHaveBeenCalled()
  })

  it('retries unavailable video prices and displays a free quote', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    getVideoPricing.mockRejectedValue(new Error('offline'))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    expect(wrapper.get('.video-cost-preview strong').text()).toBe('暂无法预估')
    getVideoPricing.mockResolvedValue({ currency: 'USD', prices: { '720p': Array(15).fill(0) } })
    await wrapper.get('.video-cost-preview button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.video-cost-preview strong').text()).toBe('$0.00')
  })

  it('moves professional video shots into the main workspace', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.mode-option')[1].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLInputElement>('.toggle-row input').setValue(true)

    expect(wrapper.find('.professional-workspace').exists()).toBe(true)
    expect(wrapper.find('.settings-panel .shot-list').exists()).toBe(false)
    expect(wrapper.findAll('.sequence-shot')).toHaveLength(1)
    expect(wrapper.find('.sequence-shot').classes()).toContain('active')
    expect(wrapper.find('.selected-shot-editor').exists()).toBe(false)
    expect(wrapper.get('.prompt-field label').text()).toBe('视频描述')
    expect(wrapper.get('.prompt-field > small').text()).toContain('镜头 1')
    expect(wrapper.get('.video-duration-estimate .video-duration-value').text()).toBe('8 秒')
    expect(wrapper.get('.video-duration-estimate').text()).toContain('单段视频')
    await wrapper.get('.sequence-add').trigger('click')
    expect(wrapper.findAll('.sequence-shot')).toHaveLength(2)
    expect(wrapper.findAll('.sequence-shot')[1].classes()).toContain('active')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第二个镜头的右侧编辑文案')
    expect(wrapper.findAll('.sequence-shot-prompt')[1].text()).toBe('第二个镜头的右侧编辑文案')
    expect(wrapper.find('.sequence-shot textarea, .sequence-shot input').exists()).toBe(false)
    expect(wrapper.get('.video-duration-estimate .video-duration-value').text()).toBe('16 秒')
    expect(wrapper.get('.video-duration-estimate').text()).toContain('2 个镜头 · 按镜头顺序拼接')

    await wrapper.findAll('.sequence-shot')[0].trigger('click')
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('')
    await wrapper.get('.field-block .stepper button:last-child').trigger('click')
    expect(wrapper.get('.video-duration-estimate .video-duration-value').text()).toBe('17 秒')
    expect(wrapper.find('.settings-panel input[type="range"]').exists()).toBe(false)
    await wrapper.get('button[title="减少时长"]').trigger('click')
    expect(wrapper.findAll('.sequence-shot')[0].text()).toContain('8 秒')
    expect(wrapper.get('.video-duration-estimate .video-duration-value').text()).toBe('16 秒')
    await wrapper.findAll('.sequence-shot')[1].trigger('click')
    expect(wrapper.get<HTMLInputElement>('#creator-video-duration').element.value).toBe('8')
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('第二个镜头的右侧编辑文案')
    wrapper.unmount()
  })

  it('opens the shot editor of a selected single-shot video with that video\'s own content', async () => {
    listHistory.mockResolvedValue([{
      id: 'single-shot-video',
      type: 'video',
      status: 'completed',
      prompt: '深灰石台上立着一只机械腕表，镜头缓缓向前推进',
      model: 'grok-imagine-video-1.5',
      provider: 'Grok 视频',
      groupName: group.name,
      groupId: group.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputs: ['blob:watch-video'],
      outputCount: 1,
      shotCount: 1,
      aspectRatio: '16:9',
      resolution: '720p',
      requestedDuration: 10,
      videoGenerationMethod: 'text',
    }])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-video-1.5' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    // A previous multi-shot edit leaves shots in the editor.
    await wrapper.findAll('.mode-option')[1].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLInputElement>('.toggle-row input').setValue(true)
    await wrapper.get('.sequence-add').trigger('click')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('上次生成留下的镜头文案')
    await wrapper.get('button[title="增加时长"]').trigger('click')

    // Selecting a finished single-shot video and opening its shot editor must
    // start from that video, not the shots left over from the previous edit.
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    expect(wrapper.find('.professional-workspace').exists()).toBe(false)
    await wrapper.get<HTMLInputElement>('.toggle-row input').setValue(true)

    expect(wrapper.findAll('.sequence-shot')).toHaveLength(1)
    expect(wrapper.get('.sequence-shot-prompt').text()).toBe('深灰石台上立着一只机械腕表，镜头缓缓向前推进')
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('深灰石台上立着一只机械腕表，镜头缓缓向前推进')
    expect(wrapper.get<HTMLInputElement>('#creator-video-duration').element.value).toBe('10')
    expect(wrapper.get('.video-duration-estimate .video-duration-value').text()).toBe('10 秒')
    wrapper.unmount()
  })

  it('downloads a URL-only generated image and saves self-contained bytes instead of its expiring URL', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockResolvedValue({ data: [{ url: 'https://temporary.example/new.png' }] })
    downloadImage.mockResolvedValue(new Blob(['original'], { type: 'image/png' }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('保存临时链接原图')
    await wrapper.get('.generate-button').trigger('click')
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed', outputs: ['data:image/png;base64,b3JpZ2luYWw='],
    })))
    expect(downloadImage).toHaveBeenCalledWith(image2Key.key, 'https://temporary.example/new.png')
    expect(wrapper.get('.result-media img').attributes('src')).toBe('data:image/png;base64,b3JpZ2luYWw=')
    wrapper.unmount()
  })

  it('shows a generated image before its original is saved to the browser', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockResolvedValue({ data: [{ url: 'https://temporary.example/fast.png' }] })
    let resolveDownload: ((value: Blob) => void) | undefined
    downloadImage.mockReturnValue(new Promise(resolve => { resolveDownload = resolve }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('先显示再保存')
    await wrapper.get('.generate-button').trigger('click')
    await vi.waitFor(() => expect(downloadImage).toHaveBeenCalledWith(image2Key.key, 'https://temporary.example/fast.png'))
    await flushPromises()
    // Still downloading the original, but the image is already on screen.
    expect(wrapper.get('.result-workspace.is-generating .result-card img').attributes('src')).toBe('https://temporary.example/fast.png')
    // The remote link may not load in an <img> (CORS); the card keeps loading instead of flashing an error.
    await wrapper.get('.result-workspace.is-generating .result-card img').trigger('error')
    expect(wrapper.find('.result-card .creator-image-feedback').exists()).toBe(false)
    expect(wrapper.find('.result-card .creator-image-skeleton').exists()).toBe(true)

    resolveDownload?.(new Blob(['original'], { type: 'image/png' }))
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed', outputs: ['data:image/png;base64,b3JpZ2luYWw='],
    })))
    await flushPromises()
    expect(wrapper.get('.result-media img').attributes('src')).toBe('data:image/png;base64,b3JpZ2luYWw=')
    wrapper.unmount()
  })

  it('titles the drawing view as saving once every image is on screen', async () => {
    putHistory.mockResolvedValue(true)
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockResolvedValueOnce({ data: [{ url: 'https://temporary.example/a.png' }] })
    generateImage.mockResolvedValueOnce({ data: [{ url: 'https://temporary.example/b.png' }] })
    downloadImage.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('两张都出来了')
    await wrapper.get('button[title="增加数量"]').trigger('click')
    await wrapper.get('.generate-button').trigger('click')
    await vi.waitFor(() => expect(downloadImage).toHaveBeenCalledTimes(2))
    await flushPromises()
    // Both images show while their originals are still being saved.
    expect(wrapper.get('.result-heading h2').text()).toBe('正在保存')
    wrapper.unmount()
  })

  it('explains a failed original-image save and retries it after the work is no longer on screen', async () => {
    putHistory.mockResolvedValue(true)
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockResolvedValue({ data: [{ url: 'https://temporary.example/expired.png' }] })
    downloadImage.mockRejectedValue(Object.assign(new Error('failed to download image'), { status: 502 }))
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('保存失败的原图')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    // A 502 is retried quietly first; the banner appears only after every retry failed.
    await vi.advanceTimersByTimeAsync(36_000)
    expect(wrapper.find('.local-save-warning').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(2_000)
    vi.useRealTimers()
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' })))
    await flushPromises()
    expect(downloadImage).toHaveBeenCalledTimes(5)
    const warning = wrapper.get('.local-save-warning')
    expect(warning.text()).toContain('作品「保存失败的原图」')
    expect(warning.text()).toContain('服务器从上游下载图片失败')
    expect(warning.text()).toContain('HTTP 502')

    // Leaving the work keeps the banner actionable for that work.
    await wrapper.get('.mode-option-video').trigger('click')
    await flushPromises()
    expect(wrapper.find('.local-save-warning-open').exists()).toBe(true)
    getHistory.mockImplementation(async (id: string) => putHistory.mock.calls.map(([item]) => item).reverse().find(item => item.id === id))
    downloadImage.mockResolvedValue(new Blob(['original'], { type: 'image/png' }))
    await wrapper.get('.local-save-warning-retry').trigger('click')
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
      outputs: ['data:image/png;base64,b3JpZ2luYWw='],
    }), expect.any(Number)))
    await vi.waitFor(() => expect(showSuccess).toHaveBeenCalledWith('原图已保存到浏览器本地'))
    expect(wrapper.find('.local-save-warning').exists()).toBe(false)
    wrapper.unmount()
  })

  it('retries a briefly failing original save without showing a warning', async () => {
    putHistory.mockResolvedValue(true)
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockResolvedValue({ data: [{ url: 'https://temporary.example/flaky.png' }] })
    downloadImage.mockRejectedValueOnce(Object.assign(new Error('failed to download image'), { status: 502 }))
    downloadImage.mockResolvedValue(new Blob(['original'], { type: 'image/png' }))
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('偶尔失败的原图')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2_000)
    vi.useRealTimers()
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed', outputs: ['data:image/png;base64,b3JpZ2luYWw='],
    })))
    expect(downloadImage).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.local-save-warning').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not retry an original save that cannot succeed', async () => {
    putHistory.mockResolvedValue(true)
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    generateImage.mockResolvedValue({ data: [{ url: 'https://temporary.example/forbidden.png' }] })
    downloadImage.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('无权下载的原图')
    await wrapper.get('.generate-button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.local-save-warning').exists()).toBe(true))
    expect(downloadImage).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.local-save-warning').text()).toContain('HTTP 403')
    wrapper.unmount()
  })

  it('recovers a still-valid historical link without generating a new image', async () => {
    const work = { id: 'recover-original', type: 'image', status: 'completed', prompt: '旧图',
      model: 'gpt-image-2', provider: 'image2', groupName: image2Group.name, groupId: image2Group.id,
      createdAt: 1, updatedAt: 1, outputs: ['https://temporary.example/old.png'] }
    listHistory.mockResolvedValue([work])
    getHistory.mockResolvedValue(work)
    putHistory.mockResolvedValue(true)
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    downloadImage.mockResolvedValue(new Blob(['original'], { type: 'image/png' }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await vi.waitFor(() => expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
      id: work.id, outputs: ['data:image/png;base64,b3JpZ2luYWw='],
    }), 1))
    expect(generateImage).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not recreate a historical work deleted while its original is downloading', async () => {
    const work = { id: 'deleted-during-recovery', type: 'image', status: 'completed', prompt: '删除旧图',
      model: 'gpt-image-2', provider: 'image2', groupName: image2Group.name,
      createdAt: 1, updatedAt: 1, outputs: ['https://temporary.example/deleted.png'] }
    listHistory.mockResolvedValue([work])
    getHistory.mockResolvedValue(undefined)
    downloadImage.mockResolvedValue(new Blob(['original'], { type: 'image/png' }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await vi.waitFor(() => expect(getHistory).toHaveBeenCalledWith(work.id))
    expect(putHistory).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('warns when browser storage only retains a generated work in memory', async () => {
    putHistory.mockResolvedValue(false)
    listGroups.mockResolvedValue([image2Group])
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await wrapper.get('#creator-prompt').setValue('本地空间不足')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.local-save-warning').text()).toContain('刷新后可能丢失')
    expect(wrapper.find('.result-media img').exists()).toBe(true)
    wrapper.unmount()
  })

})
