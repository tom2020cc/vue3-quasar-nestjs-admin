import { writingOptions } from './ai-writing-options'
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AiFolderDraft } from './ai-draft.entity'

@Injectable()
export class AiDraftService {
  constructor(@InjectRepository(AiFolderDraft) private readonly repo: Repository<AiFolderDraft>) {}
  private folder(value: any) {
    if (typeof value !== 'string' || value.length > 1000 || /[\\\x00:]/.test(value) || value.startsWith('/') || value.endsWith('/') || value.split('/').some(p => p === '.' || p === '..' || (!p && value !== ''))) throw new BadRequestException('草稿文件夹路径无效')
    return value
  }
  private validate(data: any, folder: string) {
    const obj = (x: any, keys: string[]) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every(k => keys.includes(k))
    const str = (x: any, max: number) => typeof x === 'string' && x.length <= max
    if (!obj(data, ['version', 'modelId', 'language', 'context', 'mode', 'rows', 'results', 'folderAi']) || data.version !== 1 || !str(data.modelId, 100) || !['English', '简体中文', 'Español', 'Français', 'Deutsch', '日本語'].includes(data.language) || !str(data.context, 2000) || !['translate', 'seo', 'description', 'metadata'].includes(data.mode) || !Array.isArray(data.rows) || !Array.isArray(data.results)) throw new BadRequestException('草稿格式无效')
    if (data.folderAi !== undefined) {
      const f = data.folderAi
      if (!obj(f, ['playlistTitle', 'playlistPreview', 'playlistSource', 'previewTitleMode', 'options']) || !str(f.playlistTitle, 150) || !str(f.playlistPreview, 150) || !str(f.playlistSource, 150) || /[<>\r\n]/.test(f.playlistTitle + f.playlistPreview + f.playlistSource) || (f.previewTitleMode !== undefined && !['keep', 'translate', 'seo'].includes(f.previewTitleMode))) throw new BadRequestException('列表草稿无效')
      writingOptions(f.options)
    }
    const rowKeys = ['id', 'title', 'description', 'fingerprint', 'originalTitle']
    for (const [items, result] of [[data.rows, false], [data.results, true]] as const) {
      const ids = new Set<string>()
      for (const item of items) {
        if (!obj(item, result ? [...rowKeys, 'sourceTitle', 'sourceDescription', 'selected', 'error'] : rowKeys) || !str(item.id, 1200) || !item.id || !str(item.title, 1000) || !str(item.description, 5000) || !str(item.originalTitle, 1000) || !str(item.fingerprint, 100) || !item.fingerprint || item.id.slice(0, item.id.lastIndexOf('/') + 1) !== (folder ? folder + '/' : '') || /[\\\x00]/.test(item.id) || ids.has(item.id)) throw new BadRequestException('草稿视频数据无效')
        if (result && (!str(item.sourceTitle, 1000) || !str(item.sourceDescription, 5000) || typeof item.selected !== 'boolean' || !str(item.error ?? '', 1000))) throw new BadRequestException('草稿预览数据无效')
        ids.add(item.id)
      }
    }
    return data
  }
  async get(ownerId: number, folder: string) {
    const row = await this.repo.findOneBy({ ownerId, folder: this.folder(folder) })
    return row ? { revision: row.revision, updatedAt: row.updatedAt, data: row.data } : null
  }
  async save(ownerId: number, input: any) {
    if (!input || Object.keys(input).some(k => !['folder', 'revision', 'data'].includes(k)) || !Number.isSafeInteger(input.revision) || input.revision < 0) throw new BadRequestException('草稿版本无效')
    const folder = this.folder(input.folder), data = this.validate(input.data, folder), updatedAt = new Date().toISOString()
    const revision = input.revision + 1
    if (input.revision === 0) {
      try { await this.repo.insert({ ownerId, folder, data, revision, updatedAt }) }
      catch (e) { if (await this.repo.existsBy({ ownerId, folder })) throw new ConflictException('另一页面已保存此草稿，请先重新读取，避免覆盖'); throw e }
    } else {
      const result = await this.repo.update({ ownerId, folder, revision: input.revision }, { data, revision, updatedAt })
      if (!result.affected) throw new ConflictException('草稿已在另一页面修改，请先重新读取，避免覆盖')
    }
    return { revision, updatedAt }
  }
}
