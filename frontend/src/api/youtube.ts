import request from '@/utils/request'

// 油管频道视频信息
export interface YoutubeVideo {
  id: string
  title: string
  description: string
  channelTitle: string
  thumbnail: string
  url: string
  publishedAt: string
  duration: number // 秒
  definition: string // hd / sd
  privacyStatus: string // public / private / unlisted
  viewCount?: number
  likeCount?: number
  commentCount?: number
}

// 拉取当前已授权油管账号频道下的所有视频
export const getYoutubeVideos = () =>
  request<{ msg: string; data: YoutubeVideo[] }>({ method: 'GET', url: '/youtube/videos' })
