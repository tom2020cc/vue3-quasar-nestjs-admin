import type { AiDraftData, AiText } from '../api/ai'

// A scan ticket expires on server restart. Size + modification time is only a
// restoration guard, never an authorization to import or publish a file.
export function reconcileAiDraft(data: AiDraftData, current: AiText[]) {
  const files = new Map(current.map(row => [row.id, row]))
  const matches = (row: AiText) => {
    const file = files.get(row.id)
    return !!file && !!row.fingerprint && row.fingerprint === file.fingerprint && row.originalTitle === file.originalTitle
  }
  const rows = data.rows.filter(matches)
  const restored = new Map(rows.map(row => [row.id, row]))
  const results = data.results.filter(row => {
    const source = restored.get(row.id) || files.get(row.id)
    return matches(row) && source?.title === row.sourceTitle && source?.description === row.sourceDescription
  })
  return { rows, results, skipped: data.rows.length - rows.length + data.results.length - results.length }
}
