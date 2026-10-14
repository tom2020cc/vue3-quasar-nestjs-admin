import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { AiFolderDraft } from './ai-draft.entity'
import { AiDraftService } from './ai-draft.service'

describe('persistent folder AI drafts', () => {
  let db: DataSource, service: AiDraftService
  const row = { id: '钻机/a.mp4', originalTitle: 'a', title: 'English title', description: 'Applied copy', fingerprint: '123:456' }
  const data = { version: 1, modelId: 'model-id', language: 'English', context: '真实参数', mode: 'seo', rows: [row], results: [{ ...row, sourceTitle: row.title, sourceDescription: row.description, selected: true, error: '' }] }
  beforeEach(async () => {
    db = await new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [AiFolderDraft], synchronize: true }).initialize()
    service = new AiDraftService(db.getRepository(AiFolderDraft))
  })
  afterEach(async () => { await db.destroy() })
  it('restores full draft from a new service instance and isolates users and folders', async () => {
    await service.save(1, { folder: '钻机', revision: 0, data })
    const fresh = new AiDraftService(db.getRepository(AiFolderDraft))
    expect((await fresh.get(1, '钻机')).data).toEqual(data)
    expect(await fresh.get(2, '钻机')).toBeNull()
    expect(await fresh.get(1, '其他')).toBeNull()
    await fresh.save(2, { folder: '钻机', revision: 0, data: { ...data, context: 'Other user' } })
    expect((await fresh.get(1, '钻机')).data.context).toBe('真实参数')
  })
  it('rejects stale and concurrent writes instead of silently replacing another browser', async () => {
    await service.save(1, { folder: '钻机', revision: 0, data })
    const outcomes = await Promise.allSettled([service.save(1, { folder: '钻机', revision: 1, data }), service.save(1, { folder: '钻机', revision: 1, data })])
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((await service.get(1, '钻机')).revision).toBe(2)
    await expect(service.save(1, { folder: '钻机', revision: 0, data })).rejects.toThrow('另一页面')
  })
  it('rejects credentials, invalid paths, foreign rows and invalid versions', async () => {
    for (const input of [
      { folder: '../钻机', revision: 0, data },
      { folder: '钻机', revision: 0, data: { ...data, apiKey: 'must-not-be-stored' } },
      { folder: '钻机', revision: 0, data: { ...data, rows: [{ ...row, id: '其他/a.mp4' }] } },
      { folder: '钻机', revision: -1, data },
      { folder: '钻机', revision: 0, ownerId: 2, data },
    ]) await expect(service.save(1, input)).rejects.toThrow()
    expect(await service.get(1, '钻机')).toBeNull()
  })
  it('persists playlist preview, applied name and custom settings without accepting secrets or invalid options', async () => {
    const folderAi = { playlistTitle: 'Electric Rigs', playlistPreview: 'Tunnel Drilling Rigs', playlistSource: 'Electric Rigs', previewTitleMode: 'keep', options: { titleMode: 'translate', length: 'brief', tone: 'technical', instructions: 'No emoji' } }
    await service.save(1, { folder: '钻机', revision: 0, data: { ...data, mode: 'metadata', folderAi } })
    expect((await service.get(1, '钻机')).data.folderAi).toEqual(folderAi)
    for (const invalid of [{ ...folderAi, playlistTitle: '<bad>' }, { ...folderAi, options: { apiKey: 'secret' } }, { ...folderAi, options: { tone: 'invalid' } }]) {
      await expect(service.save(1, { folder: '钻机', revision: 1, data: { ...data, folderAi: invalid } })).rejects.toThrow()
    }
    expect((await service.get(1, '钻机')).revision).toBe(1)
  })

})
