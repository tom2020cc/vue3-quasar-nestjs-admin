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
