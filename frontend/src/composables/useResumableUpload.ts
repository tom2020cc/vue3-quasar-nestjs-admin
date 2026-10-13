import { reactive } from 'vue'
import { CHUNK_SIZE, initializeUpload, uploadChunk, mergeChunks, type UploadSessionInput, type VideoUploadResult } from '@/api/publish'

export interface UploadState {
  stage: 'idle' | 'hashing' | 'uploading' | 'paused' | 'merging' | 'done' | 'error'
  name: string; percent: number; bytes: number; total: number; speed: number; resumed: number
  message: string; index: number; count: number
}
export function useResumableUpload() {
  const state = reactive<UploadState>({ stage: 'idle', name: '', percent: 0, bytes: 0, total: 0, speed: 0, resumed: 0, message: '', index: 1, count: 1 })
  const fingerprints = new WeakMap<File, UploadSessionInput>()
  let paused = false
  let disposed = false
  let controller: AbortController | undefined
  let wake: (() => void) | undefined
  const check = () => { if (disposed) throw new DOMException('上传已停止，重新选择同一文件可恢复', 'AbortError') }
  async function gate() {
    check()
    if (paused) await new Promise<void>(resolve => { wake = resolve })
    check()
  }
  function pause() {
    if (!['hashing', 'uploading'].includes(state.stage)) return
    paused = true
    state.stage = 'paused'
    state.speed = 0
    controller?.abort()
  }
  function resume() { paused = false; wake?.(); wake = undefined }
  function dispose() { disposed = true; controller?.abort(); resume() }
  function reset() { state.stage = 'idle'; state.message = ''; state.bytes = state.percent = state.speed = 0 }
  async function request<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    let failures = 0
    while (true) {
      await gate()
      controller = new AbortController()
      try { return await action(controller.signal) } catch (error: any) {
        check()
        if (paused) { await gate(); continue }
        const status = error.response?.status
        if ((status && status < 500 && status !== 429) || failures >= 2) throw error
        failures++
        state.message = `连接中断，正在重试（${failures}/2）`
        await new Promise(resolve => setTimeout(resolve, failures * 1000))
      }
    }
  }
  async function digest(data: ArrayBuffer) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('')
  }
  async function upload(file: File, index = 1, count = 1): Promise<VideoUploadResult> {
    check()
    Object.assign(state, { name: file.name, stage: 'hashing', percent: 0, bytes: 0, total: file.size, speed: 0, resumed: 0, message: '', index, count })
    try {
      if (file.size <= 0 || file.size > 500 * 1024 * 1024) throw new Error('请选择 0–500 MB 的视频文件')
      let input = fingerprints.get(file)
      if (!input) {
        const chunkHashes: string[] = []
        for (let start = 0; start < file.size; start += CHUNK_SIZE) {
          await gate()
          state.stage = 'hashing'
          chunkHashes.push(await digest(await file.slice(start, start + CHUNK_SIZE).arrayBuffer()))
          state.percent = Math.round(Math.min(file.size, start + CHUNK_SIZE) / file.size * 100)
        }
        input = { uploadId: await digest(new TextEncoder().encode(chunkHashes.join('')).buffer), fileName: file.name, fileSize: file.size, chunkHashes }
        fingerprints.set(file, input)
      }
      await gate()
      const session = (await request(signal => initializeUpload(input!, signal))).data.data
      check()
      if (session.result) {
        Object.assign(state, { stage: 'done', bytes: file.size, percent: 100, resumed: file.size, message: '已恢复本地文件，无需重复上传' })
        return session.result
      }
      const uploaded = new Set(session.uploaded)
      let committed = [...uploaded].reduce((sum, i) => sum + Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE), 0)
      state.resumed = committed
      let started = performance.now()
      let initial = committed
      const report = (bytes: number) => {
        if (paused || disposed) return
        state.bytes = bytes
        state.percent = Math.min(100, Math.floor(bytes / file.size * 100))
        state.speed = (bytes - initial) / Math.max(0.2, (performance.now() - started) / 1000)
      }
      report(committed)
      for (let i = 0; i < input.chunkHashes.length; i++) {
        if (uploaded.has(i)) continue
        const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        await request(signal => {
          state.stage = 'uploading'
          started = performance.now()
          initial = committed
          return uploadChunk(input!.uploadId, i, chunk, percent => report(committed + chunk.size * percent / 100), signal)
        })
        committed += chunk.size
        report(committed)
      }
      await gate()
      state.stage = 'merging'
      state.message = ''
      state.speed = 0
      const merged = (await request(signal => mergeChunks(input!.uploadId, signal))).data.data
      check()
      if (!merged?.filename) throw new Error('未收到合并结果，请重试恢复上传')
      Object.assign(state, { stage: 'done', bytes: file.size, percent: 100, message: '视频已完整保存到本地' })
      return merged
    } catch (error: any) {
      state.stage = 'error'
      state.speed = 0
      state.message = error.response?.data?.message || error.message || '上传中断，已完成分片已保留'
      throw error
    }
  }
  return { state, upload, pause, resume, dispose, reset }
}
