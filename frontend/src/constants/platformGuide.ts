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
      '控制发布频率，按平台当前配额和接口返回处理限流，避免短时间重复提交。',
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
      'Instagram 直接登录支持企业 / 创作者账号，无需绑定 Facebook 公共主页；旧 Facebook Login 方式才需要关联主页。',
      '本项目当前 Instagram 视频实现使用对象存储 URL；本地二进制直传尚未接入和实测。',
      '先按 Meta 控制台要求配置应用角色 / 测试账号；面向其他用户时核对访问级别、审核和验证要求。',
      'Instagram 直接登录的有效长期访问令牌可以刷新；过期或撤销后需要重新授权。无需填写 refresh_token。',
      'Instagram 企业与创作者账号均可接入 Reels 内容发布；最终以权限授权和真实发布结果为准。',
    ],
  },
  {
    title: '对象存储配置（Instagram 需要）',
    icon: 'cloud_upload',
    color: 'deep-orange',
    items: [
      '本项目当前 Instagram 上传方式：发布前把视频传到 S3 兼容对象存储，生成平台可读取的预签名 URL。',
      '在 backend/.env 填好 STORAGE_ENDPOINT / STORAGE_REGION / STORAGE_BUCKET / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY（AWS S3 / 阿里云 OSS / 腾讯云 COS / MinIO 均可），填完重启后端生效。',
      '对象存储的下载地址须能被 Instagram 访问，预签名 URL 在抓取期间应保持有效；不需要把整个存储桶设为公开。',
      'Facebook / 油管 / TikTok / 抖音 / 快手 直接上传二进制，无需配置对象存储。',
    ],
  },
]
