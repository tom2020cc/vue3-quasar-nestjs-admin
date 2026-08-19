import { Injectable } from '@nestjs/common'
import { IPlatformAdapter, PlatformMeta, PLATFORMS } from './platform.interface'
import { YoutubeAdapter } from './youtube.adapter'
import { DouyinAdapter } from './douyin.adapter'
import { TiktokAdapter } from './tiktok.adapter'
import { KuaishouAdapter } from './kuaishou.adapter'
import { FacebookAdapter } from './facebook.adapter'
import { InstagramAdapter } from './instagram.adapter'

// 平台适配器工厂：按平台编码分发到对应适配器
// 新增平台时，在此构造函数中注册即可
@Injectable()
export class PlatformAdapterFactory {
  private map: Record<string, IPlatformAdapter>

  constructor(
    youtube: YoutubeAdapter,
    douyin: DouyinAdapter,
    tiktok: TiktokAdapter,
    kuaishou: KuaishouAdapter,
    facebook: FacebookAdapter,
    instagram: InstagramAdapter,
  ) {
    this.map = {
      [youtube.code]: youtube,
      [douyin.code]: douyin,
      [tiktok.code]: tiktok,
      [kuaishou.code]: kuaishou,
      [facebook.code]: facebook,
      [instagram.code]: instagram,
    }
  }

  // 根据平台编码获取适配器
  get(code: string): IPlatformAdapter | undefined {
    return this.map[code]
  }

  // 获取全部适配器
  all(): IPlatformAdapter[] {
    return Object.values(this.map)
  }

  // 获取全部平台元信息（供前端展示）
  listMeta(): PlatformMeta[] {
    return PLATFORMS
  }
}
