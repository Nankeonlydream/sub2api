import { buildGatewayUrl } from './client'

export interface CreatorModel {
  id: string
  object?: string
  created?: number
  owned_by?: string
  name?: string
  displayName?: string
  [key: string]: unknown
}

export type CreatorImageProtocol = 'openai' | 'gemini'

export interface ImageGenerationInput {
  protocol?: CreatorImageProtocol
  model: string
  prompt: string
  referenceImages?: File[]
  /** @deprecated Use referenceImages. */
  references?: File[]
  n?: number
  size?: string
  quality?: 'auto' | 'low' | 'medium' | 'high' | string
  background?: 'auto' | 'opaque' | 'transparent' | string
  outputFormat?: 'png' | 'jpeg' | 'webp' | string
  outputCompression?: number
  responseFormat?: 'url' | 'b64_json' | string
  aspectRatio?: string
  imageSize?: '1K' | '2K' | '4K' | string
  moderation?: 'auto' | 'low' | string
  user?: string
  extra?: Record<string, unknown>
}

export interface CreatorGeneratedImage {
  url: string
  b64_json?: string
  revised_prompt?: string
  mime_type?: string
  [key: string]: unknown
}

export interface ImageGenerationResult {
  created?: number
  data: CreatorGeneratedImage[]
}

export interface VideoGenerationInput {
  model: string
  prompt: string
  imageDataUrl?: string
  referenceImageDataUrls?: string[]
  duration?: number
  aspectRatio?: string
  resolution?: string
  extra?: Record<string, unknown>
}

export interface VideoGenerationResult {
  id: string
  request_id?: string
  task_id?: string
  status?: string
  [key: string]: unknown
}

export interface VideoStatusResult {
  id: string
  status: string
  progress?: number
  url?: string
  video_url?: string
  download_url?: string
  error?: unknown
  [key: string]: unknown
}

const VIDEO_COMPLETE_STATUSES = new Set(['completed', 'succeeded', 'success', 'done'])

interface GeminiInlineData {
  mimeType?: string
  mime_type?: string
  data?: string
}

interface OpenAIImageResponseItem {
  url?: string
  b64_json?: string
  revised_prompt?: string
  mime_type?: string
  [key: string]: unknown
}

interface CreatorError extends Error {
  status?: number
  code?: string | number
  requestId?: string
}

function authHeaders(apiKey: string, extra?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  }
}

async function parseCreatorError(response: Response): Promise<CreatorError> {
  let body: any
  try {
    body = await response.json()
  } catch {
    body = null
  }

  return creatorErrorFromBody(response, body)
}

function creatorErrorFromBody(response: Response, body: any): CreatorError {
  const nestedMessage = body?.error?.message
  const message =
    (typeof nestedMessage === 'string' && nestedMessage.trim()) ||
    (typeof body?.message === 'string' && body.message.trim()) ||
    (typeof body?.error === 'string' && body.error.trim()) ||
    response.statusText ||
    `HTTP ${response.status}`
  const error = new Error(message) as CreatorError
  error.status = response.status
  error.code = body?.error?.code ?? body?.code ?? response.status
  error.requestId = response.headers.get('X-Request-Id') || ''
  return error
}

async function fetchJSON<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) throw await parseCreatorError(response)
  const body = await response.json()
  // A non-streaming image heartbeat commits HTTP 200 before a late upstream
  // error is known. Treat the final OpenAI error envelope as a failed request.
  if (body?.error) throw creatorErrorFromBody(response, body)
  return body
}

