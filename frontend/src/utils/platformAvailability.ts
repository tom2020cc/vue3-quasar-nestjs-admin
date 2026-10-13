import type { PlatformWithConfig } from '@/api/platform'
import type { YoutubeAccount } from '@/api/youtube'

// 当前工作台仅开放已完成接入的 YouTube；其他平台保留在接入设置中。
export const isReadyYoutubeAccount = (account: YoutubeAccount) =>
  account.enabled && account.verified && account.hasCredential && !!account.channelId

export function isPublishPlatformReady(platform: PlatformWithConfig, accounts: YoutubeAccount[]) {
  return platform.code === 'youtube' && platform.available !== false &&
    platform.config?.enabled !== false && accounts.some(isReadyYoutubeAccount)
}
