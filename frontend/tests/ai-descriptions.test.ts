import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duplicateDescription, generateDistinctDescription } from '../src/utils/aiDescriptions.ts'

test('detects repeated descriptions despite punctuation, case and whitespace', () => {
  assert.equal(duplicateDescription(' Equipment, DEMO! ', ['Equipment demo.']), true)
  assert.equal(duplicateDescription('设备 演示。', ['设备演示']), true)
  assert.equal(duplicateDescription('Excavator demonstration.', ['Loader demonstration.']), false)
})
test('regenerates duplicate content using the previous description as avoidance context', async () => {
  const calls: string[][] = []
  const result = await generateDistinctDescription(async avoid => { calls.push(avoid); return { description: calls.length === 1 ? 'Same boilerplate.' : 'Specific excavator demonstration.' } }, ['Same boilerplate.'])
  assert.equal(calls.length, 2)
  assert.ok(calls[1].includes('Same boilerplate.'))
  assert.equal(result.description, 'Specific excavator demonstration.')
})
test('does not accept endless duplicate responses or blank descriptions', async () => {
  let calls = 0
  await assert.rejects(generateDistinctDescription(async () => { calls++; return { description: 'Duplicate' } }, ['Duplicate']), /仍重复/)
  assert.equal(calls, 2)
  await assert.rejects(generateDistinctDescription(async () => ({ description: '  ' }), []), /有效描述/)
})
