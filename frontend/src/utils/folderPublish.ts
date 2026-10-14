import type { CreatePublishTaskPayload, PublishRecord, VideoUploadResult } from '../api/publish'

export function folderPublishState(record?: Pick<PublishRecord, 'status' | 'mock' | 'youtubePlaylistId' | 'youtubePlaylistAdded' | 'youtubeDeletedAt'>) {
  if (!record) return { kind: 'active', label: '正在核对结果', color: 'info' }
  if (record.youtubeDeletedAt) return { kind: 'attention', label: '旧视频已删除（历史记录）', color: 'grey' }
  if (record.mock) return { kind: 'attention', label: '模拟记录，未实际发布', color: 'grey' }
  if (record.status === 'success') {
    if (record.youtubePlaylistId && !record.youtubePlaylistAdded) return { kind: 'attention', label: '视频已上传，列表待核对', color: 'warning' }
    return { kind: 'success', label: '发布成功', color: 'positive' }
  }
  if (record.status === 'processing') return { kind: 'active', label: 'YouTube 转码处理中', color: 'info' }
  if (record.status === 'publishing' || record.status === 'pending') return { kind: 'active', label: '上传中', color: 'orange' }
  return { kind: 'attention', label: record.status === 'skipped' ? '已跳过' : '需处理', color: 'warning' }
}

export function folderVideoPayload(row: { title: string; description?: string; upload?: VideoUploadResult; width?: number; height?: number; duration?: number }, accountId: string, playlistId: string): CreatePublishTaskPayload {
  if (!row.upload || !row.width || !row.height || !accountId || !playlistId) throw new Error('素材或发布目标不完整')
  return {
    title: row.title, description: row.description || '', videoFilename: row.upload.filename, videoHash: row.upload.hash,
    width: row.width, height: row.height, duration: row.duration,
    orientation: row.width >= row.height ? 'landscape' : 'portrait',
    platforms: ['youtube'], youtubeAccountId: accountId, youtubePlaylistId: playlistId,
  }
}

// Dependencies are explicit to verify creation/reuse without contacting YouTube.
export async function resolveFolderPlaylist(title: string, selectedId: string | null,
  list: () => Promise<{ id: string; title: string }[]>, create: () => Promise<{ id: string }>) {
  const matches = (await list()).filter(p => p.title === title)
  if (selectedId) {
    if (!matches.some(p => p.id === selectedId)) throw new Error('所选列表已变化，请重新检查')
    return selectedId
  }
  if (matches.length > 1) throw new Error('有多个同名列表，请重新检查并选择一个')
  return matches[0]?.id || (await create()).id
}

// Re-apply after local AI edits and rescans so translated names cannot collide either.
export function ensureUniqueFolderTitles(rows: { title: string; taskId?: string | number }[]) {
  const key = (s: string) => s.normalize('NFKC').trim().toLowerCase()
  const reserved = new Set(rows.map(r => key(r.title)))
  const used = new Set(rows.filter(r => r.taskId).map(r => key(r.title)))
  let renamed = 0
  for (const row of rows) {
    if (row.taskId) continue
    const base = row.title.trim()
    let title = base, n = 1
    if (used.has(key(title))) {
      do { const suffix = `_${n++}`; title = base.slice(0, 100 - suffix.length) + suffix } while (used.has(key(title)) || reserved.has(key(title)))
      renamed++
    }
    row.title = title; used.add(key(title))
  }
  return renamed
}
