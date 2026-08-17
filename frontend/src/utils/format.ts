// 字节 → 可读大小
export function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// 秒 → 可读时长
export function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '0 秒'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
}

// 数字千分位（播放/点赞/评论数）
export function formatCount(n: number | undefined): string {
  if (!n) return '0'
  return n.toLocaleString('en-US')
}
