import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { WebPublicationDto } from './browser-publish.dto'

export type JobState = 'preparing' | 'review' | 'submitting' | 'success' | 'needs_attention' | 'confirmed_by_user'
export interface BrowserAccount { id: string; owner: number; username: string }
export interface BrowserJob {
  id: string; owner: number; accountId: string; username: string; videoFilename: string; caption: string;
  hash: string; status: JobState; message: string; createdAt: string; updatedAt: string; externalUrl?: string;
  source?: 'web_manual'
}
interface Store { accounts: BrowserAccount[]; jobs: BrowserJob[] }

export function validateVideoUrl(value: string, username: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new BadRequestException('请输入完整 TikTok 视频链接') }
  const match = /^\/@([a-zA-Z0-9._]+)\/video\/(\d+)$/.exec(url.pathname)
  if (url.protocol !== 'https:' || url.hostname !== 'www.tiktok.com' || url.port || url.username || url.password || !match || match[1].toLowerCase() !== username.toLowerCase()) {
    throw new BadRequestException('视频链接必须属于本次目标 TikTok 账号，格式为 https://www.tiktok.com/@用户名/video/编号')
  }
  return `https://www.tiktok.com/@${username.toLowerCase()}/video/${match[2]}`
}

@Injectable()
export class BrowserPublishService {
  private dir = resolve(process.cwd(), '.browser-publish')
  private file = join(this.dir, 'records.json')
  private store: Store
  constructor() {
    mkdirSync(this.dir, { recursive: true })
    this.store = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : { accounts: [], jobs: [] }
    for (const job of this.store.jobs) {
      if (['preparing', 'review', 'submitting'].includes(job.status)) {
        job.status = 'needs_attention'
        job.message = '已切换为官方网页发布。旧任务结果待核对，不会自动重发；请在 TikTok 作品列表检查后保存链接。'
      }
    }
    this.save()
  }
  private save() {
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.store, null, 2))
    renameSync(tmp, this.file)
  }
  private account(owner: number, id: string) {
    const a = this.store.accounts.find(a => a.owner === owner && a.id === id)
    if (!a) throw new NotFoundException('目标账号不存在')
    return a
  }
  private job(owner: number, id: string) {
    const job = this.store.jobs.find(j => j.owner === owner && j.id === id)
    if (!job) throw new NotFoundException('网页发布记录不存在')
    return job
  }
  list(owner: number) {
    return { accounts: this.store.accounts.filter(a => a.owner === owner).map(a => ({ id: a.id, username: a.username })),
      jobs: this.store.jobs.filter(j => j.owner === owner).slice().reverse().map(j => ({ ...j, hasScreenshot: existsSync(join(this.dir, `${j.id}.png`)) })) }
  }
  add(owner: number, username: string) {
    username = username.trim().replace(/^@/, '').toLowerCase()
    if (!/^[a-z0-9._]{2,24}$/.test(username)) throw new BadRequestException('请填写正确的 TikTok 用户名')
    const old = this.store.accounts.find(a => a.owner === owner && a.username === username)
    if (old) return old
    const a = { id: randomUUID(), owner, username }
    this.store.accounts.push(a); this.save(); return a
  }
  recordWebPublication(owner: number, dto: WebPublicationDto) {
    const account = this.account(owner, dto.accountId)
    const url = validateVideoUrl(dto.url.trim(), account.username)
    const caption = dto.caption.trim()
    if (!caption) throw new BadRequestException('请填写视频标题或文案')
    // Repeated clicks and different share query parameters must not duplicate a publication.
    const old = this.store.jobs.find(j => j.owner === owner && j.externalUrl === url)
    if (old) return old
    const now = new Date().toISOString()
    const job: BrowserJob = { id: randomUUID(), owner, accountId: account.id, username: account.username,
      videoFilename: '', caption, hash: '', status: 'confirmed_by_user', source: 'web_manual',
      message: '用户在 TikTok 核对后登记了视频链接；仅保存记录，未自动验证发布结果或公开状态。',
      createdAt: now, updatedAt: now, externalUrl: url }
    this.store.jobs.push(job); this.save(); return job
  }
  confirmResult(owner: number, id: string, value: string) {
    const job = this.job(owner, id)
    const url = validateVideoUrl(value.trim(), job.username)
    if (this.store.jobs.some(j => j.owner === owner && j.id !== id && j.externalUrl === url)) throw new ConflictException('此视频链接已有记录，请查看已有结果')
    job.externalUrl = url
    job.status = 'confirmed_by_user'
    job.message = '用户在 TikTok 核对后保存了视频链接；此结果为人工确认，非程序自动验证。'
    job.updatedAt = new Date().toISOString(); this.save(); return job
  }
  screenshotPath(owner: number, id: string) {
    this.job(owner, id)
    const path = join(this.dir, `${id}.png`)
    if (!existsSync(path)) throw new NotFoundException('暂时没有截图')
    return path
  }
}
