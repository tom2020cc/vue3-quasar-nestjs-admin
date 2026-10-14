import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcileAiDraft } from '../src/utils/aiDraft.ts'

const row = { id: 'folder/a.mp4', originalTitle: 'a', title: 'Edited', description: 'Applied', fingerprint: '123:456' }
const result = { ...row, sourceTitle: row.title, sourceDescription: row.description, title: 'Preview', selected: true, error: '' }
const data = { version: 1 as const, modelId: 'm', language: 'English', context: '', mode: 'seo' as const, rows: [row], results: [result] }
test('restores applied copy then matching preview without restarting generation', () => {
  const restored = reconcileAiDraft(data, [{ ...row, title: 'a', description: '' }])
  assert.equal(restored.rows[0].title, 'Edited')
  assert.equal(restored.results[0].title, 'Preview')
  assert.equal(restored.skipped, 0)
})
test('does not restore copy onto replaced, removed, or renamed source files', () => {
  for (const rows of [[], [{ ...row, fingerprint: '999:888' }], [{ ...row, originalTitle: 'changed' }]]) {
    const restored = reconcileAiDraft(data, rows)
    assert.equal(restored.rows.length, 0)
    assert.equal(restored.results.length, 0)
  }
})
test('drops stale preview when its saved source text no longer matches applied copy', () => {
  assert.equal(reconcileAiDraft({ ...data, results: [{ ...result, sourceDescription: 'stale' }] }, [row]).results.length, 0)
})
