import { config, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiKey, Group } from '@/types'
import BaseDialog from '@/components/common/BaseDialog.vue'
import CreatorStudioView from '../CreatorStudioView.vue'

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
  createVideo,
  getVideoStatus,
  getVideoContent,
  showError,
  showInfo,
  showSuccess,
} = vi.hoisted(() => ({
  createKey: vi.fn(),
  listKeys: vi.fn(),
  listModels: vi.fn(),
  listGroups: vi.fn(),
  listHistory: vi.fn(),
  putHistory: vi.fn(),
  removeHistory: vi.fn(),
  generateImage: vi.fn(),
  createVideo: vi.fn(),
  getVideoStatus: vi.fn(),
  getVideoContent: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
  showSuccess: vi.fn(),
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
  createCreatorVideo: createVideo,
  getCreatorVideoStatus: getVideoStatus,
  getCreatorVideoContent: getVideoContent,
}))

vi.mock('@/services/creatorHistory', () => ({
  creatorHistory: {
    list: listHistory,
    put: putHistory,
    remove: removeHistory,
    clear: vi.fn(),
  },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ showError, showInfo, showSuccess }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ resolve: () => ({ href: '/creator' }) }),
}))

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

describe('CreatorStudioView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listGroups.mockResolvedValue([group])
    listKeys.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100, pages: 0 })
    listHistory.mockResolvedValue([])
    listModels.mockResolvedValue([{ id: 'grok-imagine-image' }])
    createKey.mockResolvedValue(createdKey)
    putHistory.mockResolvedValue(undefined)
    removeHistory.mockResolvedValue(undefined)
    generateImage.mockResolvedValue({ data: [{ url: 'data:image/png;base64,UE5H' }] })
    createVideo.mockResolvedValue({ id: 'video-task-1' })
    getVideoStatus.mockResolvedValue({
      id: 'video-task-1',
      status: 'completed',
      url: '/v1/videos/video-task-1/content',
    })
    getVideoContent.mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }))
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:creator-video'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('creates and activates a group-bound key without navigating away', async () => {
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
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

  it('uses compact labels for Grok image models', async () => {
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

    expect(wrapper.findAll('.capability-switch .online-dot')).toHaveLength(3)
    expect(wrapper.get<HTMLSelectElement>('#creator-model').findAll('option').map(option => option.text())).toEqual([
      'Grok 标准版生图',
      'Grok 高质量版生图',
    ])
    expect(wrapper.get<HTMLSelectElement>('#creator-aspect').findAll('option').map(option => option.attributes('value'))).toEqual([
      '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20', 'auto',
    ])
    expect(wrapper.get<HTMLSelectElement>('#creator-resolution').findAll('option').map(option => option.text())).toEqual([
      '1K · 1024',
      '2K · 2048',
    ])
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
    expect(wrapper.get<HTMLSelectElement>('#creator-aspect').findAll('option').map(option => option.attributes('value'))).toEqual([
      '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9',
    ])
    expect(wrapper.get<HTMLSelectElement>('#creator-resolution').findAll('option').map(option => option.text())).toEqual([
      '1K · 快速', '2K · 高清', '4K · 超清',
    ])

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('Banana 宽幅图片')
    await wrapper.get<HTMLSelectElement>('#creator-aspect').setValue('21:9')
    await wrapper.get<HTMLSelectElement>('#creator-resolution').setValue('4K')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(generateImage).toHaveBeenCalledWith(bananaKey.key, expect.objectContaining({
      protocol: 'gemini',
      aspectRatio: '21:9',
      imageSize: '4K',
    }))
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
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-image')

    await wrapper.findAll('.capability-switch button')[1].trigger('click')
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
    expect(wrapper.text()).toContain('作品仅保存在当前浏览器')

    await wrapper.get('.prompt-toggle').trigger('click')
    expect(wrapper.findAll('.prompt-template-grid button')).toHaveLength(6)
    expect(wrapper.get('.prompt-toggle').text()).toBe('收起')

    const nextPage = wrapper.findAll('.prompt-page-actions button')[1]
    await nextPage.trigger('click')
    expect(wrapper.find('.prompt-page-actions > span').text()).toBe('2/3')
    expect(wrapper.findAll('.prompt-template-grid button')).toHaveLength(6)

    await nextPage.trigger('click')
    expect(wrapper.find('.prompt-page-actions > span').text()).toBe('3/3')
    expect(wrapper.findAll('.prompt-template-grid button')).toHaveLength(6)

    await wrapper.get('.prompt-toggle').trigger('click')
    expect(wrapper.find('.prompt-template-grid').exists()).toBe(false)

    await wrapper.findAll('.mode-option')[1].trigger('click')
    await flushPromises()
    expect(wrapper.get('.video-capability-card').text()).toContain('Grok 生视频')
    expect(wrapper.get('.video-capability-card').text()).toContain('使用独立的视频分组和用户 Key')
    await wrapper.get('.prompt-toggle').trigger('click')
    expect(wrapper.find('.prompt-page-actions > span').text()).toBe('1/3')
    expect(wrapper.findAll('.prompt-template-grid button')).toHaveLength(6)
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

  it('automatically rotates featured briefs every three seconds', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    expect(wrapper.get('.brief-topline > span:nth-child(2)').text()).toBe('01 / 18')
    expect(wrapper.get('.brief-summary h3').text()).toBe('月光猫影')

    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.get('.brief-topline > span:nth-child(2)').text()).toBe('02 / 18')
    await vi.advanceTimersByTimeAsync(250)
    expect(wrapper.get('.brief-summary h3').text()).toBe('雨夜电车')

    await wrapper.findAll('.brief-topline button')[0].trigger('click')
    expect(wrapper.get('.brief-topline > span:nth-child(2)').text()).toBe('01 / 18')
    await vi.advanceTimersByTimeAsync(2999)
    expect(wrapper.get('.brief-topline > span:nth-child(2)').text()).toBe('01 / 18')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.get('.brief-topline > span:nth-child(2)').text()).toBe('02 / 18')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('shows only the file-size error when an oversized reference image is selected', async () => {
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    const oversized = new File(['oversized'], 'large-reference.png', { type: 'image/png' })
    Object.defineProperty(oversized, 'size', { value: 5 * 1024 * 1024 + 1 })
    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [oversized] })
    await input.trigger('change')

    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith('large-reference.png 超过 5MB')
    expect(wrapper.find('.reference-item').exists()).toBe(false)
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

    expect(wrapper.get('.history-item-actions').findAll('button')).toHaveLength(2)
    await wrapper.get('.history-item-hitbox').trigger('click')
    expect(wrapper.get('.history-item').classes()).toContain('active')
    expect(wrapper.text()).toContain('本次创作')

    await wrapper.get('.history-delete').trigger('click')
    await flushPromises()
    expect(removeHistory).toHaveBeenCalledWith(work.id)
    expect(wrapper.find('.history-item').exists()).toBe(false)
    expect(wrapper.text()).toContain('还没有图片作品')
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
    expect(wrapper.get<HTMLSelectElement>('#creator-aspect').element.value).toBe('2:1')
    expect(wrapper.get<HTMLSelectElement>('#creator-resolution').element.value).toBe('2K')
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

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()

    const regenerateButton = wrapper.findAll('.result-heading-actions button')
      .find(button => button.text().includes('再次生成'))
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
      source: '再次生成',
    }))
    expect(showSuccess).toHaveBeenCalledWith('作品生成完成')
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
    await wrapper.get('[aria-label="编辑这张照片"]').trigger('click')
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.find('.result-workspace').exists()).toBe(false)
    expect(wrapper.findAll('.reference-item')).toHaveLength(1)
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe(work.prompt)
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe(work.model)
    expect(wrapper.get<HTMLSelectElement>('#creator-aspect').element.value).toBe('4:3')
    expect(wrapper.get<HTMLSelectElement>('#creator-resolution').element.value).toBe('2K')
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

  it('keeps a referenced Image2 history item on the standard model for a non-4K size', async () => {
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
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledWith(image2Key.key, expect.objectContaining({
      model: 'gpt-image-2',
      size: '1536x656',
      referenceImages: [expect.any(File)],
    }))
    expect(generateImage.mock.calls.at(-1)?.[1].model).not.toContain('4k')
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
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }])
    let resolveFetch: ((value: unknown) => void) | undefined
    const fetchMock = vi.fn().mockReturnValue(new Promise(resolve => { resolveFetch = resolve }))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()
    await wrapper.get('.history-item-hitbox').trigger('click')
    await flushPromises()
    const button = wrapper.get('[aria-label="编辑这张照片"]')
    await button.trigger('click')
    await button.trigger('click')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(button.attributes('disabled')).toBeDefined()

    resolveFetch?.({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })),
    })
    await flushPromises()
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

  it('downloads a legacy cross-origin image through a local blob URL', async () => {
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
    const imageBlob = new Blob(['image'], { type: 'image/png' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(imageBlob),
    })
    vi.stubGlobal('fetch', fetchMock)
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
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(work.outputs[0])
    expect(URL.createObjectURL).toHaveBeenCalledWith(imageBlob)
    expect(downloaded?.href).toBe('blob:creator-video')
    expect(downloaded?.filename).toMatch(/^creator-\d+-1\.png$/)
    expect(showError).not.toHaveBeenCalled()
    anchorClick.mockRestore()
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

    await wrapper.findAll('.mode-option')[1].trigger('click')
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
    expect(showError).not.toHaveBeenCalled()
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
      resolution: '720p',
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
    expect(wrapper.get<HTMLSelectElement>('#video-aspect').element.value).toBe('2:3')
    expect(wrapper.get('.reference-field').text()).toContain('当时使用了 3 张参考图')
    wrapper.unmount()
  })

  it('shows the latest pending state inline after checking a historical video task', async () => {
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
    expect(wrapper.get('.video-status-feedback').text()).toContain('任务仍在生成中，请稍后再试')

    await wrapper.get('.status-check-command').trigger('click')
    await flushPromises()

    expect(getVideoStatus).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.video-status-feedback').text()).toMatch(/最近检查 \d{2}:\d{2}:\d{2}/)
    expect(showInfo).toHaveBeenCalledWith('任务仍在生成中，请稍后再试')
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
    expect(wrapper.get('.video-status-feedback').text()).toContain('任务仍在生成中')
    expect(showError).not.toHaveBeenCalled()
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
    expect(wrapper.get<HTMLAnchorElement>('.complete-video-card footer a').attributes('download')).toBe('creator-complete-multi-shot-video.mp4')
    expect(wrapper.findAll('.result-segment-grid .result-card')).toHaveLength(2)
    expect(wrapper.findAll('.result-segment-grid .result-description p').map(item => item.text())).toEqual(['森林推进', '城市跟拍'])
    expect(wrapper.get('.result-parameter-details .full-prompt').text()).toContain('镜头 1：森林推进')
    expect(wrapper.get('.result-parameter-details .full-prompt').text()).toContain('镜头 2：城市跟拍')
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
    await wrapper.findAll('.mode-option')[1].trigger('click')
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
    await wrapper.findAll('.mode-option')[1].trigger('click')
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

  it('keeps both video models selectable without changing them when the generation method changes', async () => {
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

    expect(wrapper.get<HTMLSelectElement>('#creator-model').findAll('option').map(option => option.text())).toEqual([
      'Grok Imagine 视频 · 标准版',
      'Grok Imagine 1.5 视频 · 图生版',
    ])
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video')
    expect(wrapper.get('#creator-model').text()).not.toContain('grok-imagine-video')
    expect(wrapper.get<HTMLSelectElement>('#video-generation-method').element.value).toBe('text')
    expect(wrapper.find('.reference-field').exists()).toBe(false)
    expect(wrapper.get<HTMLSelectElement>('#video-aspect').findAll('option').map(option => option.element.value)).toEqual([
      '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3',
    ])

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('grok-imagine-video-1.5')
    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('image')

    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video-1.5')
    expect(wrapper.get('.reference-field').text()).toContain('源图')
    expect(wrapper.get('.reference-field').text()).toContain('必选，仅 1 张')

    await wrapper.get<HTMLSelectElement>('#video-generation-method').setValue('reference')

    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('grok-imagine-video-1.5')
    expect(wrapper.get('.reference-field').text()).toContain('参考图')
    expect(wrapper.get('.reference-field').text()).toContain('最多 7 张')
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
    await wrapper.findAll('.mode-option')[1].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('grok-imagine-video-1.5')
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

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('让源图中的人物自然转身')
    await wrapper.get<HTMLSelectElement>('#video-aspect').setValue('4:3')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(1))

    expect(createVideo).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      model: 'grok-imagine-video-1.5',
      aspectRatio: '4:3',
      imageDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      referenceImageDataUrls: undefined,
    }))
    wrapper.unmount()
  })

  it('keeps seven reference images and submits them through reference-to-video', async () => {
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
    await wrapper.get<HTMLSelectElement>('#video-aspect').setValue('2:3')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(createVideo).toHaveBeenCalledTimes(1))

    expect(createVideo).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      model: 'grok-imagine-video',
      aspectRatio: '2:3',
      imageDataUrl: undefined,
      referenceImageDataUrls: expect.arrayContaining([
        expect.stringMatching(/^data:image\/png;base64,/),
      ]),
    }))
    expect(createVideo.mock.calls[0][1].referenceImageDataUrls).toHaveLength(7)
    wrapper.unmount()
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
    await wrapper.findAll('.mode-option')[1].trigger('click')
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

  it('keeps a 1:1 image request at 1024x1024 and lets the result follow its intrinsic height', async () => {
    listKeys.mockResolvedValue({ items: [createdKey], total: 1, page: 1, page_size: 100, pages: 1 })
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('正方形森林肖像')
    await wrapper.get<HTMLSelectElement>('#creator-aspect').setValue('1:1')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledWith(createdKey.key, expect.objectContaining({
      aspectRatio: '1:1',
      size: '1024x1024',
      responseFormat: 'b64_json',
    }))
    expect(wrapper.get<HTMLElement>('.result-media').attributes('style')).toBeUndefined()
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

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('宽屏海底晚宴')
    await wrapper.get<HTMLSelectElement>('#creator-aspect').setValue('16:9')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    const media = wrapper.get<HTMLElement>('.result-media')
    expect(media.classes()).toContain('landscape')
    expect(media.attributes('style')).toContain('aspect-ratio: 16 / 9')
  })

  it('sends only the standard 1024x1024 size field for an Image2 square request', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-1' }, { id: 'gpt-image-1.5' }, { id: 'gpt-image-2' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()
    const modelSelect = wrapper.get<HTMLSelectElement>('#creator-model')
    expect(modelSelect.element.value).toBe('gpt-image-2')
    expect(modelSelect.findAll('option').map(option => option.attributes('value'))).not.toContain('gpt-image-2-4k')
    expect(wrapper.find('#creator-aspect').exists()).toBe(false)
    expect(wrapper.find('#creator-resolution').exists()).toBe(false)
    expect(wrapper.get('#creator-output-size').text()).toContain('1K · 1024×1024')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('正方形产品照片')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledWith(image2Key.key, expect.objectContaining({
      model: 'gpt-image-2',
      size: '1024x1024',
      protocol: 'openai',
      responseFormat: 'b64_json',
    }))
    const request = generateImage.mock.calls.at(-1)?.[1]
    expect(request).not.toHaveProperty('aspectRatio')
    expect(request).not.toHaveProperty('imageSize')
  })

  it('selects Image2 ratio sizes in a modal and keeps unstable 4K generation single-image', async () => {
    listGroups.mockResolvedValue([image2Group])
    listKeys.mockResolvedValue({ items: [image2Key], total: 1, page: 1, page_size: 100, pages: 1 })
    listModels.mockResolvedValue([{ id: 'gpt-image-2' }, { id: 'adobe-firefly-gpt-image-2-4k' }])
    const wrapper = mount(CreatorStudioView, {
      global: {
        stubs: { Icon: IconStub, AppLayout: AppLayoutStub },
      },
    })
    await flushPromises()

    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('宽屏未来城市')

    await wrapper.get('#creator-output-size').trigger('click')
    let dialog = wrapper.getComponent(BaseDialog)
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
    expect(generateImage.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ size: '1536x1024' }))

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
    expect(wrapper.get<HTMLSelectElement>('#creator-model').element.value).toBe('adobe-firefly-gpt-image-2-4k')
    expect(wrapper.get('#creator-output-size').text()).toContain('4K · 3840×2160')
    expect(wrapper.get('.field-block .stepper').text()).toContain('1 张')
    expect(wrapper.get('.field-block .stepper button:last-child').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('当前 4K 图片模型每次只能生成 1 张')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(generateImage.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({
      model: 'adobe-firefly-gpt-image-2-4k',
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
      model: 'adobe-firefly-gpt-image-2-4k',
      size: '2160x3840',
    }))

    await wrapper.get<HTMLSelectElement>('#creator-model').setValue('gpt-image-2')
    await flushPromises()
    expect(wrapper.get('#creator-output-size').text()).toContain('2K')
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

    await wrapper.findAll('.capability-switch button')[1].trigger('click')
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

    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('宽屏未来城市')
    await wrapper.get('#creator-output-size').trigger('click')
    const dialog = wrapper.getComponent(BaseDialog)
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

    await wrapper.findAll('.capability-switch button')[1].trigger('click')
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('测试兼容账号提示')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('当前创作分组没有可用的兼容图片账号')
    expect(wrapper.text()).not.toContain('No available compatible accounts')
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

    await wrapper.findAll('.capability-switch button')[1].trigger('click')
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

    await wrapper.findAll('.capability-switch button')[1].trigger('click')
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

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('参数错误不应重试')
    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('invalid aspect ratio')
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

    await wrapper.findAll('.mode-option')[1].trigger('click')
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

    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('一张正在生成的图片')
    await wrapper.get('.generate-button').trigger('click')
    expect(wrapper.get('.generation-state').text()).toContain('正在绘制你的画面')

    await wrapper.findAll('.mode-option')[1].trigger('click')
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
    expect(wrapper.get('.video-duration-estimate').text()).toContain('预计总时长 8 秒')
    expect(wrapper.get('.video-duration-estimate').text()).toContain('单段视频')
    await wrapper.get('.sequence-add').trigger('click')
    expect(wrapper.findAll('.sequence-shot')).toHaveLength(2)
    expect(wrapper.findAll('.sequence-shot')[1].classes()).toContain('active')
    await wrapper.get<HTMLTextAreaElement>('#creator-prompt').setValue('第二个镜头的右侧编辑文案')
    expect(wrapper.findAll<HTMLTextAreaElement>('.sequence-shot textarea')[1].element.value).toBe('第二个镜头的右侧编辑文案')
    expect(wrapper.get('.video-duration-estimate').text()).toContain('预计总时长 16 秒')
    expect(wrapper.get('.video-duration-estimate').text()).toContain('按镜头顺序拼接')

    await wrapper.findAll('.sequence-shot')[0].trigger('click')
    expect(wrapper.get<HTMLTextAreaElement>('#creator-prompt').element.value).toBe('')
    await wrapper.get('.field-block .stepper button:last-child').trigger('click')
    expect(wrapper.get('.video-duration-estimate').text()).toContain('预计总时长 17 秒')
  })
})
