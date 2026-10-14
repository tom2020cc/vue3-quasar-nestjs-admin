import request from '@/utils/request'

// 视频上传返回
export interface VideoUploadResult {
  filename: string
  url: string
  size: number
  mimetype: string
  hash?: string
}

// 发布任务
export interface PublishTask {
  id: number
  title: string
  description?: string
  videoFilename: string
  videoUrl: string
  videoSize: number
  width: number
  height: number
  orientation: 'landscape' | 'portrait'
  videoHash?: string
  duration?: number
  cover?: string
  status: 'publishing' | 'success' | 'partial' | 'failed' | 'skipped'
  createTime?: string
  updateTime?: string
}

// 平台发布记录
export interface PublishRecord {
  youtubeDeletedAt?: string | null
  id: number
  taskId: number
  platform: string
  tiktokPrivacyLevel?: string | null
  tiktokAccountId?: string | null
  targetTiktokName?: string | null
  targetTiktokOpenId?: string | null
  youtubeAccountId?: string | null
  targetChannelId?: string | null
  targetChannelTitle?: string | null
  youtubePlaylistId?: string | null
  youtubePlaylistTitle?: string | null
  youtubePlaylistAdded?: boolean
  status: 'pending' | 'skipped' | 'publishing' | 'processing' | 'success' | 'failed'
  message?: string
  externalId?: string
  externalUrl?: string
  mock: boolean
  duplicate?: boolean // 是否为重复视频（去重跳过）
  pollCount?: number // 已轮询次数（processing 状态下用于展示进度）
  publishedAt?: string
}

export interface PublishTaskDetail extends PublishTask {
  records: PublishRecord[]
}

export interface CreatePublishTaskPayload {
  title: string
  description?: string
  videoFilename: string
  orientation: 'landscape' | 'portrait'
  width: number
  height: number
  videoHash?: string
  duration?: number
  cover?: string
  platforms: string[]
  youtubeAccountId?: string
  youtubePlaylistId?: string
  tiktokPrivacyLevel?: string | null
  tiktokAccountId?: string
}

// 分片大小：5MB（大文件按此切分上传）
export const CHUNK_SIZE = 5 * 1024 * 1024

export interface UploadSessionInput { uploadId: string; fileName: string; fileSize: number; chunkHashes: string[] }
export const initializeUpload = (data: UploadSessionInput, signal?: AbortSignal) =>
  request<{ data: { uploaded: number[]; result?: VideoUploadResult } }>({ method: 'POST', url: '/video-upload/session', data, signal, timeout: 120000 })

export const uploadChunk = (uploadId: string, chunkIndex: number, blob: Blob, onProgress?: (percent: number) => void, signal?: AbortSignal) => {
  const data = new FormData()
  data.append('file', blob, `chunk_${chunkIndex}`)
  return request({ method: 'POST', url: '/video-upload/chunk', params: { uploadId, chunkIndex }, data, signal, timeout: 600000,
    onUploadProgress: e => { if (e.total) onProgress?.(Math.min(100, e.loaded / e.total * 100)) },
  })
}
export const mergeChunks = (uploadId: string, signal?: AbortSignal) =>
  request<{ data: VideoUploadResult }>({ method: 'POST', url: '/video-upload/merge', data: { uploadId }, signal, timeout: 600000 })

// 创建发布任务
export const createPublishTask = (data: CreatePublishTaskPayload) =>
  request<PublishTask>({ method: 'POST', url: '/publish', data, timeout: 120000 })

// 批量发布返回项
export interface BatchPublishResultItem {
  index: number
  ok: boolean
  taskId?: number
  message?: string
}

// 批量发布返回
export interface BatchPublishResult {
  msg: string
  total: number
  success: number
  failed: number
  results: BatchPublishResultItem[]
}

// 批量创建发布任务
export const createPublishTaskBatch = (items: CreatePublishTaskPayload[]) =>
  request<BatchPublishResult>({ method: 'POST', url: '/publish/batch', data: { items }, timeout: 600000 })

// 发布任务列表
export const getPublishTasks = () =>
  request<PublishTask[]>({ method: 'GET', url: '/publish' })

// 发布任务详情
export const getPublishTask = (id: number) =>
  request<PublishTaskDetail>({ method: 'GET', url: `/publish/${id}` })

// 重试发布
export const retryPublishTask = (id: number, tiktokPrivacyLevel?: string) =>
  request({ method: 'POST', url: `/publish/${id}/retry`, data: { tiktokPrivacyLevel } })

// 核对已中断的 TikTok 上传，不重新发布
export const checkTiktokPublishStatus = (id: number) =>
  request<PublishTaskDetail>({ method: 'POST', url: `/publish/${id}/tiktok-status`, timeout: 60000 })

export const checkYoutubePublishStatus = (id: number) =>
  request<PublishTaskDetail>({ method: 'POST', url: `/publish/${id}/youtube-status`, timeout: 120000 })

export const releaseDeletedYoutube = (id: number) =>
  request<PublishTaskDetail>({ method: 'POST', url: `/publish/${id}/youtube-deleted`, timeout: 120000 })

// 删除发布任务
export const removePublishTask = (id: number) =>
  request({ method: 'DELETE', url: `/publish/${id}` })
