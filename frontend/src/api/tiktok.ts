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
export const getTiktokVideos = (accountId: string) =>
  request<{ msg: string; data: TiktokVideo[] }>({ method: 'GET', url: '/tiktok/videos', params: { accountId }, timeout: 120000 })

export interface TiktokAccount {
  id: string
  openId: string | null
  displayName: string
  label: string
  enabled: boolean
  verified: boolean
  hasCredential: boolean
}
export const getTiktokAccounts = () => request<TiktokAccount[]>({ method: 'GET', url: '/tiktok/accounts' })
export const updateTiktokAccount = (id: string, data: { enabled?: boolean; label?: string }) =>
  request<TiktokAccount>({ method: 'PATCH', url: `/tiktok/accounts/${id}`, data })
export const identifyTiktokAccount = (id: string) =>
  request<TiktokAccount>({ method: 'POST', url: `/tiktok/accounts/${id}/identify`, timeout: 60000 })
export const tiktokAccountLabel = (a: TiktokAccount) => `${[a.label, a.displayName].filter(Boolean).join(' · ') || 'TikTok 账号'} · ${a.openId ? a.openId.slice(-8) : '未识别'}`

export interface TiktokCreatorInfo { nickname: string; username: string; privacyLevels: string[]; maxDuration: number }
export const getTiktokCreatorInfo = (accountId: string) => request<TiktokCreatorInfo>({ method: 'GET', url: '/tiktok/creator-info', params: { accountId }, timeout: 60000 })
export const tiktokPrivacyLabel = (level?: string | null) => ({ PUBLIC_TO_EVERYONE: '公开', MUTUAL_FOLLOW_FRIENDS: '互相关注的朋友', FOLLOWER_OF_CREATOR: '关注者', SELF_ONLY: '仅自己可见' }[level || ''] || '未选择（旧记录）')
