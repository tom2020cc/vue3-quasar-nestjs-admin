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
  id: number
  taskId: number
  platform: string
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
}

// 分片大小：5MB（大文件按此切分上传）
export const CHUNK_SIZE = 5 * 1024 * 1024

// 上传单个分片（onProgress 返回该分片 0-100 的进度）
export const uploadChunk = (
  uploadId: string,
  chunkIndex: number,
  blob: Blob,
  onProgress?: (percent: number) => void,
) => {
  const formData = new FormData()
  formData.append('file', blob, `chunk_${chunkIndex}`)
  return request<{ msg: string; data: { uploadId: string; chunkIndex: number } }>({
    method: 'POST',
    url: '/video-upload/chunk',
    params: { uploadId, chunkIndex },
    data: formData,
    timeout: 600000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    },
  })
}

// 查询已上传的分片索引（用于断点续传）
export const getUploadedChunks = (uploadId: string) =>
  request<{ msg: string; data: { uploadId: string; uploaded: number[] } }>({
    method: 'GET',
    url: '/video-upload/chunks',
    params: { uploadId },
  })

// 合并分片为最终视频文件
export const mergeChunks = (payload: {
  uploadId: string
  fileName: string
  totalChunks: number
  mimetype?: string
}) =>
  request<{ msg: string; data: VideoUploadResult }>({
    method: 'POST',
    url: '/video-upload/merge',
    data: payload,
    timeout: 600000,
  })

// 创建发布任务
export const createPublishTask = (data: CreatePublishTaskPayload) =>
  request<PublishTask>({ method: 'POST', url: '/publish', data })

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
  request<BatchPublishResult>({ method: 'POST', url: '/publish/batch', data: { items } })

// 发布任务列表
export const getPublishTasks = () =>
  request<PublishTask[]>({ method: 'GET', url: '/publish' })

// 发布任务详情
export const getPublishTask = (id: number) =>
  request<PublishTaskDetail>({ method: 'GET', url: `/publish/${id}` })

// 重试发布
export const retryPublishTask = (id: number) =>
  request({ method: 'POST', url: `/publish/${id}/retry` })

// 删除发布任务
export const removePublishTask = (id: number) =>
  request({ method: 'DELETE', url: `/publish/${id}` })
