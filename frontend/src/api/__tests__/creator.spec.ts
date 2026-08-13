import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n', () => ({
  getLocale: () => 'zh-CN',
}))

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('creator gateway API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('lists creator models with the API key', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ data: [{ id: 'grok-imagine-image', object: 'model' }] }),
    )
    const { listCreatorModels } = await import('@/api/creator')

    await expect(listCreatorModels('sk-creator')).resolves.toEqual([
      { id: 'grok-imagine-image', object: 'model' },
    ])

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/v1\/models$/)
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-creator' })
  })

  it('uses JSON generations and normalizes OpenAI base64 images', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ created: 123, data: [{ b64_json: 'aW1hZ2U=', revised_prompt: 'cat' }] }),
    )
    const { generateCreatorImage } = await import('@/api/creator')

    const result = await generateCreatorImage('sk-image', {
      model: 'gpt-image-2',
      prompt: 'draw a cat',
      n: 2,
      size: '1024x1024',
      aspectRatio: '1:1',
      outputFormat: 'webp',
    })

    expect(result).toEqual({
      created: 123,
      data: [
        expect.objectContaining({
          url: 'data:image/webp;base64,aW1hZ2U=',
          revised_prompt: 'cat',
          mime_type: 'image/webp',
        }),
      ],
    })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/v1\/images\/generations$/)
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-image',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'draw a cat',
      n: 2,
      size: '1024x1024',
      aspect_ratio: '1:1',
      output_format: 'webp',
    })
  })

  it('rejects a late image error envelope after an HTTP 200 heartbeat', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        error: {
          type: 'upstream_error',
          code: 'upstream_timeout',
          message: 'image generation task timed out',
        },
      }),
    )
    const { generateCreatorImage } = await import('@/api/creator')

    await expect(generateCreatorImage('sk-image', {
      model: 'gpt-image-2',
      prompt: 'draw a cat',
    })).rejects.toMatchObject({
      message: 'image generation task timed out',
      status: 200,
      code: 'upstream_timeout',
    })
  })

  it('uses multipart edits when reference files are present', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://cdn.example/edited.png' }] }),
    )
    const { generateCreatorImage } = await import('@/api/creator')
    const first = new File(['first'], 'first.png', { type: 'image/png' })
    const second = new File(['second'], 'second.webp', { type: 'image/webp' })

    const result = await generateCreatorImage('sk-edit', {
      model: 'gpt-image-2',
      prompt: 'change the background',
      quality: 'high',
      aspectRatio: '1:1',
      referenceImages: [first, second],
    })

    expect(result.data[0].url).toBe('https://cdn.example/edited.png')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/v1\/images\/edits$/)
    expect(init?.headers).toEqual({ Authorization: 'Bearer sk-edit' })
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.get('model')).toBe('gpt-image-2')
    expect(form.get('prompt')).toBe('change the background')
    expect(form.get('quality')).toBe('high')
    expect(form.get('aspect_ratio')).toBe('1:1')
    expect(form.getAll('image')).toHaveLength(2)
  })

  it('uses xAI image fields for Grok Imagine instead of OpenAI-only options', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://cdn.example/grok.png' }] }),
    )
    const { generateCreatorImage } = await import('@/api/creator')

    await generateCreatorImage('sk-grok', {
      model: 'grok-imagine-image',
      prompt: 'draw a cat',
      n: 1,
      size: '1024x1024',
      quality: 'auto',
      background: 'auto',
      outputFormat: 'png',
      aspectRatio: '16:9',
      imageSize: '2K',
      responseFormat: 'b64_json',
    })

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
    expect(body).toEqual({
      model: 'grok-imagine-image',
      prompt: 'draw a cat',
      n: 1,
      aspect_ratio: '16:9',
      resolution: '2k',
      response_format: 'b64_json',
    })
  })

  it('builds Gemini native image requests and parses inlineData', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                { text: 'done' },
                { inlineData: { mimeType: 'image/png', data: 'UE5H' } },
              ],
            },
          },
        ],
      }),
    )
    const { generateCreatorImage } = await import('@/api/creator')
    const reference = new File(['abc'], 'source.webp', { type: 'image/webp' })

    const result = await generateCreatorImage('sk-gemini', {
      protocol: 'gemini',
      model: 'models/gemini-3-pro-image-preview',
      prompt: 'make a banner',
      referenceImages: [reference],
      aspectRatio: '16:9',
      imageSize: '2K',
    })

    expect(result.data).toEqual([
      { url: 'data:image/png;base64,UE5H', mime_type: 'image/png' },
    ])
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(
      /\/v1beta\/models\/gemini-3-pro-image-preview:generateContent$/,
    )
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-gemini',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(String(init?.body))
    expect(body.contents[0].parts).toEqual([
      { text: 'make a banner' },
      { inlineData: { mimeType: 'image/webp', data: 'YWJj' } },
    ])
    expect(body.generationConfig).toEqual({
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
    })
  })

  it('creates an image-to-video job and normalizes its request id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ request_id: 'video-123' }))
    const { createCreatorVideo } = await import('@/api/creator')

    const result = await createCreatorVideo('sk-video', {
      model: 'grok-imagine-video-1.5',
      prompt: 'camera moves forward',
      duration: 8,
      aspectRatio: '16:9',
      resolution: '720p',
      imageDataUrl: 'data:image/png;base64,UE5H',
    })

    expect(result).toEqual({ request_id: 'video-123', id: 'video-123' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/v1\/videos\/generations$/)
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'grok-imagine-video-1.5',
      prompt: 'camera moves forward',
      duration: 8,
      aspect_ratio: '16:9',
      resolution: '720p',
      image: { image_url: 'data:image/png;base64,UE5H' },
    })
  })

  it('gets video status and binary content', async () => {
    const videoBlob = new Blob(['video'], { type: 'video/mp4' })
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ status: 'completed', video_url: 'https://cdn.example/video.mp4' }),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        blob: vi.fn().mockResolvedValue(videoBlob),
      } as unknown as Response)
    const { getCreatorVideoContent, getCreatorVideoStatus } = await import('@/api/creator')

    await expect(getCreatorVideoStatus('sk-video', 'task/1')).resolves.toMatchObject({
      id: 'task/1',
      status: 'completed',
      video_url: 'https://cdn.example/video.mp4',
    })
    await expect(getCreatorVideoContent('sk-video', 'task/1')).resolves.toBe(videoBlob)

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toMatch(/\/v1\/videos\/task%2F1$/)
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toMatch(
      /\/v1\/videos\/task%2F1\/content$/,
    )
  })

  it('normalizes generic binary video content to MP4', async () => {
    const genericBlob = new Blob(['video'], { type: 'application/octet-stream' })
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      blob: vi.fn().mockResolvedValue(genericBlob),
    } as unknown as Response)
    const { getCreatorVideoContent } = await import('@/api/creator')

    const result = await getCreatorVideoContent('sk-video', 'generic-task')

    expect(result).not.toBe(genericBlob)
    expect(result.type).toBe('video/mp4')
    expect(result.size).toBe(genericBlob.size)
  })

  it('normalizes nested video status fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: {
          task_id: 'nested-task',
          status: 'failed',
          video: { download_url: '/v1/videos/nested-task/content' },
          error: { message: 'render failed' },
        },
      }),
    )
    const { getCreatorVideoStatus } = await import('@/api/creator')

    await expect(getCreatorVideoStatus('sk-video', 'fallback-id')).resolves.toMatchObject({
      id: 'nested-task',
      status: 'failed',
      url: '/v1/videos/nested-task/content',
      error: { message: 'render failed' },
    })
  })

  it('normalizes fractional video progress to a percentage', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ data: { status: 'processing', progress: 0.42 } }),
    )
    const { getCreatorVideoStatus } = await import('@/api/creator')

    await expect(getCreatorVideoStatus('sk-video', 'task-progress')).resolves.toMatchObject({
      status: 'processing',
      progress: 42,
    })
  })

  it('keeps an explicit one-percent video progress value', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ status: 'processing', progress: '1%' }),
    )
    const { getCreatorVideoStatus } = await import('@/api/creator')

    await expect(getCreatorVideoStatus('sk-video', 'task-one-percent')).resolves.toMatchObject({
      progress: 1,
    })
  })

  it('treats a numeric one as one percent instead of completion', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ status: 'processing', progress: 1 }),
    )
    const { getCreatorVideoStatus } = await import('@/api/creator')

    await expect(getCreatorVideoStatus('sk-video', 'task-numeric-one')).resolves.toMatchObject({
      progress: 1,
    })
  })

  it('rejects an empty video content response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      blob: vi.fn().mockResolvedValue(new Blob([], { type: 'video/mp4' })),
    } as unknown as Response)
    const { getCreatorVideoContent } = await import('@/api/creator')

    await expect(getCreatorVideoContent('sk-video', 'empty-task')).rejects.toThrow('视频内容为空')
  })

  it('surfaces nested gateway error messages', async () => {
    const headers = new Headers({ 'X-Request-Id': 'request-1' })
    vi.mocked(fetch).mockResolvedValueOnce({
      ...jsonResponse({ error: { code: 'insufficient_quota', message: '余额不足' } }, 402),
      headers,
    } as Response)
    const { listCreatorModels } = await import('@/api/creator')

    await expect(listCreatorModels('sk-error')).rejects.toMatchObject({
      message: '余额不足',
      status: 402,
      code: 'insufficient_quota',
      requestId: 'request-1',
    })
  })
})
