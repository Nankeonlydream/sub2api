import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import classWorkerURL from '@ffmpeg/ffmpeg/worker?url'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'

let ffmpegPromise: Promise<FFmpeg> | undefined
let compositionQueue: Promise<void> = Promise.resolve()

async function loadFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg()
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 60_000)
      try {
        await ffmpeg.load({ classWorkerURL, coreURL, wasmURL }, { signal: controller.signal })
      } catch (error) {
        ffmpeg.terminate()
        if (controller.signal.aborted) throw new Error('本地视频合成组件加载超时，请重试')
        throw error
      } finally {
        window.clearTimeout(timeout)
      }
      return ffmpeg
    })().catch((error) => {
      ffmpegPromise = undefined
      throw error
    })
  }
  return ffmpegPromise
}

async function removeFile(ffmpeg: FFmpeg, path: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(path)
  } catch {
    // A failed concat may not have created every temporary file.
  }
}

async function compose(blobs: Blob[]): Promise<Blob> {
  if (blobs.length < 2) throw new Error('至少需要两个视频片段才能合成')

  const ffmpeg = await loadFFmpeg()
  const jobId = crypto.randomUUID().replace(/-/g, '')
  const inputNames = blobs.map((_, index) => `${jobId}-shot-${index}.mp4`)
  const listName = `${jobId}-shots.txt`
  const outputName = `${jobId}-complete.mp4`

  try {
    for (let index = 0; index < blobs.length; index++) {
      await ffmpeg.writeFile(inputNames[index], await fetchFile(blobs[index]))
    }
    await ffmpeg.writeFile(listName, inputNames.map(name => `file '${name}'`).join('\n'))

    const exitCode = await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', listName,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputName,
    ])
    if (exitCode !== 0) throw new Error(`视频合成失败（FFmpeg ${exitCode}）`)

    const output = await ffmpeg.readFile(outputName)
    if (typeof output === 'string' || output.byteLength === 0) throw new Error('合成后的视频内容为空')
    const bytes = new Uint8Array(output.byteLength)
    bytes.set(output)
    return new Blob([bytes], { type: 'video/mp4' })
  } finally {
    await Promise.all([
      ...inputNames.map(name => removeFile(ffmpeg, name)),
      removeFile(ffmpeg, listName),
      removeFile(ffmpeg, outputName),
    ])
  }
}

export function composeVideoSegments(blobs: Blob[]): Promise<Blob> {
  const composition = compositionQueue.then(() => compose(blobs))
  compositionQueue = composition.then(() => undefined, () => undefined)
  return composition
}
