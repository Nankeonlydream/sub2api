import { config, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { ApiKey, Group } from '@/types'
import BaseDialog from '@/components/common/BaseDialog.vue'
import CreatorStudioView from '../CreatorStudioView.vue'
import StudioRouteCache from '@/components/common/StudioRouteCache.vue'
import { defineComponent, h, nextTick, ref } from 'vue'

config.global.stubs = { teleport: true, transition: true }

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
} = vi.hoisted(() => ({
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
  await wrapper.findAll('.video-capability-switch button').find(button => button.text() === 'Grok 视频')!.trigger('click')
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
      'Image 生图',
      'Grok 生图',
      'Banner 生图',
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
      await wrapper.findAll('.result-media-actions button')[1].trigger('click')
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
        await card.findAll('.result-media-actions button')[1].trigger('click')
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
      .mockRejectedValueOnce(Object.assign(new Error('Upstream request failed'), { status: 502 }))
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
    expect(wrapper.get('.partial-result-notice').text()).toContain('1 张未生成')
    expect(wrapper.get('.result-count-pill').text()).toBe('2 / 3 张')
    expect(wrapper.findAll('.result-card')).toHaveLength(2)
    expect(wrapper.findAll('button[title="下载作品"]')).toHaveLength(2)
    expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('已生成 2 / 3 张'))
    expect(showSuccess).not.toHaveBeenCalledWith('作品生成完成')
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
    expect(wrapper.get('.partial-result-notice').text()).toContain('已生成 3 / 4 张，1 张未生成')
    expect(wrapper.get('.partial-result-notice').text()).toContain('The string did not match the expected pattern.')
    expect(wrapper.findAll('button[title="下载作品"]')).toHaveLength(3)
    wrapper.unmount()
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
    submitImageTask.mockResolvedValue('imgtask_1')
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
    submitImageTask.mockResolvedValue('imgtask_next')
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
      expect(wrapper.find('.generation-state').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(3000)
      await flushPromises()
      expect(wrapper.find('.generation-state').exists()).toBe(false)
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
    expect(videoTabs.map(button => button.text())).toEqual(['Seedance 视频', 'Grok 视频', 'MiniMax H3 视频'])
    expect(videoTabs.map(button => button.attributes('disabled') !== undefined)).toEqual([false, false, false])
    expect(wrapper.get('.video-capability-switch button.active').text()).toBe('Seedance 视频')
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

  it('reopens collapsed history from the left toolbar without covering the workspace', async () => {
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

  it('renders a bounded history window and scrolls to older works without mounting original images', async ({ onTestFinished }) => {
    // jsdom omits Element.scrollTo; model the browser scroll event used by the virtualizer.
    const scrollToDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo')
    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      value(this: Element, options: ScrollToOptions) {
        if (typeof options.top === 'number') this.scrollTop = options.top
        if (typeof options.left === 'number') this.scrollLeft = options.left
        this.dispatchEvent(new Event('scroll'))
      },
    })
    onTestFinished(() => {
      if (scrollToDescriptor) Object.defineProperty(Element.prototype, 'scrollTo', scrollToDescriptor)
      else Reflect.deleteProperty(Element.prototype, 'scrollTo')
    })
    listHistory.mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({
      id: `large-history-${index}`, type: 'image', status: 'completed',
      prompt: `作品 ${index}`, model: 'grok-imagine-image', provider: 'grok', groupName: group.name,
      createdAt: 100 - index, updatedAt: 100 - index,
      outputs: [`data:image/png;base64,original-${index}`],
    })))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    expect(wrapper.get('.history-count').text()).toBe('100')
    expect(wrapper.findAll('.history-item').length).toBeLessThan(20)
    expect(wrapper.findAll('.history-preview img').every(img => !img.attributes('src'))).toBe(true)
    const list = wrapper.get('.history-list')
    list.element.scrollTop = 78 * 90
    await list.trigger('scroll')
    await flushPromises()
    expect(wrapper.findAll('.history-item').length).toBeLessThan(20)
    expect(wrapper.get('.history-list').text()).toContain('作品 90')
    await wrapper.get('[aria-label="打开作品：作品 90"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.result-media img').attributes('src')).toBe('data:image/png;base64,original-90')
    expect(wrapper.get('.result-media [role="status"]').text()).toContain('正在加载图片')
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    expect(wrapper.text()).toContain('还没有视频作品')
    await wrapper.findAll('.history-tabs button')[0].trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.get('.history-list').text()).toContain('作品 0'))
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

    expect(wrapper.find('.result-tags').text()).not.toContain('1K')
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

    // The card itself opens the work; only delete remains as a separate action.
    expect(wrapper.get('.history-item-actions').findAll('button')).toHaveLength(1)
    expect(wrapper.find('.history-item-actions [aria-label="打开作品"]').exists()).toBe(false)
    expect(wrapper.get('.history-preview .creator-thumbnail').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('.history-preview [role="img"]').attributes('aria-label')).toBe('缩略图加载中')
    expect(wrapper.find('.history-preview img').exists()).toBe(false)
    await wrapper.get('.history-item-hitbox').trigger('click')
    expect(wrapper.get('.history-item').classes()).toContain('active')
    expect(wrapper.text()).toContain('本次创作')

    await wrapper.get('.history-delete').trigger('click')
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
    expect(resultTags).not.toContain('4K')
    expect(resultTags).toContain('3840×2160')
    expect(resultTags).toContain('PNG')
    expect(wrapper.get('.result-actions .result-tags li:first-child').text()).toBe(work.model)
    expect(resultTags).not.toContain('文生')
    expect(grid.get('article.wide').text()).toContain('gemini-nano-banana-2.1')
    expect(grid.text()).toContain('3840×2160')
    expect(grid.text()).toContain('完成耗时')
    const prompt = grid.get('.result-prompt-cell .full-prompt')
    expect(prompt.text()).toBe(longPrompt)
    expect(prompt.classes()).toContain('clamped')

    const toggle = grid.get('.result-prompt-toggle')
    await toggle.trigger('click')
    expect(prompt.classes()).not.toContain('clamped')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.text()).toContain('收起')
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

  it('immediately regenerates a completed image with its historical settings', async () => {
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

    const regenerateButton = wrapper.findAll('.result-heading-actions button')
      .find(button => button.text().includes('重新生成'))
    expect(regenerateButton).toBeDefined()
    await regenerateButton!.trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(generateImage).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      model: work.model,
      prompt: work.prompt,
      n: 1,
      quality: work.quality,
      outputFormat: work.outputFormat,
      aspectRatio: work.aspectRatio,
      imageSize: work.resolution,
    }))
    expect(wrapper.text()).toContain('本次创作')
    expect(putHistory).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      outputs: ['data:image/png;base64,UE5H'],
      source: '重新生成',
    }))
    expect(showSuccess).toHaveBeenCalledWith('作品生成完成')
  })

  it('on mobile, returns the page to the top when regenerating a result', async () => {
    listHistory.mockResolvedValue([{
      id: 'mobile-regenerate-source', type: 'image', status: 'completed', prompt: '手机上重新生成', model: 'grok-imagine-image-quality',
      provider: 'Grok 生图', groupName: group.name, groupId: group.id, imageCapability: 'grok', createdAt: 1, updatedAt: 1,
      outputCount: 1, outputs: ['data:image/png;base64,T0xE'], aspectRatio: '1:1', resolution: '1K',
    }])
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'grok-imagine-image' }, { id: 'grok-imagine-image-quality' }])
    const restoreViewport = mockViewportWidth(390)
    const originalScrollIntoView = Element.prototype.scrollIntoView
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this) }
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
      await flushPromises()
      await wrapper.get('.toolbar-actions .history-drawer-toggle').trigger('click')
      await wrapper.get('[aria-label="打开作品：手机上重新生成"]').trigger('click')
      await flushPromises()
      windowScrollTo.mockClear()

      await wrapper.findAll('.result-heading-actions button')
        .find(button => button.text().includes('重新生成'))!
        .trigger('click')
      await flushPromises()
      expect(generateImage).toHaveBeenCalledTimes(1)
      expect(windowScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
      expect(scrolled).toHaveLength(0)
      wrapper.unmount()
    } finally {
      restoreViewport()
      Element.prototype.scrollIntoView = originalScrollIntoView
      windowScrollTo.mockRestore()
    }
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
    expect(showSuccess).toHaveBeenCalledWith(outputFormat === 'svg'
      ? '已加入参考图并带回参数，输出格式已自动切换为 PNG'
      : '已将作品加入参考图，并带回当时的生成参数')
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

  it('still explains the SVG format change when a reference image is uploaded directly', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    onTestFinished(() => wrapper.unmount())
    await flushPromises()
    await wrapper.get('#creator-format').setValue('svg')
    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['image'], 'reference.png', { type: 'image/png' })],
    })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.findAll('.reference-item')).toHaveLength(1)
    expect(wrapper.get<HTMLSelectElement>('#creator-format').element.value).toBe('png')
    expect(showWarning).toHaveBeenCalledTimes(1)
    expect(showWarning).toHaveBeenCalledWith('SVG 输出不支持参考图，已切换为 PNG')
    expect(showSuccess).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
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
    await wrapper.findAll('.result-media-actions button')[1].trigger('click')

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
    const downloadButton = wrapper.findAll('.result-media-actions button')[1]
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
      'grok-imagine-video-1.5', '2:3', '1080p', '10 秒', 'MP4', '参考图生',
    ])
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
      'grok-imagine-video', '16:9', '720p', '15 秒', 'MP4', '文生',
    ])
    expect(getVideoStatus).not.toHaveBeenCalled()
    expect(getVideoContent).not.toHaveBeenCalled()
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const downloadButton = wrapper.findAll('.result-media-actions button')[1]
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
    const button = wrapper.findAll('.result-media-actions button')[1]
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

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    expect(wrapper.get('.result-error').text()).toContain('视频服务暂时不可用')
    const parameters = wrapper.get('.result-parameters')
    expect(parameters.text()).toContain('完成耗时')
    expect(parameters.text()).toContain('3 段')
    expect(parameters.text()).toContain('完整提示词')
    wrapper.unmount()
  })

  it('resumes live progress when a historical video task is checked after a refresh', async () => {
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
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      expect(wrapper.get('.video-status-feedback').text()).toContain('当前进度 40%')

      await wrapper.get('.status-check-command').trigger('click')
      await flushPromises()
      expect(getVideoStatus).toHaveBeenCalledTimes(3)
      expect(wrapper.find('.generation-state').exists()).toBe(true)
      expect(wrapper.get('.generation-percent').text()).toBe('47%')

      await vi.advanceTimersByTimeAsync(4000)
      await flushPromises()
      expect(getVideoContent).toHaveBeenCalledWith(createdKey.key, work.requestId)
      expect(wrapper.find('.generation-state').exists()).toBe(false)
      expect(wrapper.get<HTMLVideoElement>('.result-media.video').attributes('src')).toBe('blob:creator-video')
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ id: work.id, status: 'completed' }))
      expect(showSuccess).toHaveBeenCalledWith('视频已生成并加载')
      expect(showError).not.toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the latest pending state inline when opening a historical video task', async () => {
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
    expect(wrapper.get('.video-status-feedback').text()).toContain('视频还在生成中，稍后可再次同步')
    expect(wrapper.get('.video-status-feedback').text()).toMatch(/\d{2}:\d{2}:\d{2} 已同步/)
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    expect(showError).not.toHaveBeenCalled()
    wrapper.unmount()
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
    expect(wrapper.get('.video-status-feedback').text()).toContain('视频还在生成中')
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

    expect(wrapper.get('.result-error').text()).toContain('未找到该视频任务')
    expect(wrapper.text()).not.toContain('Video request not found')
    expect(wrapper.find('.status-check-command').exists()).toBe(false)
    expect(wrapper.get('.result-parameters').text()).toContain('完整提示词')
    expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({
      id: work.id,
      status: 'failed',
      error: expect.stringContaining('任务可能已过期'),
    }))
    expect(showError).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows one localized error when a manual video status check finds an expired task', async () => {
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
      .mockRejectedValueOnce(Object.assign(new Error('Video request not found'), { status: 404 }))
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.history-tabs button')[1].trigger('click')
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    await wrapper.get('.status-check-command').trigger('click')
    await flushPromises()

    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('未找到该视频任务'))
    expect(showError).not.toHaveBeenCalledWith(expect.stringContaining('Video request not found'))
    expect(wrapper.get('.result-error').text()).toContain('任务可能已过期')
    expect(wrapper.find('.status-check-command').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([
    { model: 'Minimax-H3-768p-933-10s-15s', name: 'MiniMax H3 标清版 768p', resolution: '768p', seconds: 15 },
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
      name, '16:9', resolution, `${seconds} 秒`, 'MP4', '文生',
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
    expect(wrapper.get<HTMLVideoElement>('.complete-video-media').attributes('src')).toBe('blob:complete-video')
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
    expect(wrapper.get<HTMLAnchorElement>('.complete-video-card footer a').attributes('download')).toBe('creator-complete-multi-shot-video.mp4')
    expect(wrapper.findAll('.complete-video-card footer .result-tags li').map(tag => tag.text())).toEqual([
      'grok-imagine-video', '16:9', '720p', '总时长 10 秒', '2 个镜头', 'MP4',
    ])
    expect(wrapper.findAll('.result-segment-grid .result-card')).toHaveLength(2)
    expect(wrapper.findAll('.result-segment-grid .result-description p').map(item => item.text())).toEqual(['森林推进', '城市跟拍'])
    expect(wrapper.findAll('.result-segment-grid .result-tags').map(tags => tags.findAll('li').map(tag => tag.text()))).toEqual([
      ['grok-imagine-video', '16:9', '720p', '4 秒', 'MP4', '文生'],
      ['grok-imagine-video', '9:16', '1080p', '6 秒', 'MP4', '图生'],
    ])
    expect(wrapper.get('.result-prompt-cell .full-prompt').text()).toContain('镜头 1：森林推进')
    expect(wrapper.get('.result-prompt-cell .full-prompt').text()).toContain('镜头 2：城市跟拍')
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

    expect(wrapper.find('.generation-percent').exists()).toBe(false)
    expect(wrapper.get('.progress-track').classes()).toContain('indeterminate')
    resolveFirstStatus?.({ id: 'video-task-1', status: 'queued', progress: 0 })
    await flushPromises()
    expect(wrapper.find('.generation-percent').exists()).toBe(false)
    expect(wrapper.get('.progress-track').classes()).toContain('indeterminate')

    await vi.advanceTimersByTimeAsync(4000)
    resolveSecondStatus?.({ id: 'video-task-1', status: 'processing' })
    await flushPromises()
    expect(wrapper.get('.generation-percent').text()).toBe('1%')
    expect(wrapper.get('.progress-track').classes()).not.toContain('indeterminate')

    await vi.advanceTimersByTimeAsync(4000)
    resolveThirdStatus?.({ id: 'video-task-1', status: 'processing', progress: 0 })
    await flushPromises()
    expect(wrapper.get('.generation-percent').text()).toBe('1%')

    await vi.advanceTimersByTimeAsync(4000)
    resolveFourthStatus?.({ id: 'video-task-1', status: 'pending', progress: 12 })
    await flushPromises()
    expect(wrapper.get('.generation-percent').text()).toBe('12%')
    expect(wrapper.get('.progress-track').classes()).not.toContain('indeterminate')
    expect(wrapper.get('.progress-track > span').attributes('style')).toContain('width: 12%')

    await vi.advanceTimersByTimeAsync(4000)
    await flushPromises()
    expect(wrapper.find('.generation-percent').exists()).toBe(false)

    expect(wrapper.find('.generation-state').exists()).toBe(false)
    vi.useRealTimers()
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

    expect(wrapper.get('.generation-percent').text()).toBe('1%')
    await vi.advanceTimersByTimeAsync(28_000)
    await flushPromises()

    const estimatedProgress = Number.parseInt(wrapper.get('.generation-percent').text(), 10)
    expect(estimatedProgress).toBeGreaterThanOrEqual(10)
    expect(estimatedProgress).toBeLessThan(100)
    expect(wrapper.get('.progress-track > span').attributes('style')).toContain(`width: ${estimatedProgress}%`)

    getVideoStatus.mockResolvedValue({ id: 'video-task-1', status: 'completed' })
    await vi.advanceTimersByTimeAsync(4_000)
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(false)
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

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('grok-imagine-video-1.5')
    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('image')

    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video-1.5')
    expect(wrapper.get('.reference-field').text()).toContain('源图')
    expect(wrapper.get('.reference-field').text()).toContain('必选，仅 1 张')

    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('reference')

    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video-1.5')
    expect(wrapper.get<HTMLSelectElement>('#creator-model').findAll('option').map(option => option.text())).toEqual([
      'grok-imagine-video-1.5',
    ])
    expect(wrapper.get('.reference-field').text()).toContain('参考图')
    expect(wrapper.get('.reference-field').text()).toContain('最多 7 张')
    wrapper.unmount()
  })

  it('disables reference-to-video when the group has no 1.5 model', async () => {
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
    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('reference')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('保持主体一致')

    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('')
    expect(wrapper.get<HTMLSelectElement>('#creator-model').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.model-compatibility-error').text()).toContain('当前分组没有 Grok Imagine Video 1.5')
    expect(wrapper.get<HTMLButtonElement>('.generate-button').attributes('disabled')).toBeDefined()
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

    const references = [
      new File(['source-one'], 'source-one.png', { type: 'image/png' }),
      new File(['source-two'], 'source-two.png', { type: 'image/png' }),
    ]
    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: references })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.findAll('.reference-item')).toHaveLength(1)
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video-1.5')
    expect(showError).toHaveBeenCalledWith('已保留前 1 张有效参考图')

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

  it('creates MiniMax H3 video only in priced MiniMax groups and lists only the 10-15s tiers', async () => {
    const h3Group = { ...group, id: 7700, name: 'MiniMax', description: '', platform: 'minimax', video_model_prices: { 'minimax-h3': { '768p': 0.1, '1440p': 0.15, 'minimaxh3-768': 0.08, 'xminimex-h3': 0.2 } } } as Group
    const textGroup = { ...group, id: 7701, name: 'MiniMax 文本', description: '', platform: 'minimax' } as Group
    const h3Key = { ...createdKey, id: 30, key: 'sk-h3', group_id: h3Group.id, group: h3Group } as ApiKey
    listGroups.mockResolvedValue([group, h3Group, textGroup])
    listKeys.mockResolvedValue({ items: [h3Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([
      { id: 'Minimax-H3-768p-933-10s-15s' },
      { id: 'minimaxh3-768' },
      { id: 'MiniMax-H3-933-1440p-10s' },
      { id: 'MiniMax-H3-933-1440p-10-15s' },
      { id: 'xminimex-h3' },
      { id: 'MiniMax-M2' },
    ])
    listKeys.mockResolvedValue({ items: [createdKey, h3Key], total: 2, page: 1, page_size: 100, pages: 1 })
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()
    await openGrokVideo(wrapper)
    await flushPromises()
    expect(wrapper.findAll('#creator-group option').map(option => option.text())).toEqual([group.name])
    await wrapper.findAll('.video-capability-switch button')[2].trigger('click')
    await flushPromises()

    expect(wrapper.findAll('#creator-group option').map(option => option.text())).toEqual(['MiniMax'])
    expect(wrapper.findAll('#creator-model option').map(option => option.text()))
      .toEqual([
        'MiniMax H3 标清版 768p · 8种画幅',
        'MiniMax H3 标清版 768p · 高速并发',
        'MiniMax H3 高清版 2K · 8种画幅',
        'MiniMax H3 高清版 2K · 原生不卡脸',
      ])
    expect(wrapper.get('[data-testid="minimax-tier-hint"]').text()).toBe('按秒 · 10–15秒 · 8种画幅')
    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('text')
    expect(wrapper.get('#video-generation-method option[value="text"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('#video-generation-method option[value="image"]').attributes('disabled')).toBeDefined()
    expect(await videoResolutionChoices(wrapper)).toEqual(['768p'])
    // The 8s default snaps up to the 10s tier minimum.
    expect(wrapper.get<HTMLInputElement>('#creator-video-duration').element.value).toBe('10')
    expect(wrapper.findAll('.video-control-row button').map(button => button.attributes('disabled') !== undefined)).toEqual([true, false])
    await wrapper.findAll('.video-control-row button')[1].trigger('click')
    expect(wrapper.get<HTMLInputElement>('#creator-video-duration').element.value).toBe('11')
    // Typed durations are clamped to the tier range on commit.
    await wrapper.get('#creator-video-duration').setValue('99')
    expect(wrapper.get<HTMLInputElement>('#creator-video-duration').element.value).toBe('15')
    await wrapper.get('#creator-video-duration').setValue('13')
    expect(wrapper.get<HTMLInputElement>('#creator-video-duration').element.value).toBe('13')
    await wrapper.get('#creator-video-duration').setValue('')
    expect(wrapper.get<HTMLInputElement>('#creator-video-duration').element.value).toBe('13')
    await wrapper.get('#creator-video-duration').setValue('11')

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('MiniMax-H3-933-1440p-10-15s')
    await flushPromises()
    expect(await videoResolutionChoices(wrapper)).toEqual(['1440p'])
    expect(wrapper.get<HTMLInputElement>('#creator-video-duration').element.value).toBe('11')
    await wrapper.get('#video-params').trigger('click')
    expect(videoParamsDialog(wrapper).findAll('.image-ratio-grid button').map(button => button.attributes('data-ratio')))
      .toEqual(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'])
    await videoParamsDialog(wrapper).get('.image-size-cancel').trigger('click')

    await wrapper.findAll('.video-control-row button')[1].trigger('click')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('海边木栈道慢步')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(1))
    expect(createVideo).toHaveBeenCalledWith('sk-h3', expect.objectContaining({
      model: 'MiniMax-H3-933-1440p-10-15s',
      duration: 12,
      resolution: '1440p',
    }))
    wrapper.unmount()
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
    await wrapper.findAll('.mode-option')[1].trigger('click')
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
      expect(wrapper.get('.generation-state').text()).toContain('自动重试（1/2）')

      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      expect(createVideo).toHaveBeenCalledTimes(2)
      expect(wrapper.get('.generation-state').text()).toContain('自动重试（2/2）')

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
      expect(wrapper.get('.generation-state').text()).toContain('状态查询暂时失败，正在自动重试（1/4）')
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
    const h3Group = { ...group, id: 7700, name: 'MiniMax', description: '', platform: 'minimax', video_model_prices: { 'minimax-h3': { '768p': 0.1 } } } as Group
    const h3Key = { ...createdKey, id: 30, key: 'sk-h3', group_id: h3Group.id, group: h3Group } as ApiKey
    listGroups.mockResolvedValue([group, h3Group])
    listKeys.mockResolvedValue({ items: [createdKey, h3Key], total: 2, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'Minimax-H3-768p-933-10s' }])
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
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    try {
      await flushPromises()
      await wrapper.findAll('.history-tabs button')[1].trigger('click')
      await wrapper.get('.history-item-hitbox').trigger('click')
      await flushPromises()
      expect(wrapper.get('.result-error').text()).toContain('生成失败')

      await wrapper.get('.status-check-command').trigger('click')
      await flushPromises()
      expect(wrapper.find('video').exists()).toBe(true)
      expect(putHistory).toHaveBeenLastCalledWith(expect.objectContaining({ id: work.id, status: 'completed', error: undefined }))
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
      await flushPromises()

      expect(createVideo).toHaveBeenCalledTimes(3)
      expect(showError).not.toHaveBeenCalled()
      expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('已生成 2 / 3 段'))
      expect(composeVideoSegments).toHaveBeenCalledTimes(1)
      expect(composeVideoSegments.mock.calls[0][0]).toHaveLength(2)
      expect(wrapper.find('.result-error').exists()).toBe(false)
      expect(wrapper.get('.partial-result-notice').text()).toContain('镜头 2')
      expect(wrapper.get('.partial-result-notice').text()).toContain('Invalid URL')
      expect(wrapper.findAll('.result-segment-grid .result-description strong').map(item => item.text())).toEqual(['Grok 视频 · 镜头 1', 'Grok 视频 · 镜头 3'])
      expect(wrapper.findAll('.result-segment-grid .result-description p').map(item => item.text())).toEqual(['第一个镜头', '第三个镜头'])
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
      expect(wrapper.get('.generation-state').text()).toContain('正在同时生成 2 个镜头（已完成 1 个）')
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
    ['image2', 'gpt-image-2', 'Upstream service temporarily unavailable', 502, 'GPT Image 上游服务暂时不可用'],
    ['banner', 'gemini-3.1-flash-image', 'Upstream service temporarily unavailable', 502, 'Gemini（Banana） 上游服务暂时不可用'],
  ] as const)('names the %s provider instead of Grok for upstream failures (%#)', async (capability, model, upstreamMessage, status, expected) => {
    const isImage2 = capability === 'image2'
    listGroups.mockResolvedValue([isImage2 ? image2Group : bananaGroup])
    listKeys.mockResolvedValue({ items: [isImage2 ? image2Key : bananaKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: model }])
    generateImage.mockRejectedValueOnce(Object.assign(new Error(upstreamMessage), { status }))
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[isImage2 ? 0 : 2].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('上游错误提示')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    // Only Grok image requests are retried automatically.
    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith(expect.stringContaining(expected))
    expect(wrapper.text()).toContain(expected)
    expect(wrapper.text()).not.toContain('Grok 上游服务暂时不可用')
    wrapper.unmount()
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
    expect(wrapper.get('.generation-state').text()).toContain('2 秒后自动重试（1/1）')
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
      expect(wrapper.get('.generation-state').text()).toContain('正在绘制你的画面')
      expect(wrapper.find('.generation-frame-ring').exists()).toBe(true)
      expect(wrapper.get('.generate-button').attributes('disabled')).toBeDefined()
      finish({ data: [{ url: '/completed-away.png' }] })
      await flushPromises()
    }
    expect(wrapper.find('.generation-state').exists()).toBe(false)
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
      expect(wrapper.get('.generation-state').text()).toContain('正在同时生成 2 张图片')
      expect(Array.from(wrapper.get<HTMLElement>('.generation-state').element.children, child => child.classList.item(0))).toEqual([
        'generation-panel',
        'generation-stage',
      ])
      // Both images are requested at once, so both ratio-shaped frames are drawing.
      expect(generateImage.mock.calls.map(call => call[1].prompt)).toEqual(['第一组图', '第一组图'])
      expect(wrapper.findAll('.generation-frame').map(frame => frame.classes().find(name => name.startsWith('is-')))).toEqual(['is-current', 'is-current'])
      expect(wrapper.get('.generation-done-count').text()).toContain('0 / 2')
      expect(wrapper.get('.generation-prompt').text()).toContain('第一组图')
      expect(wrapper.findAll('.generation-tags li').length).toBeGreaterThan(0)
      expect(wrapper.find('a.new-creation-link').exists()).toBe(false)
      await wrapper.get('.generation-state button.new-creation-link').trigger('click')
      expect(settings.scrollTop).toBe(420)
      expect(promptFocus).not.toHaveBeenCalled()
      promptFocus.mockRestore()
      expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('')
      expect(wrapper.find('.generation-state').exists()).toBe(false)
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
      expect(wrapper.get('.generation-state').text()).toContain('正在同时生成 2 张图片')
      await wrapper.findAll('.history-item-hitbox')[0].trigger('click')
      await flushPromises()
      expect(wrapper.get('.generation-state').text()).toContain('正在调用图片模型')
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

  it('caps mobile image generation frames at two columns', async () => {
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

      expect(wrapper.findAll('.generation-frame')).toHaveLength(4)
      expect(wrapper.get('.generation-stage').element.style.getPropertyValue('--generation-mobile-columns')).toBe('2')
    } finally {
      wrapper.unmount()
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
      expect(wrapper.findAll('.generation-frame').map(frame => frame.classes().find(name => name.startsWith('is-')))).toEqual(['is-done', 'is-current'])
      // Only the finished frame is interactive.
      expect(wrapper.findAll('.generation-frame-open')).toHaveLength(1)

      await wrapper.get('.generation-frame-open').trigger('click')
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

      await wrapper.get('.generation-frame-download').trigger('click')
      await flushPromises()
      expect(downloaded?.href).toBe('data:image/png;base64,Rmlyc3Q=')
      expect(downloaded?.filename).toMatch(/^creator-\d+-1\.png$/)
      expect(wrapper.find('.generation-state').exists()).toBe(true)

      await wrapper.get('.generation-frame-action.is-preview').trigger('click')
      expect(wrapper.getComponent('.image-preview-content').props('src')).toBe('data:image/png;base64,Rmlyc3Q=')
      await wrapper.get('.preview-close').trigger('click')

      // Editing hands the finished image to the form while the rest keep drawing.
      await wrapper.get('.generation-frame-edit').trigger('click')
      await flushPromises()
      expect(wrapper.find('.generation-state').exists()).toBe(false)
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
    await wrapper.get('.generation-state .new-creation-link').trigger('click')
    await wrapper.get('#creator-prompt').setValue('任务 B')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="打开作品：历史图片"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.result-media img').attributes('src')).toBe('/old.png')
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    expect(wrapper.findAll('.history-item.generating')).toHaveLength(2)
    if (outcome === 'failed') failFirst(new Error('No available compatible accounts'))
    else finishFirst({ data: [{ url: '/a.png' }] })
    await flushPromises()
    expect(wrapper.get('.result-media img').attributes('src')).toBe('/old.png')
    expect(wrapper.findAll('.history-item.generating')).toHaveLength(1)
    await wrapper.get('.history-item.generating .history-item-hitbox').trigger('click')
    await flushPromises()
    expect(wrapper.get('.generation-state').text()).toContain('正在绘制你的画面')
    await wrapper.get('.generation-state .new-creation-link').trigger('click')
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
    await wrapper.get('button[title="刷新工作台状态"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(true)
    expect(wrapper.findAll('.history-item-hitbox')).toHaveLength(1)
    expect(wrapper.get('.history-delete').attributes('disabled')).toBeDefined()
    save()
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(false)
    expect(wrapper.get('.history-delete').attributes('disabled')).toBeUndefined()
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
    expect(wrapper.get('.generation-state').text()).toContain('正在制作你的视频')
    expect(getVideoStatus).toHaveBeenCalledTimes(1)
    await wrapper.findAll('.history-tabs button')[0].trigger('click')
    await wrapper.get('[aria-label="打开作品：前台图片"]').trigger('click')
    await flushPromises()
    finishVideo({ id: 'video-task-1', status: 'completed' })
    await flushPromises()
    expect(wrapper.get('.generation-state').text()).toContain('正在绘制你的画面')
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
    expect(heading.text()).toContain('生成结果')
    expect(heading.text()).not.toContain('等待生成结果')
    expect(heading.get('.result-count-pill').text()).toBe('2 张')
    expect(heading.text()).toContain('重新生成')
    expect(heading.text()).toContain('新建创作')
    expect(wrapper.text()).not.toContain('当前请求使用你的 Sub2API Key')
    const parameters = wrapper.get('.result-parameters')
    expect(parameters.text()).toContain('gemini-nano-banana-2.1')
    expect(parameters.text()).toContain('提交时间')
    expect(parameters.text()).not.toContain('完成耗时')
    expect(parameters.text()).toContain('已保存的花朵')
    wrapper.unmount()
  })

  it('shows work parameters for failed and unfinished image works', async () => {
    const failed = {
      id: 'failed-image', type: 'image', status: 'failed', prompt: '失败的雪山日出',
      model: 'gpt-image-2.5-sunburst', provider: 'Image2 生图', groupName: group.name,
      createdAt: 1, updatedAt: 5_000, outputCount: 2, outputs: [], error: '上游超时',
    }
    const pending = {
      id: 'pending-image', type: 'image', status: 'pending', prompt: '仍在生成的草原',
      model: 'gpt-image-2.5-sunburst', provider: 'Image2 生图', groupName: group.name,
      createdAt: 2, updatedAt: 2, outputCount: 1, outputs: [],
    }
    listHistory.mockResolvedValue([pending, failed])
    const wrapper = mount(CreatorStudioView, { global: { stubs: { Icon: IconStub, AppLayout: AppLayoutStub } } })
    await flushPromises()

    const items = wrapper.findAll('.history-item-hitbox')
    await items[1].trigger('click')
    await flushPromises()
    expect(wrapper.get('.result-error').text()).toContain('上游超时')
    const failedHeading = wrapper.get('.result-heading-actions')
    expect(failedHeading.text()).toContain('删除')
    expect(failedHeading.text()).toContain('重新生成')
    expect(failedHeading.text()).toContain('新建创作')
    expect(failedHeading.text()).not.toContain('一键下载')
    let parameters = wrapper.get('.result-parameters')
    expect(parameters.text()).toContain('gpt-image-2.5-sunburst')
    expect(parameters.text()).toContain('2 张')
    expect(parameters.text()).toContain('完成耗时')
    expect(parameters.text()).toContain('失败的雪山日出')

    await items[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('正在等待图片结果')
    expect(wrapper.get('.result-heading-actions').text()).not.toContain('重新生成')
    parameters = wrapper.get('.result-parameters')
    expect(parameters.text()).toContain('提交时间')
    expect(parameters.text()).not.toContain('完成耗时')
    expect(parameters.text()).toContain('仍在生成的草原')
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
    await wrapper.get('button[title="刷新工作台状态"]').trigger('click')
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

    expect(wrapper.get('.generation-metrics').text()).toContain('已用时')
    expect(wrapper.get('.progress-track').classes()).toContain('indeterminate')
    expect(wrapper.get('.progress-track').attributes('aria-valuenow')).toBeUndefined()

    releasePendingHistory?.()
    await flushPromises()
    expect(generateImage).toHaveBeenCalled()
    expect(wrapper.get('.progress-track').classes()).toContain('indeterminate')

    finishImage?.({ data: [{ url: 'data:image/png;base64,UE5H' }] })
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(false)
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
    expect(wrapper.get('.progress-track').classes()).toContain('indeterminate')
    expect(wrapper.find('.generation-percent').exists()).toBe(false)

    finishVideoSubmission?.({ id: 'video-task-1' })
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(false)
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
    expect(wrapper.get('.generation-state').text()).toContain('正在绘制你的画面')

    await openGrokVideo(wrapper)
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(false)
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
    expect(wrapper.get('.generation-state').text()).toContain('正在绘制你的画面')

    finishImage?.({ data: [{ url: 'data:image/png;base64,UE5H' }] })
    await flushPromises()
    expect(wrapper.find('.generation-state').exists()).toBe(false)
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
