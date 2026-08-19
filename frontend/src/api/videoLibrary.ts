import request from '@/utils/request'

// 视频库条目
export interface VideoItem {
  id: number
  title: string
  description?: string
  videoFilename: string
  videoUrl: string
  videoPath?: string
  videoSize: number
  width: number
  height: number
  orientation: 'landscape' | 'portrait'
  videoHash?: string
  duration?: number
  cover?: string
  createTime?: string
  updateTime?: string
}

// 视频库列表（含封面）
export const getVideoLibrary = () =>
  request<VideoItem[]>({ method: 'GET', url: '/video-library' })

// 视频库详情
export const getVideoItem = (id: number) =>
  request<VideoItem>({ method: 'GET', url: `/video-library/${id}` })

// 删除视频库记录
export const removeVideoItem = (id: number) =>
  request({ method: 'DELETE', url: `/video-library/${id}` })

// 重复项（轻量字段）
export interface VideoDuplicateItem {
  id: number
  title: string
  videoFilename: string
  videoSize: number
  orientation: 'landscape' | 'portrait'
  createTime?: string
}

// 重复分组：同一内容哈希下的多条记录
export interface VideoDuplicateGroup {
  hash: string
  count: number
  items: VideoDuplicateItem[]
}

// 重复检测结果
export interface VideoDuplicatesResult {
  total: number
  groups: VideoDuplicateGroup[]
}

// 检测视频库中的重复记录（按内容哈希分组）
export const getVideoLibraryDuplicates = () =>
  request<VideoDuplicatesResult>({ method: 'GET', url: '/video-library/duplicates' })
