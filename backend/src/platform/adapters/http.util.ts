import { readFile } from 'fs/promises'
import { createHash, randomBytes } from 'crypto'

// 通用工具：分片、读取文件、延时、OAuth 辅助（供各平台适配器使用）

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 随机 state（OAuth 防 CSRF）
export function randomState(): string {
  return randomBytes(16).toString('hex')
}

// 生成 PKCE code_verifier
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

// 由 code_verifier 计算 code_challenge（S256）
export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

// 表单编码 POST，返回 JSON（解析失败则返回原始文本）
export async function postForm(url: string, params: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return data
}

// 将文件读为 Buffer 并按 chunkSize 分片（用于各平台的分片上传）
export async function readFileChunks(filePath: string, chunkSize: number): Promise<Buffer[]> {
  const buf = await readFile(filePath)
  const chunks: Buffer[] = []
  for (let i = 0; i < buf.length; i += chunkSize) {
    chunks.push(buf.subarray(i, i + chunkSize))
  }
  return chunks
}

// 一次性读取整个文件为 Buffer（用于单次/整体上传）
export async function readFileBuffer(filePath: string): Promise<Buffer> {
  return readFile(filePath)
}
