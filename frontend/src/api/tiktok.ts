import request from '@/utils/request'

// TikTok 频道视频信息
export interface TiktokVideo {
  id: string
  title: string
  description: string
  cover: string
  url: string
  createTime: string
  duration: number // 秒
  width: number
  height: number
  viewCount?: number
  likeCount?: number
  commentCount?: number
  shareCount?: number
}

// 拉取当前已授权 TikTok 账号已发布的视频
export const getTiktokVideos = () =>
  request<{ msg: string; data: TiktokVideo[] }>({ method: 'GET', url: '/tiktok/videos' })