export async function listCreatorModels(apiKey: string): Promise<CreatorModel[]> {
  const body = await fetchJSON<{ data?: CreatorModel[] } | CreatorModel[]>(
    buildGatewayUrl('/v1/models'),
    { headers: authHeaders(apiKey) },
  )
  const models = Array.isArray(body) ? body : body?.data
  if (!Array.isArray(models)) return []

  return models
    .map((model) => {
      const id = String(model?.id || model?.name || '').replace(/^models\//, '').trim()
      return id ? { ...model, id } : null
    })
    .filter((model): model is CreatorModel => model !== null)
}

function imageMimeType(input: ImageGenerationInput): string {
  switch (input.outputFormat?.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    default:
      return 'image/png'
  }
}

function normalizeOpenAIImages(body: any, fallbackMimeType: string): ImageGenerationResult {
  const items: OpenAIImageResponseItem[] = Array.isArray(body?.data) ? body.data : []
  const data = items.flatMap((item): CreatorGeneratedImage[] => {
    const b64 = typeof item?.b64_json === 'string' ? item.b64_json.trim() : ''
    const directURL = typeof item?.url === 'string' ? item.url.trim() : ''
    const mimeType =
      typeof item?.mime_type === 'string' && item.mime_type.trim()
        ? item.mime_type.trim()
        : fallbackMimeType
    const url = directURL || (b64 ? `data:${mimeType};base64,${b64}` : '')
    return url ? [{ ...item, url, mime_type: mimeType }] : []
  })

  return {
    ...(typeof body?.created === 'number' ? { created: body.created } : {}),
    data,
  }
}

function appendFormValue(form: FormData, name: string, value: unknown) {
  if (value === undefined || value === null || value === '') return
  if (value instanceof Blob) {
    form.append(name, value)
    return
  }
  form.append(name, typeof value === 'object' ? JSON.stringify(value) : String(value))
}

function buildOpenAIJSONPayload(input: ImageGenerationInput): Record<string, unknown> {
  const isGrokImagine = /^grok-imagine(?:-|$)/i.test(input.model.trim())
  const isGPTImageModel = /^gpt-image-/i.test(input.model.trim())
  if (isGrokImagine) {
    return {
      ...input.extra,
      model: input.model,
      prompt: input.prompt,
      ...(input.n !== undefined ? { n: input.n } : {}),
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      ...(input.imageSize ? { resolution: input.imageSize.toLowerCase() } : {}),
      ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
    }
  }

  return {
    ...input.extra,
    model: input.model,
    prompt: input.prompt,
    ...(input.n !== undefined ? { n: input.n } : {}),
    ...(input.size ? { size: input.size } : {}),
    ...(input.quality ? { quality: input.quality } : {}),
    ...(input.background ? { background: input.background } : {}),
    ...(input.outputFormat ? { output_format: input.outputFormat } : {}),
    ...(input.outputCompression !== undefined
      ? { output_compression: input.outputCompression }
      : {}),
    // GPT Image models always return b64_json and reject the legacy
    // response_format parameter. Keep it for DALL-E/compatible providers.
    ...(input.responseFormat && !isGPTImageModel
      ? { response_format: input.responseFormat }
      : {}),
    ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
    ...(input.imageSize ? { image_size: input.imageSize } : {}),
    ...(input.moderation ? { moderation: input.moderation } : {}),
    ...(input.user ? { user: input.user } : {}),
  }
}

async function generateOpenAIImage(
  apiKey: string,
  input: ImageGenerationInput,
): Promise<ImageGenerationResult> {
  const references = input.referenceImages || input.references || []
  let body: unknown

  if (references.length === 0) {
    body = await fetchJSON<any>(buildGatewayUrl('/v1/images/generations'), {
      method: 'POST',
      headers: authHeaders(apiKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(buildOpenAIJSONPayload(input)),
    })
  } else {
    const form = new FormData()
    const fields = buildOpenAIJSONPayload(input)
    for (const [name, value] of Object.entries(fields)) appendFormValue(form, name, value)
    for (const reference of references) form.append('image', reference, reference.name)

    body = await fetchJSON<any>(buildGatewayUrl('/v1/images/edits'), {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: form,
    })
  }

  return normalizeOpenAIImages(body, imageMimeType(input))
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

async function toGeminiInlineData(file: File): Promise<{ inlineData: GeminiInlineData }> {
  const dataURL = await readFileAsDataURL(file)
  const commaIndex = dataURL.indexOf(',')
  if (commaIndex < 0) throw new Error(`Failed to encode ${file.name}`)
  const mimeMatch = /^data:([^;,]+)(?:;[^,]*)?,/i.exec(dataURL)
  return {
    inlineData: {
      mimeType: file.type || mimeMatch?.[1] || 'application/octet-stream',
      data: dataURL.slice(commaIndex + 1),
    },
  }
}

function normalizeGeminiImages(body: any): ImageGenerationResult {
  const candidates = Array.isArray(body?.candidates) ? body.candidates : []
  const data: CreatorGeneratedImage[] = []

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
    for (const part of parts) {
      const inline: GeminiInlineData | undefined = part?.inlineData || part?.inline_data
      const encoded = typeof inline?.data === 'string' ? inline.data.trim() : ''
      if (!encoded) continue
      const mimeType = String(inline?.mimeType || inline?.mime_type || 'image/png').trim()
      if (!mimeType.toLowerCase().startsWith('image/')) continue
      data.push({ url: `data:${mimeType};base64,${encoded}`, mime_type: mimeType })
    }
  }

  return { data }
}

async function generateGeminiImage(
  apiKey: string,
  input: ImageGenerationInput,
): Promise<ImageGenerationResult> {
  const references = input.referenceImages || input.references || []
  const referenceParts = await Promise.all(references.map(toGeminiInlineData))
  const imageConfig: Record<string, string> = {}
  if (input.aspectRatio) imageConfig.aspectRatio = input.aspectRatio
  if (input.imageSize) imageConfig.imageSize = input.imageSize

  const payload = {
    ...input.extra,
    contents: [
      {
        role: 'user',
        parts: [{ text: input.prompt }, ...referenceParts],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
    },
  }
  const model = input.model.trim().replace(/^models\//, '')
  const body = await fetchJSON<any>(
    buildGatewayUrl(`/v1beta/models/${encodeURIComponent(model)}:generateContent`),
    {
      method: 'POST',
      headers: authHeaders(apiKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
  )
  return normalizeGeminiImages(body)
}

export function generateCreatorImage(
  apiKey: string,
  input: ImageGenerationInput,
): Promise<ImageGenerationResult> {
  return input.protocol === 'gemini'
    ? generateGeminiImage(apiKey, input)
    : generateOpenAIImage(apiKey, input)
}

export async function createCreatorVideo(
  apiKey: string,
  input: VideoGenerationInput,
): Promise<VideoGenerationResult> {
  const referenceImageDataUrls = (input.referenceImageDataUrls || []).filter(Boolean)
  if (input.imageDataUrl && referenceImageDataUrls.length) {
    throw new Error('首帧图与参考图不能同时用于同一个视频请求')
  }
  if (referenceImageDataUrls.length > 7) {
    throw new Error('参考图生视频最多支持 7 张参考图')
  }
  const payload = {
    ...input.extra,
    model: input.model,
    prompt: input.prompt,
    ...(input.duration !== undefined ? { duration: input.duration } : {}),
    ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(input.imageDataUrl ? { image: { url: input.imageDataUrl } } : {}),
    ...(referenceImageDataUrls.length
      ? { reference_images: referenceImageDataUrls.map(url => ({ url })) }
      : {}),
  }
  const body = await fetchJSON<any>(buildGatewayUrl('/v1/videos/generations'), {
    method: 'POST',
    headers: authHeaders(apiKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
  const id = String(
    body?.request_id ||
      body?.id ||
      body?.task_id ||
      body?.data?.request_id ||
      body?.data?.id ||
      body?.data?.task_id ||
      '',
  )
  return { ...body, id }
}

export async function getCreatorVideoStatus(
  apiKey: string,
  requestId: string,
): Promise<VideoStatusResult> {
  const body = await fetchJSON<any>(
    buildGatewayUrl(`/v1/videos/${encodeURIComponent(requestId)}`),
    { headers: authHeaders(apiKey) },
  )
  const nested = body?.video || body?.data || {}
  const nestedVideo = nested?.video || {}
  const url =
    body?.url ||
    body?.video_url ||
    body?.download_url ||
    nested?.url ||
    nested?.video_url ||
    nested?.download_url ||
    nestedVideo?.url ||
    nestedVideo?.video_url ||
    nestedVideo?.download_url
  const rawProgress = body?.progress ?? nested?.progress ?? nestedVideo?.progress
  const progressIsPercentage = typeof rawProgress === 'string' && rawProgress.includes('%')
  const parsedProgress = typeof rawProgress === 'string'
    ? Number.parseFloat(rawProgress.replace('%', ''))
    : Number(rawProgress)
  const progress = Number.isFinite(parsedProgress)
    ? Math.max(0, Math.min(100, !progressIsPercentage && parsedProgress > 0 && parsedProgress < 1 ? parsedProgress * 100 : parsedProgress))
    : undefined
  return {
    ...body,
    id: String(
      body?.id ||
        body?.request_id ||
        body?.task_id ||
        nested?.id ||
        nested?.request_id ||
        nested?.task_id ||
        requestId,
    ),
    status: String(body?.status || nested?.status || nestedVideo?.status || ''),
    ...(progress !== undefined ? { progress } : {}),
    ...(url ? { url: String(url) } : {}),
    ...(body?.error || nested?.error || nestedVideo?.error
      ? { error: body?.error || nested?.error || nestedVideo?.error }
      : {}),
  }
}

export async function getCreatorVideoContent(apiKey: string, requestId: string): Promise<Blob> {
  const response = await fetch(
    buildGatewayUrl(`/v1/videos/${encodeURIComponent(requestId)}/content`),
    { headers: authHeaders(apiKey) },
  )
  if (!response.ok) throw await parseCreatorError(response)
  const blob = await response.blob()
  if (!blob.size) throw new Error('视频内容为空，请稍后重试')
  if (blob.type.includes('json') || blob.type.startsWith('text/')) {
    throw new Error('视频内容接口返回了无效格式，请稍后重试')
  }
  // Some upstream relays return MP4 bytes as application/octet-stream. Chrome
  // does not reliably initialize a media element from that generic Blob type.
  return blob.type.startsWith('video/') ? blob : blob.slice(0, blob.size, 'video/mp4')
}

export function isCreatorVideoComplete(status: string): boolean {
  return VIDEO_COMPLETE_STATUSES.has(status.trim().toLowerCase())
}

export async function getCreatorPlayableVideo(
  apiKey: string,
  requestId: string,
  status?: VideoStatusResult,
): Promise<Blob> {
  const current = status || await getCreatorVideoStatus(apiKey, requestId)
  if (!isCreatorVideoComplete(current.status) && !current.url) {
    throw new Error('视频仍在处理中')
  }

  // The content endpoint requires the API key, so media elements cannot use it directly.
  return getCreatorVideoContent(apiKey, requestId)
}
