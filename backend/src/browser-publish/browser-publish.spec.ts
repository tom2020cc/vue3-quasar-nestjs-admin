import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BrowserPublishService, validateVideoUrl } from './browser-publish.service'
import { BrowserPublishController } from './browser-publish.controller'

describe('TikTok web-only publishing records', () => {
  let root: string, service: BrowserPublishService, cwd: jest.SpyInstance
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'web-publish-test-')); cwd = jest.spyOn(process, 'cwd').mockReturnValue(root); service = new BrowserPublishService() })
  afterEach(() => { cwd.mockRestore(); rmSync(root, { recursive: true, force: true }) })
  it('isolates accounts, manual results and screenshots by user', () => {
    const account = service.add(1, 'andjacktom1')
    expect(() => service.recordWebPublication(2, {accountId: account.id, caption:'test', url:'https://www.tiktok.com/@andjacktom1/video/123'})).toThrow('不存在')
    expect(service.list(2).accounts).toHaveLength(0)
    expect(() => service.screenshotPath(2, 'unknown')).toThrow('不存在')
  })
  it('rejects foreign accounts and misleading URLs', () => {
    for (const url of ['https://www.tiktok.com/@other/video/123', 'https://www.tiktok.com.evil.test/@andjacktom1/video/123', 'https://user:pass@www.tiktok.com/@andjacktom1/video/123', 'http://www.tiktok.com/@andjacktom1/video/123']) {
      expect(() => validateVideoUrl(url, 'andjacktom1')).toThrow()
    }
  })
  it('persists a manual result without treating it as automatic verification; duplicate links are idempotent', () => {
    const account = service.add(1, '@AndJackTom1')
    const dto = {accountId:account.id, caption:'test', url:'https://www.tiktok.com/@andjacktom1/video/123'}
    const job = service.recordWebPublication(1, dto)
    expect(job.status).toBe('confirmed_by_user')
    expect(job.message).toContain('未自动验证')
    expect(service.recordWebPublication(1, {...dto, url:dto.url+'?share=1'}).id).toBe(job.id)
    expect(service.recordWebPublication(1, {...dto, url:'https://www.tiktok.com/@AndJackTom1/video/123'}).id).toBe(job.id)
    expect(new BrowserPublishService().list(1).jobs).toHaveLength(1)
    expect(service.list(2).jobs).toHaveLength(0)
  })
  it('retains incomplete legacy records without opening a browser or resending', () => {
    ;(service as any).store.jobs.push({ id:'old', owner:1, accountId:'x', status:'submitting' })
    ;(service as any).save()
    const record = new BrowserPublishService().list(1).jobs[0]
    expect(record.status).toBe('needs_attention')
    expect(record.message).toContain('不会自动重发')
  })
  it('retired endpoints fail instead of creating an independent browser or submitting', () => {
    const controller = new BrowserPublishController(service)
    for (const operation of ['open','verify','create','submit','check']) expect(() => controller[operation]()).toThrow('已切换')
  })
})
