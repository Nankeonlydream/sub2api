import { beforeEach, describe, expect, it, vi } from 'vitest'

const engine = vi.hoisted(() => ({
  load: vi.fn(), terminate: vi.fn(), writeFile: vi.fn(), exec: vi.fn(),
  readFile: vi.fn(), deleteFile: vi.fn(),
}))

vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: function () { return engine } }))
vi.mock('@ffmpeg/ffmpeg/worker?worker&url', () => ({ default: '/assets/worker.js?worker_file' }))
vi.mock('@ffmpeg/core?url', () => ({ default: '/assets/core.js' }))
vi.mock('@ffmpeg/core/wasm?url', () => ({ default: '/assets/core.wasm' }))
vi.mock('@ffmpeg/util', () => ({ fetchFile: async () => new Uint8Array([1, 2, 3]) }))

describe('video composition', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    engine.load.mockResolvedValue(true)
    engine.exec.mockResolvedValue(0)
    engine.readFile.mockResolvedValue(new Uint8Array([4, 5, 6]))
  })

  it('loads a bundled worker with fresh CSP headers and produces an MP4', async () => {
    const { composeVideoSegments } = await import('../videoComposer')
    const result = await composeVideoSegments([new Blob(['one']), new Blob(['two'])])
    const config = engine.load.mock.calls[0][0]
    const workerURL = new URL(config.classWorkerURL)
    expect(workerURL.pathname).toBe('/assets/worker.js')
    expect(workerURL.searchParams.has('worker_file')).toBe(true)
    expect(workerURL.searchParams.get('csp')).toBe('wasm-v1')
    expect(config.coreURL).toBe('/assets/core.js')
    expect(config.wasmURL).toBe('/assets/core.wasm')
    expect(result.type).toBe('video/mp4')
    expect(result.size).toBe(3)
    expect(engine.deleteFile).toHaveBeenCalledTimes(4)
  })

  it('reports string errors from the worker and allows the next attempt to load again', async () => {
    const { composeVideoSegments } = await import('../videoComposer')
    engine.load.mockRejectedValueOnce('CompileError: WebAssembly blocked')
    const blobs = [new Blob(['one']), new Blob(['two'])]
    await expect(composeVideoSegments(blobs)).rejects.toThrow('本地视频合成组件加载失败：CompileError: WebAssembly blocked')
    expect(engine.terminate).toHaveBeenCalledOnce()
    await expect(composeVideoSegments(blobs)).resolves.toBeInstanceOf(Blob)
    expect(engine.load).toHaveBeenCalledTimes(2)
  })

  it('transcodes when stream copy fails and cleans up after failed composition', async () => {
    const { composeVideoSegments } = await import('../videoComposer')
    engine.exec.mockResolvedValueOnce(1).mockResolvedValueOnce(1)
    await expect(composeVideoSegments([new Blob(['one']), new Blob(['two'])])).rejects.toThrow('视频合成失败（FFmpeg 1）')
    expect(engine.exec.mock.calls[1][0]).toContain('libx264')
    expect(engine.deleteFile).toHaveBeenCalledTimes(5)
    expect(engine.readFile).not.toHaveBeenCalled()
  })
})
