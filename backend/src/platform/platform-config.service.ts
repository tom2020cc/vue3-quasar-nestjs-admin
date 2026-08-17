import {
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PlatformConfig } from './entities/platform-config.entity'
import { CreatePlatformConfigDto } from './dto/create-platform-config.dto'
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto'
import {
  PlatformMeta,
  PLATFORMS,
  OAuthTokenResult,
} from './adapters/platform.interface'

@Injectable()
export class PlatformConfigService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(PlatformConfig)
    private readonly configRepo: Repository<PlatformConfig>,
  ) {}

  // 启动时若配置表为空，则按平台元信息写入 4 条默认配置（凭证留空，演示时走模拟发布）
  async onApplicationBootstrap() {
    const count = await this.configRepo.count()
    if (count === 0) {
      const seeds = PLATFORMS.map((p: PlatformMeta) =>
        this.configRepo.create({ code: p.code, name: p.name, enabled: p.available }),
      )
      await this.configRepo.save(seeds)
      console.log('已初始化平台配置：' + PLATFORMS.map((p) => p.code).join(' / '))
    }
  }

  findAll() {
    return this.configRepo.find()
  }

  // 返回「平台元信息 + 当前配置值」合并结果，前端配置页一次拿到全部信息
  async findAllWithMeta() {
    const configs = await this.configRepo.find()
    return PLATFORMS.map((meta: PlatformMeta) => {
      const cfg = configs.find((c) => c.code === meta.code)
      return { ...meta, config: cfg || null }
    })
  }

  async findByCode(code: string) {
    return this.configRepo.findOne({ where: { code } })
  }

  async create(dto: CreatePlatformConfigDto) {
    const exist = await this.findByCode(dto.code)
    if (exist) {
      throw new NotFoundException('该平台配置已存在，请直接编辑')
    }
    const config = this.configRepo.create(dto)
    return this.configRepo.save(config)
  }

  async update(id: number, dto: UpdatePlatformConfigDto) {
    const config = await this.configRepo.findOne({ where: { id } })
    if (!config) {
      throw new NotFoundException('未找到该平台配置')
    }
    return this.configRepo.save({ ...config, ...dto })
  }

  async remove(id: number) {
    const config = await this.configRepo.findOne({ where: { id } })
    if (!config) {
      throw new NotFoundException('未找到该平台配置')
    }
    return this.configRepo.remove(config)
  }

  // OAuth 授权成功后，把令牌回写到对应平台配置
  async saveTokens(code: string, tokens: OAuthTokenResult) {
    const config = await this.findByCode(code)
    if (!config) {
      throw new NotFoundException('未找到该平台配置')
    }
    if (tokens.accessToken) config.accessToken = tokens.accessToken
    if (tokens.refreshToken) config.refreshToken = tokens.refreshToken
    if (tokens.openId) config.openId = tokens.openId
    if (tokens.expiresIn) {
      config.tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000)
    }
    return this.configRepo.save(config)
  }
}
