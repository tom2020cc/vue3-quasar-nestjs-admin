// 各平台接入注意事项 & 防封号指南（平台配置页 + 接入教程页共用同一份数据源）
export interface GuideSection {
  title: string
  icon: string
  color: string
  items: string[]
}

export const guideSections: GuideSection[] = [
  {
    title: '通用接入注意点',
    icon: 'info',
    color: 'primary',
    items: [
      '授权前请先填好 appId / appSecret，并把回调地址登记到对应平台控制台，否则 OAuth 授权会失败。',
      '未配置真实凭证时，发布走「模拟模式」，仅演示流程，不会真正发到平台。',
      '抖音、快手需企业认证，个人开发者暂不可接入；油管、TikTok、Facebook、Instagram 个人可用。',
      '授权回调后，令牌会自动回填到本页，无需手动粘贴 token。',
    ],
  },
  {
    title: '防止封号核心原则（最重要）',
    icon: 'shield',
    color: 'negative',
    items: [
      '只用官方开放平台 API + OAuth 授权发布，绝不使用浏览器自动化、模拟点击或爬虫脚本——这是导致封号的最主要原因，且违反平台条款。',
      '控制发布频率，不要短时间批量刷帖：Instagram 每账号 24 小时最多发布 25 条，平台级约 200 次调用/小时。',
      '避免重复搬运：同一个视频反复发到多个账号 / 多个平台，比更换 IP 更容易触发风控。',
      '内容合规：不发布侵权、违规、低质或误导性内容。',
      '令牌类型要正确：Facebook 必须用 Page Access Token（页面令牌），Instagram 必须用专业账号，用错会直接报错。',
    ],
  },
  {
    title: '关于 IP / 住宅代理',
    icon: 'dns',
    color: 'teal',
    items: [
      '自用单账号走官方 API：不需要住宅代理，只需服务器出口 IP 固定、且与账号常登地区一致即可（普通云服务器固定 IP 足够）。',
      '住宅代理只在「批量管理多个账号」或「非官方自动化」时才需要，且后者违反条款、不建议使用。',
      '若确需多账号：一账号一固定静态住宅 IP + 地理匹配 + 先养号（浏览/互动）再发帖，避免同一 IP 挂多个账号。',
    ],
  },
  {
    title: 'Facebook / Instagram 特别提醒',
    icon: 'share',
    color: 'indigo',
    items: [
      'Instagram API 仅支持专业账号（Business / Creator），且必须绑定一个 Facebook Page；普通个人号无法通过 API 发布。',
      'Instagram 视频必须先托管到对象存储拿「公网可访问的 URL」，不能直接上传二进制（与抖音/TikTok 不同）。',
      'Development Mode 下只有 App 成员能授权：要把程序给别人用，需对方自建 Meta App，或你把他加为 App 测试者。',
      'Meta 令牌约 60 天过期且无 refresh 刷新机制，过期后需在本页重新点击「授权」。',
      'Instagram Reels 通过 API 发布目前仅支持 Business 账号（Creator 不支持）。',
    ],
  },
  {
    title: '对象存储配置（Instagram 需要）',
    icon: 'cloud_upload',
    color: 'deep-orange',
    items: [
      'Instagram 通过 API 发布要求视频先有「公网可访问的 URL」，不能直接上传二进制；系统会在发布前把视频传到 S3 兼容对象存储并生成预签名 URL。',
      '在 backend/.env 填好 STORAGE_ENDPOINT / STORAGE_REGION / STORAGE_BUCKET / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY（AWS S3 / 阿里云 OSS / 腾讯云 COS / MinIO 均可），填完重启后端生效。',
      '存储桶需公网可读，预签名 URL 需在 Instagram 抓取期间保持有效；URL 失效会报 Error 36003。',
      'Facebook / 油管 / TikTok / 抖音 / 快手 直接上传二进制，无需配置对象存储。',
    ],
  },
]
