export const TIKTOK_PRIVACY_LEVELS = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'] as const
export type TiktokPrivacy = typeof TIKTOK_PRIVACY_LEVELS[number]

export function tiktokError(code: string, message?: string): string {
  if (code === 'unaudited_client_can_only_post_to_private_accounts') return '应用尚未通过 TikTok 直发审核：测试需使用私密账号，并选择“仅自己可见”。仅选择“仅自己可见”不会把账号改为私密；公开自动发布需通过审核。[' + code + ']'
  if (code === 'privacy_level_option_mismatch') return '账号允许的可见性已变化，请重新检查账号并选择可见性。[' + code + ']'
  if (code === 'scope_not_authorized') return '缺少 video.publish 发布权限，请重新授权 TikTok 账号。[' + code + ']'
  if (code === 'access_token_invalid') return 'TikTok 授权已过期，请重新授权账号。[' + code + ']'
  return `${code} ${message || ''}`.trim()
}
