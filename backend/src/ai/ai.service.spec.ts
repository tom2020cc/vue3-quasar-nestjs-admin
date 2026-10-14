import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { AiModel } from './ai-model.entity'
import { AiService } from './ai.service'

describe('AI model configuration and text generation', () => {
  let db: DataSource, service: AiService, fetchMock: jest.SpyInstance
  const config = { name: 'Test model', provider: 'deepseek', baseUrl: 'https://api.example.test', model: 'test-model', apiKey: 'fake-private-key', enabled: true }
  const input = { mode: 'translate', language: 'English', title: '挖掘机演示', description: '', context: '' }
  const reply = (content: any) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }] }))
  beforeEach(async () => {
    db = await new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [AiModel], synchronize: true }).initialize()
    service = new AiService(db.getRepository(AiModel))
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(reply({ title: 'Excavator demonstration', description: '' }))
  })
  afterEach(async () => { fetchMock.mockRestore(); await db.destroy() })
  it('never exposes keys; preserves blank edited keys and isolates ownership', async () => {
    const created = await service.save(1, config)
    expect(JSON.stringify(created)).not.toContain(config.apiKey)
    expect(created.hasKey).toBe(true)
    await service.save(1, { name: 'Renamed', apiKey: '' }, created.id)
    expect((await service.get(1, created.id)).apiKey).toBe(config.apiKey)
    expect(await service.list(2)).toEqual([])
    await expect(service.get(2, created.id)).rejects.toThrow('不属于')
    await expect(service.remove(2, created.id)).rejects.toThrow()
    expect(JSON.stringify(await service.list(1))).not.toContain(config.apiKey)
  })
  it('requires fresh credentials when changing destination and rejects unsafe URL formats', async () => {
    const created = await service.save(1, config)
    await expect(service.save(1, { baseUrl: 'https://other.example.test' }, created.id)).rejects.toThrow('重新输入')
    for (const baseUrl of ['http://external.example.test', 'https://user:password@example.test', 'https://example.test/?key=secret', 'file:///tmp']) await expect(service.save(1, { ...config, baseUrl })).rejects.toThrow('配置无效')
    await expect(service.save(1, { ...config, ownerId: 2 })).rejects.toThrow()
  })
  it('translates titles without adding or deleting existing descriptions', async () => {
    const created = await service.save(1, config)
    fetchMock.mockImplementation(async () => reply({ title: 'Excavator demonstration', description: 'Should not apply to translation' }))
    expect(await service.generate(1, { ...input, modelId: created.id })).toEqual({ title: 'Excavator demonstration', description: '' })
    expect((await service.generate(1, { ...input, description: '原详情', modelId: created.id })).description).toBe('原详情')
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error')
  })
  it('description-only generation keeps the current title and sends video-specific facts and prior descriptions', async () => {
    const created = await service.save(1, config)
    fetchMock.mockResolvedValue(reply({ title: 'Model tries to rename', description: 'Specific excavator demonstration.' }))
    const data = { ...input, mode: 'description', modelId: created.id, context: '型号 SH12', avoidDescriptions: ['Other description'] }
    const result = await service.generate(1, data)
    expect(result.title).toBe(input.title)
    expect(result.description).toBe('Specific excavator demonstration.')
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(JSON.parse(sent.messages[1].content)).toEqual({ title: input.title, description: '', facts: data.context, avoidDescriptions: data.avoidDescriptions })
  })
  it('validates SEO results and keeps failure responses secret-free', async () => {
    const created = await service.save(1, config)
    fetchMock.mockResolvedValue(reply({ title: 'Excavator', description: 'Product demonstration.' }))
    expect((await service.generate(1, { ...input, mode: 'seo', modelId: created.id })).description).toBe('Product demonstration.')
    for (const data of [{ title: 'x'.repeat(101), description: '' }, { title: '<invalid>', description: '' }, { title: '', description: '' }, { title: 'Good', description: 'x'.repeat(5001) }]) {
      fetchMock.mockResolvedValue(reply(data))
      await expect(service.generate(1, { ...input, modelId: created.id })).rejects.toThrow('格式不合要求')
    }
    fetchMock.mockResolvedValue(new Response('fake-private-key upstream error', { status: 401 }))
    await expect(service.test(1, created.id)).rejects.toThrow('API Key 无效')
    fetchMock.mockRejectedValue(new Error('fake-private-key network error'))
    await expect(service.test(1, created.id)).rejects.toThrow('无法读取模型响应')
  })
  it('rejects disabled models and duplicate requests, and releases the request lock', async () => {
    const created = await service.save(1, config)
    let resolve: (r: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const first = service.test(1, created.id)
    await new Promise(r => setImmediate(r))
    await expect(service.test(1, created.id)).rejects.toThrow('已有模型请求')
    resolve(reply({ title: 'OK', description: '' })); await first
    await service.save(1, { enabled: false }, created.id)
    await expect(service.test(1, created.id)).rejects.toThrow('已停用')
    await service.save(1, { enabled: true }, created.id)
    expect((await service.test(1, created.id)).ok).toBe(true)
  })
  it('generates folder metadata with independent style settings and preserves titles by default', async () => {
    const model = await service.save(1, config)
    fetchMock.mockImplementation(async () => reply({ title: 'Unwanted title', description: 'A specific rig introduction.' }))
    const options = { titleMode: 'keep', length: 'brief', tone: 'technical', instructions: 'No emoji.' }
    const result = await service.generate(1, { ...input, mode: 'metadata', modelId: model.id, options })
    expect(result.title).toBe(input.title)
    expect(result.description).toBe('A specific rig introduction.')
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent.messages[0].content).toContain('Use 1-2 concise sentences')
    expect(sent.messages[0].content).toContain('precise technical terminology')
    expect(JSON.parse(sent.messages[1].content).writingPreferences).toBe('No emoji.')
    expect((await service.generate(1, { ...input, mode: 'metadata', modelId: model.id, options: { ...options, titleMode: 'translate' } })).title).toBe('Unwanted title')
    for (const options of [{ length: 'unlimited' }, { instructions: 'a'.repeat(1001) }, { apiKey: 'not-allowed' }]) {
      await expect(service.generate(1, { ...input, modelId: model.id, options })).rejects.toThrow('设置无效')
    }
  })
  it('translates a playlist name without generating video descriptions or changing the source', async () => {
    const model = await service.save(1, config)
    fetchMock.mockResolvedValue(reply({ title: 'Split-Type Electric Tunnel Drilling Rigs', description: '' }))
    const result = await service.generate(1, { ...input, mode: 'playlist', title: '分体式电动坑道钻机', modelId: model.id })
    expect(result).toEqual({ title: 'Split-Type Electric Tunnel Drilling Rigs', description: '' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toContain('video titles provide context only')
  })

})
