// Exercise the uploader state machine with fake transport; browser checks cover Vue rendering.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { File } = require('node:buffer')
const { webcrypto } = require('node:crypto')
const { performance } = require('node:perf_hooks')
const vm = require('node:vm')
const ts = require('typescript')
const source = readFileSync(join(__dirname, '../src/composables/useResumableUpload.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const CHUNK_SIZE = 5 * 1024 * 1024
const result = { filename: 'test.mp4', url: '/uploads/videos/test.mp4', size: 12, hash: 'test', mimetype: 'video/mp4' }
function uploader(overrides = {}) {
  const api = { CHUNK_SIZE, initializeUpload: async () => ({ data: { data: { uploaded: [] } } }), uploadChunk: async () => ({}), mergeChunks: async () => ({ data: { data: result } }), ...overrides }
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => name === 'vue' ? { reactive: value => value } : api, crypto: webcrypto, TextEncoder, Uint8Array, ArrayBuffer, DOMException, AbortController, performance, setTimeout })
  return exports.useResumableUpload()
}
const tick = () => new Promise(resolve => setImmediate(resolve))
test('skips committed chunks and recovers completed receipt without sending bytes', async () => {
  const sent = []
  const file = new File([Buffer.alloc(CHUNK_SIZE + 12, 7)], 'sample.mp4')
  const u = uploader({ initializeUpload: async () => ({ data: { data: { uploaded: [0] } } }), uploadChunk: async (_id, i) => { sent.push(i) } })
  await u.upload(file)
  assert.deepEqual(sent, [1]); assert.equal(u.state.resumed, CHUNK_SIZE); assert.equal(u.state.stage, 'done')
  const completed = uploader({ initializeUpload: async () => ({ data: { data: { uploaded: [], result } } }), uploadChunk: () => { throw Error('unexpected upload') }, mergeChunks: () => { throw Error('unexpected merge') } })
  assert.equal((await completed.upload(file)).filename, result.filename)
})
test('pause cancels current request and resume retransmits that chunk once', async () => {
  let ready; const entered = new Promise(resolve => { ready = resolve }); let attempts = 0; let merged = false
  const u = uploader({ uploadChunk: async (_id, _index, _blob, progress, signal) => {
    attempts++; progress(25)
    if (attempts === 1) { ready(); await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })) }
  }, mergeChunks: async () => { merged = true; return { data: { data: result } } } })
  const work = u.upload(new File(['sample-video'], 'sample.mp4'))
  await entered; u.pause(); await tick()
  assert.equal(u.state.stage, 'paused'); assert.equal(merged, false)
  u.resume(); await work
  assert.equal(attempts, 2); assert.equal(u.state.stage, 'done')
})
test('leaving while paused stops the chain before merge or publication', async () => {
  let ready; const entered = new Promise(resolve => { ready = resolve })
  const u = uploader({ uploadChunk: async (_id, _index, _blob, _progress, signal) => {
    ready(); await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }))
  }, mergeChunks: () => { throw Error('must not merge') } })
  const work = u.upload(new File(['test'], 'sample.mp4'))
  const rejected = assert.rejects(work, { name: 'AbortError' })
  await entered; u.pause(); await tick(); u.dispose(); await rejected
})
test('validates file size and uses content fingerprints instead of name collisions', async () => {
  const ids = []
  const u = uploader({ initializeUpload: async data => { ids.push(data.uploadId); return { data: { data: { uploaded: [], result } } } } })
  await assert.rejects(u.upload(new File([], 'empty.mp4')), /500 MB/)
  await u.upload(new File(['aaa'], 'same.mp4', { lastModified: 123 }))
  await u.upload(new File(['bbb'], 'same.mp4', { lastModified: 123 }))
  assert.notEqual(ids[0], ids[1])
  await u.upload(new File(['aaa'], 'renamed.mp4', { lastModified: 456 }))
  assert.equal(ids[0], ids[2])
})
