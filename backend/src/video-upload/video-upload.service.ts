import { Injectable } from '@nestjs/common'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'fs'
import { join, extname } from 'path'
import { createHash } from 'crypto'

// 视频最终目录与分片临时目录
const videoDir = join(process.cwd(), 'uploads', 'videos')
export const chunksDir = join(videoDir, '.chunks')

// 上传 ID 只保留安全字符，避免路径穿越
export function sanitizeUploadId(id: string): string {
  return (id || '').replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown'
}

// 根据扩展名推断 MIME 类型
export function guessMime(filename: string): string {
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.flv': 'video/x-flv',
  }
  return map[extname(filename).toLowerCase()] || 'video/mp4'
}

// 生成随机视频文件名（与单文件上传保持一致格式，供单文件/分片合并共用）
export function randomVideoName(ext: string): string {
  const randomName = Array(8)
    .fill(null)
    .map(() => Math.round(Math.random() * 9).toString(36))
    .join('')
  return `${Date.now()}-${randomName}${ext}`
}

export interface MergeResult {
  ok: boolean
  missing?: number[]
  filename?: string
  size?: number
  hash?: string
}

@Injectable()
export class VideoUploadService {
  // 查询某 uploadId 已上传的分片索引（升序）
  uploadedChunks(uploadId: string): number[] {
    const dir = join(chunksDir, sanitizeUploadId(uploadId))
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => /^chunk_\d+$/.test(f))
      .map((f) => Number(f.replace('chunk_', '')))
      .sort((a, b) => a - b)
  }

  // 将分片按序合并为最终视频文件，同时计算内容哈希（用于后续重复检测）
  async mergeChunks(uploadId: string, fileName: string, totalChunks: number): Promise<MergeResult> {
    const dir = join(chunksDir, sanitizeUploadId(uploadId))

    // 校验分片是否齐全
    const missing: number[] = []
    for (let i = 0; i < totalChunks; i++) {
      if (!existsSync(join(dir, `chunk_${i}`))) missing.push(i)
    }
    if (missing.length > 0) return { ok: false, missing }

    const finalName = randomVideoName(extname(fileName) || '.mp4')
    const finalPath = join(videoDir, finalName)
    mkdirSync(videoDir, { recursive: true })

    // 边写边算 SHA-256
    const hash = createHash('sha256')
    const writeStream = createWriteStream(finalPath)
    for (let i = 0; i < totalChunks; i++) {
      const buf = readFileSync(join(dir, `chunk_${i}`))
      hash.update(buf)
      if (!writeStream.write(buf)) {
        await new Promise<void>((resolve) => writeStream.once('drain', () => resolve()))
      }
    }
    writeStream.end()
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve())
      writeStream.on('error', reject)
    })

    // 清理分片目录
    try {
      for (let i = 0; i < totalChunks; i++) unlinkSync(join(dir, `chunk_${i}`))
      rmdirSync(dir)
    } catch {
      // 清理失败不影响上传结果
    }

    return {
      ok: true,
      filename: finalName,
      size: statSync(finalPath).size,
      hash: hash.digest('hex'),
    }
  }
}
