import request from '@/utils/request'

// 油管频道视频信息
export interface YoutubeVideo {
  id: string
  playlistItemId?: string
  unavailable?: boolean
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
export const getYoutubeVideos = (accountId: string) =>
  request<{ msg: string; data: YoutubeVideo[] }>({ method: 'GET', url: '/youtube/videos', params: { accountId }, timeout: 120000 })

export interface YoutubeAccount {
  id: string
  channelId: string | null
  channelTitle: string
  label: string
  enabled: boolean
  verified: boolean
  hasCredential: boolean
}
export const getYoutubeAccounts = () => request<YoutubeAccount[]>({ method: 'GET', url: '/youtube/accounts' })
export const updateYoutubeAccount = (id: string, data: { enabled?: boolean; label?: string }) =>
  request<YoutubeAccount>({ method: 'PATCH', url: `/youtube/accounts/${id}`, data })
export const identifyYoutubeAccount = (id: string) =>
  request<YoutubeAccount>({ method: 'POST', url: `/youtube/accounts/${id}/identify`, timeout: 60000 })
export const youtubeAccountLabel = (a: YoutubeAccount) => `${a.label ? a.label + ' · ' : ''}${a.channelTitle || '待识别频道'} · ${a.channelId || '未识别'}`

export interface YoutubePlaylist {
  videoIds: string[]
  id: string
  title: string
  description: string
  thumbnail: string
  itemCount: number
  privacyStatus: string
  publishedAt: string
  url: string
}
export const getYoutubePlaylists = (accountId: string, summary = false) =>
  request<{ msg: string; data: YoutubePlaylist[] }>({ method: 'GET', url: '/youtube/playlists', params: { accountId, summary }, timeout: 120000 })
export const createYoutubePlaylist = (data: { accountId: string; title: string; privacyStatus: string }) =>
  request<{ msg: string; data: Pick<YoutubePlaylist, 'id' | 'title' | 'privacyStatus'> }>({ method: 'POST', url: '/youtube/playlists', data, timeout: 60000 })
export const getYoutubePlaylistVideos = (accountId: string, playlistId: string) =>
  request<{ msg: string; data: YoutubeVideo[] }>({ method: 'GET', url: '/youtube/playlist-videos', params: { accountId, playlistId }, timeout: 120000 })
