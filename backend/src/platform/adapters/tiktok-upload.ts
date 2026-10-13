import { open } from 'fs/promises'

// https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide
// TikTok uses floor(size / chunkSize); trailing bytes belong to the final chunk.
export function tiktokUploadPlan(size: number) {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('视频大小无效')
  const chunkSize = size <= 64 * 1024 * 1024 ? size : 10 * 1024 * 1024
  const totalChunkCount = Math.floor(size / chunkSize)
  if (totalChunkCount > 1000) throw new Error('视频超过 TikTok 分片数量上限')
  return { chunkSize, totalChunkCount }
}

export async function* readTiktokChunks(filePath: string, size: number) {
  const { chunkSize, totalChunkCount } = tiktokUploadPlan(size)
  const file = await open(filePath, 'r')
  try {
    if ((await file.stat()).size !== size) throw new Error('视频大小发生变化，请重新上传本地文件')
    for (let index = 0; index < totalChunkCount; index++) {
      const offset = index * chunkSize
      const length = index === totalChunkCount - 1 ? size - offset : chunkSize
      const buffer = Buffer.allocUnsafe(length)
      let read = 0
      while (read < length) {
        const { bytesRead } = await file.read(buffer, read, length - read, offset + read)
        if (!bytesRead) throw new Error('视频读取不完整，请重新上传本地文件')
        read += bytesRead
      }
      yield { buffer, offset, final: index === totalChunkCount - 1 }
    }
  } finally { await file.close() }
}
