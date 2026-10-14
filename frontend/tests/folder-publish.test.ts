import { test } from 'node:test'
import assert from 'node:assert/strict'
import { folderVideoPayload, resolveFolderPlaylist, ensureUniqueFolderTitles, folderPublishState } from '../src/utils/folderPublish.ts'

test('only reports actual completed publication and playlist insertion as successful', () => {
  assert.equal(folderPublishState().kind, 'active')
  assert.equal(folderPublishState({ status: 'processing', mock: false }).kind, 'active')
  assert.equal(folderPublishState({ status: 'success', mock: true }).kind, 'attention')
  assert.equal(folderPublishState({ status: 'success', mock: false, youtubePlaylistId: 'list', youtubePlaylistAdded: false }).kind, 'attention')
  assert.equal(folderPublishState({ status: 'success', mock: false, youtubePlaylistId: 'list', youtubePlaylistAdded: true }).kind, 'success')
  assert.equal(folderPublishState({ status: 'failed', mock: false }).kind, 'attention')
})

test('uses exact file title, blank details, selected channel and playlist for portrait video', () => {
  const payload = folderVideoPayload({ title: '设备演示', upload: { filename: 'saved.mp4', hash: 'digest', size: 10, url: '/uploads/videos/saved.mp4', mimetype: 'video/mp4' }, width: 1080, height: 1920, duration: 12 }, 'account-b', 'playlist-b')
  assert.equal(payload.title, '设备演示')
  assert.equal(payload.description, '')
  assert.equal(payload.orientation, 'portrait')
  assert.equal(payload.youtubeAccountId, 'account-b')
  assert.equal(payload.youtubePlaylistId, 'playlist-b')
  assert.deepEqual(payload.platforms, ['youtube'])
  assert.throws(() => folderVideoPayload({ title: '未准备' }, 'account-b', 'playlist-b'))
})
test('reuses existing title and never calls create', async () => {
  assert.equal(await resolveFolderPlaylist('产品', null, async () => [{ id: 'existing', title: '产品' }], async () => { throw new Error('must not create') }), 'existing')
})
test('creates only when absent; a later retry reuses created playlist', async () => {
  const lists: { id: string; title: string }[] = []
  let calls = 0
  const create = async () => { calls++; lists.push({ id: 'new', title: '产品' }); return { id: 'new' } }
  assert.equal(await resolveFolderPlaylist('产品', null, async () => lists, create), 'new')
  assert.equal(await resolveFolderPlaylist('产品', null, async () => lists, create), 'new')
  assert.equal(calls, 1)
})
test('requires a choice for duplicate names and rejects removed selections', async () => {
  const list = async () => [{ id: 'one', title: '产品' }, { id: 'two', title: '产品' }]
  const create = async () => { throw new Error('must not create') }
  await assert.rejects(resolveFolderPlaylist('产品', null, list, create), /多个同名/)
  assert.equal(await resolveFolderPlaylist('产品', 'two', list, create), 'two')
  await assert.rejects(resolveFolderPlaylist('产品', 'deleted', list, create), /已变化/)
})

test('publishes reviewed AI text while retaining channel and playlist mapping', () => {
  const p = folderVideoPayload({ title: 'Excavator demonstration', description: 'Product demonstration.', upload: { filename: 'saved.mp4', hash: 'digest', size: 10, url: '/uploads/videos/saved.mp4', mimetype: 'video/mp4' }, width: 1920, height: 1080 }, 'channel', 'list')
  assert.equal(p.title, 'Excavator demonstration')
  assert.equal(p.description, 'Product demonstration.')
  assert.equal(p.orientation, 'landscape')
  assert.equal(p.youtubePlaylistId, 'list')
})

test('AI title collisions use suffixes without taking an existing numbered title', () => {
  const rows = [{ title: 'Equipment' }, { title: 'Equipment' }, { title: 'Equipment_1' }]
  assert.equal(ensureUniqueFolderTitles(rows), 1)
  assert.deepEqual(rows.map(r => r.title), ['Equipment', 'Equipment_2', 'Equipment_1'])
  assert.equal(ensureUniqueFolderTitles(rows), 0)
})

test('AI edits cannot rename a title already submitted for publishing', () => {
  const rows = [{ title: 'Equipment' }, { title: 'Equipment', taskId: 'submitted' }]
  assert.equal(ensureUniqueFolderTitles(rows), 1)
  assert.deepEqual(rows.map(r => r.title), ['Equipment_1', 'Equipment'])
})
