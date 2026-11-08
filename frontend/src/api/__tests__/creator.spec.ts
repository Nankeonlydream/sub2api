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
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches image prices with the selected key and encoded model without generating', async () => {
    const quote = { currency: 'USD', billing_mode: 'image', prices: { '1K': 0.04, '2K': 0.08, '4K': 0.16 } }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(quote))
    const { getCreatorImagePricing } = await import('@/api/creator')
    const controller = new AbortController()
    await expect(getCreatorImagePricing('sk-pricing', 'gpt-image-2', controller.signal)).resolves.toEqual(quote)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/v1\/sub2api\/image-pricing\?model=gpt-image-2$/)
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-pricing' })
    expect(init?.signal).toBe(controller.signal)
    expect(init?.body).toBeUndefined()
  })

  it('fetches video duration quotes with the selected key', async () => {
    const quote = { currency: 'USD', prices: { '720p': Array(15).fill(0.2) } }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(quote))
    const { getCreatorVideoPricing } = await import('@/api/creator')
    const controller = new AbortController()
    await expect(getCreatorVideoPricing('sk-video', 'xai/grok-imagine-video', controller.signal)).resolves.toEqual(quote)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/video-pricing\?model=xai%2Fgrok-imagine-video$/)
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-video' })
    expect(init?.signal).toBe(controller.signal)
    expect(init?.body).toBeUndefined()
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
      responseFormat: 'b64_json',
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
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('response_format')
  })

  it('sends GIF output with official frame fields and without output_compression', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: 'R0lGODlhAQABAAAAACw=' }] }))
    const { generateCreatorImage } = await import('@/api/creator')

    const result = await generateCreatorImage('sk-image', {
      model: 'gpt-image-2.6-sunburst',
      prompt: 'monkey lifts a lantern',
      n: 1,
      size: 'auto',
      outputFormat: 'gif',
      outputCompression: 80,
      frameCount: 9,
      frameDurationMs: 200,
    })

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
    expect(body).toMatchObject({
      prompt: 'monkey lifts a lantern',
      size: 'auto',
      output_format: 'gif',
      frame_count: 9,
      frame_duration_ms: 200,
    })
    expect(body).not.toHaveProperty('output_compression')
    expect(result.data[0].mime_type).toBe('image/gif')
  })

  it('does not send frame fields for non-GIF output', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: 'aW1hZ2U=' }] }))
    const { generateCreatorImage } = await import('@/api/creator')
    await generateCreatorImage('sk-image', { model: 'gpt-image-2', prompt: 'cat', outputFormat: 'png', frameCount: 9, frameDurationMs: 200 })
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
    expect(body).not.toHaveProperty('frame_count')
    expect(body).not.toHaveProperty('frame_duration_ms')
  })

  it('sends SVG output to generations with n=1 and without output_compression', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: 'PHN2Zz48L3N2Zz4=' }] }))
    const { generateCreatorImage } = await import('@/api/creator')
    const result = await generateCreatorImage('sk-image', { model: 'gpt-image-2', prompt: 'logo', outputFormat: 'svg', n: 3, outputCompression: 80 })
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/v1/images/generations')
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
    expect(body).toMatchObject({ output_format: 'svg', n: 1 })
    expect(body).not.toHaveProperty('output_compression')
    expect(result.data[0]).toMatchObject({ mime_type: 'image/svg+xml', url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
  })

  it('labels a PNG returned for an SVG request as PNG', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUg==' }] }))
    const { generateCreatorImage } = await import('@/api/creator')
    const result = await generateCreatorImage('sk-image', { model: 'gpt-image-2', prompt: 'logo', outputFormat: 'svg' })
    expect(result.data[0].mime_type).toBe('image/png')
  })

  it('rejects SVG output with reference images before calling edits', async () => {
    const { generateCreatorImage } = await import('@/api/creator')
    const reference = new File(['x'], 'ref.png', { type: 'image/png' })
    await expect(generateCreatorImage('sk-image', { model: 'gpt-image-2', prompt: 'logo', outputFormat: 'svg', referenceImages: [reference] }))
      .rejects.toThrow('SVG 输出只支持文生图')
    expect(fetch).not.toHaveBeenCalled()
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

  it('turns an unparseable 200 body into a readable gateway error', async () => {
    const response = jsonResponse(null)
    vi.mocked(response.json).mockRejectedValueOnce(new SyntaxError('The string did not match the expected pattern.'))
    vi.mocked(fetch).mockResolvedValueOnce(response)
    const { generateCreatorImage } = await import('@/api/creator')

    await expect(generateCreatorImage('sk-image', { model: 'gemini-3-pro-image-preview', prompt: 'cat', protocol: 'gemini' }))
      .rejects.toMatchObject({ message: expect.stringContaining('无法解析的响应'), status: 200 })
  })

  it.each(['1024x1024', '2048x1152', '3840x2160'])(
    'prefers included image bytes over an inaccessible relay URL at %s', async size => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [{
        url: 'http://203.0.113.10:33339/v1/images/result.png',
        b64_json: 'aW1hZ2U=',
        mime_type: 'image/png',
      }] }))
      const { generateCreatorImage } = await import('@/api/creator')
      const result = await generateCreatorImage('sk-image', {
        model: 'gpt-image-2.5-sunburst', prompt: 'size regression', size,
      })
      expect(result.data[0].url).toBe('data:image/png;base64,aW1hZ2U=')
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )

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
      responseFormat: 'b64_json',
      referenceImages: [first, second],
    })

    expect(result.data[0].url).toBe('https://cdn.example/edited.png')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/v1\/images\/edits$/)
    expect(init?.headers).toEqual({ Authorization: 'Bearer sk-edit', 'X-Sub2API-Creator': 'image' })
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.get('model')).toBe('gpt-image-2')
    expect(form.get('prompt')).toBe('change the background')
    expect(form.get('quality')).toBe('high')
    expect(form.get('aspect_ratio')).toBe('1:1')
    expect(form.get('response_format')).toBeNull()
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
      size: '1024x1024',
      response_format: 'b64_json',
    })
  })

  it.each(['grok', 'gemini', 'banner-openai'])('keeps the selected 1K tier in the %s image protocol', async protocol => {
    vi.mocked(fetch).mockResolvedValueOnce(protocol === 'gemini'
      ? jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'UE5H' } }] } }] })
      : jsonResponse({ data: [{ b64_json: 'UE5H' }] }))
    const { generateCreatorImage } = await import('@/api/creator')
    await generateCreatorImage('sk-test', {
      model: protocol === 'grok' ? 'grok-imagine-image-2.0' : 'gemini-3.1-flash-image',
      protocol: protocol === 'gemini' ? 'gemini' : 'openai',
      prompt: '尺寸验证', size: '1024x576', imageSize: '1K', aspectRatio: '16:9',
    })
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
    if (protocol === 'grok') expect(body).toMatchObject({ resolution: '1k', size: '1024x576', aspect_ratio: '16:9' })
    else if (protocol === 'gemini') expect(body.generationConfig.imageConfig).toEqual({ imageSize: '1K', aspectRatio: '16:9' })
    else expect(body).toMatchObject({ image_size: '1K', size: '1024x576', aspect_ratio: '16:9' })
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
    expect(init?.headers).toMatchObject({ 'X-Sub2API-Creator': 'video' })
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'grok-imagine-video-1.5',
      prompt: 'camera moves forward',
      duration: 8,
      aspect_ratio: '16:9',
      resolution: '720p',
      image: { url: 'data:image/png;base64,UE5H' },
    })
  })

  it('creates a reference-to-video job with up to seven reference images', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ request_id: 'video-reference-123' }))
    const { createCreatorVideo } = await import('@/api/creator')
    const references = Array.from({ length: 7 }, (_, index) => `data:image/png;base64,REF${index + 1}`)

    await createCreatorVideo('sk-video', {
      model: 'grok-imagine-video-1.5',
      prompt: 'keep the same person and outfit',
      duration: 10,
      aspectRatio: '3:2',
      resolution: '720p',
      referenceImageDataUrls: references,
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'grok-imagine-video-1.5',
      prompt: 'keep the same person and outfit',
      duration: 10,
      aspect_ratio: '3:2',
      resolution: '720p',
      reference_images: references.map(url => ({ url })),
    })
  })

  it('rejects mixed or oversized video reference inputs before sending a request', async () => {
    const { createCreatorVideo } = await import('@/api/creator')

    await expect(createCreatorVideo('sk-video', {
      model: 'grok-imagine-video',
      prompt: 'invalid mixed input',
      imageDataUrl: 'data:image/png;base64,SOURCE',
      referenceImageDataUrls: ['data:image/png;base64,REF'],
    })).rejects.toThrow('首帧图与参考图不能同时用于同一个视频请求')

    await expect(createCreatorVideo('sk-video', {
      model: 'grok-imagine-video',
      prompt: 'too many references',
      referenceImageDataUrls: Array.from({ length: 8 }, (_, index) => `data:image/png;base64,REF${index}`),
    })).rejects.toThrow('最多支持 7 张参考图')

    await expect(createCreatorVideo('sk-video', {
      model: 'grok-imagine-video',
      prompt: 'legacy model with references',
      referenceImageDataUrls: ['data:image/png;base64,REF'],
    })).rejects.toThrow('仅支持 Grok Imagine Video 1.5 或 MiniMax H3 模型')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('creates MiniMax H3 jobs with tier-specific duration and reference images', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ id: 'task_768', task_id: 'task_768', status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'task_1440', status: 'queued' }))
    const { createCreatorVideo } = await import('@/api/creator')
    const references = Array.from({ length: 9 }, (_, index) => `data:image/png;base64,REF${index}`)

    const fixed = await createCreatorVideo('sk-h3', {
      model: 'Minimax-H3-768p-933-10s',
      prompt: 'lake at dawn',
      duration: 10,
      aspectRatio: '16:9',
      resolution: '768p',
      referenceImageDataUrls: references,
    })
    expect(fixed.id).toBe('task_768')
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      model: 'Minimax-H3-768p-933-10s',
      prompt: 'lake at dawn',
      aspect_ratio: '16:9',
      images: references,
    })

    // Prompt-only H3 is allowed; the variable tier sends integer seconds.
    await createCreatorVideo('sk-h3', {
      model: 'MiniMax-H3-933-1440p-10-15s',
      prompt: 'boardwalk',
      duration: 12,
      aspectRatio: '5:2',
      resolution: '1440p',
    })
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual({
      model: 'MiniMax-H3-933-1440p-10-15s',
      prompt: 'boardwalk',
      seconds: 12,
    })
  })

  it('rejects MiniMax H3 inputs outside the selected tier', async () => {
    const { createCreatorVideo } = await import('@/api/creator')
    await expect(createCreatorVideo('sk-h3', { model: 'Minimax-H3-768p-933-10s-15s', prompt: 'x', duration: 9 }))
      .rejects.toThrow('10–15 秒')
    await expect(createCreatorVideo('sk-h3', { model: 'MiniMax-H3-933-1440p-15s', prompt: 'x', duration: 10 }))
      .rejects.toThrow('固定生成 15 秒')
    await expect(createCreatorVideo('sk-h3', { model: 'MiniMax-H3-933-1440p-10-15s', prompt: 'x', duration: 16 }))
      .rejects.toThrow('10–15 秒')
    await expect(createCreatorVideo('sk-h3', {
      model: 'MiniMax-H3-933-1440p-15s',
      prompt: 'x',
      duration: 15,
      referenceImageDataUrls: Array.from({ length: 10 }, (_, index) => `data:image/png;base64,REF${index}`),
    })).rejects.toThrow('最多支持 9 张参考图')
    await expect(createCreatorVideo('sk-h3', {
      model: 'MiniMax-H3-933-1440p-15s',
      prompt: 'x',
      duration: 15,
      imageDataUrl: 'data:image/png;base64,SOURCE',
    })).rejects.toThrow('不支持首帧图生视频')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends Seedance tiers with integer seconds', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ id: 'sf_1', task_id: 'task_1', status: 'queued' }))
    const { createCreatorVideo } = await import('@/api/creator')
    const created = await createCreatorVideo('sk-sd', {
      model: 'TTsedanco2.0-720',
      prompt: 'paper plane',
      duration: 12,
      aspectRatio: '9:16',
      resolution: '720p',
    })
    expect(created.id).toBe('sf_1')
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      model: 'TTsedanco2.0-720',
      prompt: 'paper plane',
      seconds: 12,
      aspect_ratio: '9:16',
    })
    await expect(createCreatorVideo('sk-sd', { model: 'TTsedanco2.0-480', prompt: 'x', duration: 4 }))
      .rejects.toThrow('Seedance 模型时长需为 5–15 秒')
    await expect(createCreatorVideo('sk-sd', { model: 'TTsedanco2.0-720', prompt: 'x', imageDataUrl: 'data:image/png;base64,S' }))
      .rejects.toThrow('Seedance 不支持首帧图生视频')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('sends Zhongheng Seedance tiers with uploaded references and only their sold lengths', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ task_id: 'vid_1', status: 'processing' }))
    const { createCreatorVideo } = await import('@/api/creator')
    const created = await createCreatorVideo('sk-zh', {
      model: 'A-SD2.0',
      prompt: '@图片1 海边奔跑',
      duration: 10,
      aspectRatio: '9:16',
      referenceImageDataUrls: ['data:image/png;base64,REF1'],
    })
    expect(created.id).toBe('vid_1')
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      model: 'A-SD2.0',
      prompt: '@图片1 海边奔跑',
      seconds: 10,
      aspect_ratio: '9:16',
      images: ['data:image/png;base64,REF1'],
    })
    await expect(createCreatorVideo('sk-zh', { model: 'A-SD2.0', prompt: 'x', duration: 7 }))
      .rejects.toThrow('该 Seedance 模型时长只能是 5 或 10 或 15 秒')
    await expect(createCreatorVideo('sk-zh', { model: 'Tseadanco2.5-720YT', prompt: 'x', duration: 12 }))
      .rejects.toThrow('只能是')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('sends Zhongheng MiniMax H3 and Grok relay tiers with their own lengths and ratios', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ task_id: 'vid_h3', status: 'processing' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'vid_grok', status: 'processing' }))
    const { createCreatorVideo } = await import('@/api/creator')
    await createCreatorVideo('sk-zh', {
      model: 'Xminimex-h3',
      prompt: 'harbor',
      duration: 6,
      aspectRatio: '21:9',
      referenceImageDataUrls: ['data:image/png;base64,REF1'],
    })
    // 21:9 is not a Zhongheng ratio, so the relay default applies.
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      model: 'Xminimex-h3',
      prompt: 'harbor',
      seconds: 6,
      images: ['data:image/png;base64,REF1'],
    })
    await expect(createCreatorVideo('sk-zh', { model: 'MinimaxH3-768', prompt: 'x', duration: 8 }))
      .rejects.toThrow('该 MiniMax H3 模型时长只能是')
    await expect(createCreatorVideo('sk-zh', { model: 'MinimaxH3-768', prompt: 'x', duration: 10 }))
      .rejects.toThrow('该 MiniMax H3 模型需要至少 1 张参考图')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('downloads relay videos through the content endpoint instead of a relative URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      id: 'sf_1', status: 'completed', progress: 100, metadata: { url: '/v1/videos/sf_1/content' },
    }))
    const { getCreatorVideoStatus, isCreatorVideoComplete } = await import('@/api/creator')
    const status = await getCreatorVideoStatus('sk-sd', 'sf_1')
    expect(status.url).toBeUndefined()
    expect(isCreatorVideoComplete(status.status)).toBe(true)
  })

  it('reads the MiniMax H3 result URL from metadata', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      id: 'task_1', status: 'completed', progress: 100,
      metadata: { url: 'https://videos.example/task_1.mp4' },
    }))
    const { getCreatorVideoStatus, isCreatorVideoComplete } = await import('@/api/creator')
    const status = await getCreatorVideoStatus('sk-h3', 'task_1')
    expect(status.url).toBe('https://videos.example/task_1.mp4')
    expect(isCreatorVideoComplete(status.status)).toBe(true)
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
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(init?.headers).toMatchObject({ 'X-Sub2API-Creator': 'video' })
    }
  })

  it.each([
    { status: 'done', video: { url: '/v1/videos/task/content', respect_moderation: false } },
    { status: 'done', video: { url: '/v1/videos/task/content', error: { message: 'render failed' } } },
  ])('treats a rejected video as failed even when a URL is returned: %j', async body => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body))
    const { getCreatorVideoStatus } = await import('@/api/creator')
    await expect(getCreatorVideoStatus('sk-video', 'task')).resolves.toMatchObject({ status: 'failed', error: expect.anything() })
  })

  it('rejects a top-level video generation error even when status is done', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ status: 'done', error: { message: 'render failed' }, video: { url: '/v1/videos/task/content' } }))
    const { getCreatorVideoStatus } = await import('@/api/creator')
    await expect(getCreatorVideoStatus('sk-video', 'task')).rejects.toThrow('render failed')
  })

  it('rejects a partial video body when requesting the complete file', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 206, blob: vi.fn() } as unknown as Response)
    const { getCreatorVideoContent } = await import('@/api/creator')
    await expect(getCreatorVideoContent('sk-video', 'task')).rejects.toThrow('视频内容不完整')
  })

  it('downloads cached video bytes without contacting the task endpoint or sending credentials', async () => {
    const videoBlob = new Blob(['complete video'], { type: 'video/mp4' })
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(videoBlob) } as unknown as Response)
    const { downloadCreatorVideo } = await import('@/api/creator')
    await expect(downloadCreatorVideo('https://cdn.example/video.mp4', 'sk-video', 'task-1')).resolves.toBe(videoBlob)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://cdn.example/video.mp4')
    expect(init).toMatchObject({ cache: 'force-cache', credentials: 'omit', mode: 'cors' })
    expect(init?.headers).toBeUndefined()
  })

  it.each(['revoked', 'empty', 'html', 'partial'])('uses the task endpoint when video cache is unusable: %s', async kind => {
    const cachedBlob = new Blob(kind === 'empty' ? [] : ['cached'], { type: kind === 'html' ? 'text/html' : 'video/mp4' })
    const videoBlob = new Blob(['complete video'], { type: 'video/mp4' })
    if (kind === 'revoked') vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    else vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: kind === 'partial' ? 206 : 200, blob: vi.fn().mockResolvedValue(cachedBlob) } as unknown as Response)
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(videoBlob) } as unknown as Response)
    const { downloadCreatorVideo } = await import('@/api/creator')
    await expect(downloadCreatorVideo('blob:old-video', 'sk-video', 'task/2')).resolves.toBe(videoBlob)
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('/task%2F2/content')
    expect(vi.mocked(fetch).mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer sk-video' })
  })

  it('aborts a stalled video cache body before reading the task endpoint', async () => {
    vi.useFakeTimers()
    let directSignal: AbortSignal | undefined
    const videoBlob = new Blob(['complete video'], { type: 'video/mp4' })
    vi.mocked(fetch).mockImplementationOnce(async (_, init) => {
      directSignal = init?.signal as AbortSignal
      return { ok: true, status: 200, blob: () => new Promise((_, reject) => {
        directSignal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }) } as unknown as Response
    }).mockResolvedValueOnce({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(videoBlob) } as unknown as Response)
    const { downloadCreatorVideo } = await import('@/api/creator')
    const download = downloadCreatorVideo('https://cdn.example/video.mp4', 'sk-video', 'task-1')
    await vi.advanceTimersByTimeAsync(1500)
    await expect(download).resolves.toBe(videoBlob)
    expect(directSignal?.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('reloads a remote video when its cache is unusable and there is no task key', async () => {
    const videoBlob = new Blob(['video'], { type: 'video/mp4' })
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(videoBlob) } as unknown as Response)
    const { downloadCreatorVideo } = await import('@/api/creator')
    await expect(downloadCreatorVideo('https://cdn.example/video.mp4')).resolves.toBe(videoBlob)
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({ cache: 'reload', credentials: 'omit' })
  })

  it('saves the original cached image without contacting the gateway or sending CDN credentials', async () => {
    const imageBlob = new Blob(['original image bytes'], { type: 'image/png' })
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, blob: vi.fn().mockResolvedValue(imageBlob) } as unknown as Response)
    const { downloadCreatorImage } = await import('@/api/creator')

    await expect(downloadCreatorImage('sk-image', 'https://cdn.example/result.png')).resolves.toBe(imageBlob)

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://cdn.example/result.png')
    expect(init).toMatchObject({ cache: 'force-cache', credentials: 'omit', mode: 'cors' })
    expect(init?.headers).toBeUndefined()
    expect(init?.body).toBeUndefined()
  })

  it('falls back to the gateway when the image CDN blocks CORS', async () => {
    const imageBlob = new Blob(['image'], { type: 'image/png' })
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'image/png' }),
      blob: vi.fn().mockResolvedValue(imageBlob),
    } as unknown as Response)
    const { downloadCreatorImage } = await import('@/api/creator')

    await expect(downloadCreatorImage('sk-image', 'https://cdn.example/result.png')).resolves.toBe(imageBlob)

    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, init] = vi.mocked(fetch).mock.calls[1]
    expect(String(url)).toMatch(/\/v1\/images\/download$/)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-image',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toEqual({ url: 'https://cdn.example/result.png' })
  })

  it('aborts a stalled direct response body and uses the gateway', async () => {
    vi.useFakeTimers()
    const imageBlob = new Blob(['image'], { type: 'image/png' })
    let directSignal: AbortSignal | undefined
    vi.mocked(fetch).mockImplementationOnce(async (_, init) => {
      directSignal = init?.signal as AbortSignal
      return {
        ok: true,
        blob: () => new Promise((_, reject) => {
          directSignal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
        }),
      } as unknown as Response
    }).mockResolvedValueOnce({ ok: true, blob: vi.fn().mockResolvedValue(imageBlob) } as unknown as Response)
    const { downloadCreatorImage } = await import('@/api/creator')
    const download = downloadCreatorImage('sk-image', 'https://cdn.example/result.png')
    await vi.advanceTimersByTimeAsync(1500)

    await expect(download).resolves.toBe(imageBlob)
    expect(directSignal?.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toMatch(/\/v1\/images\/download$/)
  })

  it.each(['empty', 'html', 'http-error'])('does not save an invalid direct response: %s', async kind => {
    const imageBlob = new Blob(['image'], { type: 'image/png' })
    const invalidBlob = kind === 'empty' ? new Blob([], { type: 'image/png' }) : new Blob(['error'], { type: 'text/html' })
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: kind !== 'http-error', blob: vi.fn().mockResolvedValue(invalidBlob) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, blob: vi.fn().mockResolvedValue(imageBlob) } as unknown as Response)
    const { downloadCreatorImage } = await import('@/api/creator')

    await expect(downloadCreatorImage('sk-image', 'https://cdn.example/result.png')).resolves.toBe(imageBlob)
    expect(fetch).toHaveBeenCalledTimes(2)
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
