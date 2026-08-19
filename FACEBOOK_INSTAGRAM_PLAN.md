# Facebook / Instagram 视频发布接入方案

> 适用场景：**自用**（发布自己的账号）。走 Meta 官方 Graph API，Development Mode 即可，无需完整 App Review。
> 配套决策：Instagram 需要公网视频 URL，采用**对象存储（S3/OSS/COS）**托管视频。

---

## 一、目标与范围

| 项 | 内容 |
|----|------|
| 新增平台 | Facebook Page（视频帖）、Instagram Business（Reels/视频） |
| 授权方式 | Facebook Login for Business（OAuth2 授权码 + 长短期 token 链） |
| 视频托管 | 接对象存储，生成公网/预签名 URL 供 Instagram 抓取 |
| 前端改动 | 极小（两处硬编码平台列表补 facebook/instagram） |
| 风控策略 | 官方 API + Development Mode 自用，无需住宅代理（见第六节） |

---

## 二、Meta 官方 API 关键事实（2026，v25.0）

### 2.1 Instagram（Content Publishing API）
- **仅支持 Business / Creator 专业账号**（个人账号不支持）；Reels 发布目前仅支持 **Business**。
- 权限：`instagram_business_basic` + `instagram_business_content_publish`（旧 `instagram_basic`/`instagram_content_publish` 已于 2025-01-27 废弃）。
- **视频必须提供公网可访问的 `video_url`**，不能直接传二进制（这是与抖音/TikTok 最大的差异）。
- 三步流程：建容器 → 轮询 `status_code` → `media_publish`。容器 24h 内未发布即失效。
- 限流：每账号 **25 条 / 24h**；平台级约 200 次调用 / 小时。

### 2.2 Facebook（Page 视频上传）
- 权限：`pages_manage_posts` + `pages_read_engagement` + `pages_show_list`。
- **必须用 Page Access Token**（不是用户 token，否则报 `#100 No permission`）。
- 上传：可恢复上传（`upload_phase=start/transfer/finish`，支持断点续传），也支持 `file_url` 直传公网 URL。

---

## 三、后端架构改造

### 3.1 新增平台编码与元信息（`platform/adapters/platform.interface.ts`）

```ts
export enum PlatformCode {
  DOUYIN_CN = 'douyin_cn',
  YOUTUBE = 'youtube',
  TIKTOK = 'tiktok',
  KUAISHOU = 'kuaishou',
  FACEBOOK = 'facebook',   // 新增
  INSTAGRAM = 'instagram', // 新增
}
```

`PLATFORMS` 数组新增两条：

```ts
{
  code: PlatformCode.FACEBOOK,
  name: 'Facebook',
  orientations: [Orientation.LANDSCAPE, Orientation.PORTRAIT], // FB 视频帖横竖屏均可
  description: 'Facebook Graph API（Page 视频上传）',
  apiBase: 'https://graph.facebook.com',
  requiredFields: ['appId(client_id)', 'appSecret(client_secret)', 'accessToken(Page Token)'],
  available: true,
},
{
  code: PlatformCode.INSTAGRAM,
  name: 'Instagram',
  orientations: [Orientation.PORTRAIT], // Reels 竖屏 9:16
  description: 'Instagram Content Publishing API（需 Business 账号 + 对象存储 URL）',
  apiBase: 'https://graph.facebook.com',
  requiredFields: ['appId(client_id)', 'appSecret(client_secret)', 'accessToken', 'videoUrl'],
  available: true,
},
```

### 3.2 接口扩展

```ts
// PublishVideoInput 增加公网视频 URL（IG 必需，FB 可选）
export interface PublishVideoInput {
  // ...现有字段
  publicUrl?: string
}

// IPlatformAdapter 增加标记：发布前是否需要先把视频托管到对象存储
export interface IPlatformAdapter extends IOAuthProvider {
  // ...现有字段
  readonly requiresPublicUrl?: boolean // 默认 false
}

// OAuthTokenResult 增加 extra（Meta 需要回写 pageId / pageAccessToken / igUserId）
export interface OAuthTokenResult {
  accessToken?: string
  refreshToken?: string
  openId?: string
  expiresIn?: number
  extra?: Record<string, any> // 新增
}
```

`platform-config.service.ts` 的 `saveTokens` 增加：`if (tokens.extra) config.extra = { ...(config.extra || {}), ...tokens.extra }`。

### 3.3 对象存储模块（新增 `platform/storage/`）

```ts
// 接口（provider 无关）
export interface VideoStorage {
  // 把本地文件上传到对象存储，返回供平台抓取的 URL（预签名或公开）
  upload(localPath: string, key: string): Promise<string>
}
```

- 默认实现 **S3**（`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`，OSS/COS 均提供 S3 兼容端点，可复用；若走原生 SDK 再单独实现 `OssStorage`/`CosStorage`）。
- 上传后生成**预签名 GET URL**（过期时间 48h，覆盖 IG 的 24h 容器窗口），不公开整桶。
- 环境变量：
  ```
  STORAGE_ENDPOINT=        # 兼容 S3 的自定义端点（OSS/COS 填）
  STORAGE_REGION=
  STORAGE_BUCKET=
  STORAGE_ACCESS_KEY=
  STORAGE_SECRET_KEY=
  STORAGE_URL_EXPIRES=172800   # 预签名有效期（秒）
  ```

### 3.4 Facebook 适配器（`facebook.adapter.ts`）

- `requiresPkce = false`，`requiresPublicUrl = false`（走二进制可恢复上传，不依赖对象存储）。
- **Token 链**（在 `exchangeCode` 里一次完成并回写）：
  1. `POST /oauth/access_token`（code → 短期用户 token）
  2. `GET /oauth/access_token?grant_type=fb_exchange_token`（→ 60 天长期 token）
  3. `GET /me/accounts`（→ 取 Page id + Page token）
  4. 返回 `{ accessToken: 长期token, openId: pageId, expiresIn: 5184000, extra: { pageId, pageAccessToken } }`
- **publish**（可恢复上传，复用流式分片）：
  1. `POST /{page-id}/videos?upload_phase=start&file_size=<size>` → `upload_session_id`
  2. `POST /{upload_session_id}?upload_phase=transfer&start_offset=<n>`，body 为二进制分片，循环直至传完（复用 `readFileChunks` 流式）
  3. `POST /{upload_session_id}?upload_phase=finish`（附 `title`/`description`）→ 返回 `video_id`，`pending: true`
- **queryStatus**：`GET /{video-id}?fields=status` → `status.video_status === 'ready'` 则 success，`error` 则 failed，其余 processing。
- `refresh` 省略（Meta 无 refresh_token 机制，过期需重新授权）。

### 3.5 Instagram 适配器（`instagram.adapter.ts`）

- `requiresPkce = false`，**`requiresPublicUrl = true`**。
- **Token 链**（`exchangeCode`）：
  1. 同上换取 60 天长期 token
  2. `GET /me/accounts` 取 Page token
  3. `GET /{page-id}?fields=instagram_business_account` → `igUserId`
  4. 返回 `{ accessToken: 长期token, openId: igUserId, expiresIn: 5184000, extra: { pageId, pageAccessToken, igUserId } }`
- **publish**（建容器，用对象存储 URL）：
  1. `POST /{ig-user-id}/media?media_type=REELS&video_url=<publicUrl>&caption=<title>` → `container_id`（用 `input.publicUrl`）
  2. 返回 `{ success: true, pending: true, externalId: container_id }`
- **queryStatus**（复用现有轮询模型，`externalId` = 容器 id）：
  1. `GET /{container-id}?fields=status_code`
  2. `FINISHED` → `POST /{ig-user-id}/media_publish?creation_id=<container>` 拿到媒体 id，返回 success
  3. `IN_PROGRESS` → processing；`ERROR`/`EXPIRED` → failed
- `refresh` 省略。

### 3.6 发布流水线接入（`publish/publish.service.ts`）

在 `publishOne` 组装 `PublishVideoInput` 时：

```ts
let publicUrl: string | undefined
if (adapter.requiresPublicUrl) {
  publicUrl = await this.storageService.upload(task.videoPath, task.videoFilename)
}
// ... 传入 adapter.publish({ ..., publicUrl })
```

- 只在 IG 触发对象存储上传；YouTube/TikTok/抖音/快手/FB 不受影响。
- 对象存储上传失败 → 该记录直接 `failed`（message 标明存储上传失败）。

### 3.7 工厂注册（`platform-adapter.factory.ts`）

构造函数注入并注册 `facebook`、`instagram` 两个适配器，`all()` / `get()` 自动生效。

---

## 四、前端改动点（精确到位置）

前端整体是 `PLATFORMS` 元信息驱动，只需补两处硬编码：

| 文件 | 位置 | 改动 |
|------|------|------|
| `frontend/src/views/VideoPublishView.vue` | `:452-455` 平台图标/颜色映射表 | 新增 `facebook: { icon: 'facebook', color: 'blue' }`、`instagram: { icon: 'photo_camera', color: 'pink' }` |
| `frontend/src/views/PlatformConfigView.vue` | `:224-225` 「已授权」判断 | 新增 `facebook` 判断（`c.accessToken && c.extra?.pageId`）、`instagram` 判断（`c.accessToken && c.extra?.igUserId`） |

可选（不做也不影响发布）：
- `PlatformTutorialView.vue:49-51` 教程页平台列表，可补 FB/IG 接入教程。
- 若后续要「拉取已发布视频列表」，再仿照 Youtube/TikTok 视图加 FB/IG 列表页 + 菜单项（本次自用发布不必须）。

---

## 五、Meta App 配置步骤（自用 · Development Mode）

1. 在 [developers.facebook.com](https://developers.facebook.com) 新建 App（类型选 **Business**）。
2. 添加产品 **Facebook Login for Business**。
3. 配置 OAuth 回调地址（与现有 OAuth 回调格式一致）：
   - `http://localhost:5001/platform/facebook/oauth/callback`
   - `http://localhost:5001/platform/instagram/oauth/callback`
4. Development Mode 下把自己加为管理员/测试用户（**免审核即可授权**）。
5. 申请权限（Dev 模式直接放行）：`pages_show_list`、`pages_read_engagement`、`pages_manage_posts`、`instagram_business_basic`、`instagram_business_content_publish`。
6. 准备账号资产：一个 Facebook 账号 + 一个 Facebook Page + 一个 **Instagram 专业账号（Business）** 绑定该 Page。
7. 在「平台配置」页填 `appId(client_id)` + `appSecret(client_secret)`，点「授权」走 OAuth，自动回填 token + pageId + igUserId。

---

## 六、风控与代理结论（自用场景）

**核心结论：自用 + 官方 API 场景，不需要配置静态住宅代理。**

- Development Mode 下只有你自己能授权，Meta 不把你当「第三方应用」严查。
- 风控真正看的是：**App 权限是否正确、token 类型是否正确、限流是否超（IG 25/24h）、内容是否搬运刷量**，而不是你服务器的出口 IP。
- 你只需保证：服务器出口 IP **稳定**（普通云服务器固定 IP 即可）、与账号常登地区一致即可。

**什么时候才需要住宅代理（本次不做）：**
- 未来从「自用」扩展到「对外 SaaS、批量管理多个客户账号」时，才需要「一账号一固定静态住宅 IP + 地理匹配 + 养号」，且那属于账号管理环节，不在 API 代码内。

---

## 七、实施清单（Step by Step）

1. [ ] `platform.interface.ts`：加 `FACEBOOK`/`INSTAGRAM` 枚举 + 元信息 + `PublishVideoInput.publicUrl` + `requiresPublicUrl` + `OAuthTokenResult.extra`
2. [ ] 新增 `platform/storage/`：`VideoStorage` 接口 + S3 实现 + module；`platform.module.ts` 引入
3. [ ] `facebook.adapter.ts`：OAuth token 链 + 可恢复上传 publish + queryStatus
4. [ ] `instagram.adapter.ts`：OAuth token 链（含 igUserId 解析）+ 建容器 publish + queryStatus（含 media_publish）
5. [ ] `platform-adapter.factory.ts` 注册两个适配器
6. [ ] `platform-config.service.ts`：`saveTokens` 支持 `extra` 回写
7. [ ] `publish.service.ts`：`requiresPublicUrl` 分支，接 `storageService.upload`
8. [ ] 前端两处硬编码补齐（`VideoPublishView` 图标、`PlatformConfigView` 授权判断）
9. [ ] `.env` 补对象存储配置 + README 说明
10. [ ] 本地联调：未授权走模拟发布 → 授权后真实发布 → 状态轮询收尾

---

## 八、风险与边界

- **IG 只支持专业账号**：个人账号无法通过 API 发布，需提前转 Business。
- **IG 视频 URL 必须公网可达**：预签名 URL 过期前 Meta 必须完成抓取（48h 足够）；若抓取失败会报 `Error 36003`（无法下载视频），需重试。
- **限流**：IG 25 条/24h，批量发布需控制节奏，避免批量模式一次性打满。
- **Meta token 60 天失效**：无 refresh 机制，过期后需在配置页重新授权。
- **App Review**：本次自用走 Development Mode，不触发审核；若将来对外，需另走 Advanced Access（见方案 A/B 档）。

---

## 参考资料

- [Instagram Posting API (2026) — PostPeer](https://www.postpeer.dev/blog/best-instagram-posting-api)
- [Instagram Graph API 2026 常见疑问 — Zernio](https://zernio.com/blog/instagram-graph-api)
- [Instagram API 2026 变更说明 — Storrito](https://storrito.com/resources/instagram-api-2026/)
- [Facebook Graph API Posting Guide — Postproxy](https://postproxy.dev/blog/facebook-graph-api-posting-guide/)
- [Instagram App Review UI bug（新 scopes 卡 0 调用）— Stack Overflow](https://stackoverflow.com/questions/79899217/instagram-graph-api-cannot-get-green-checkmark-for-instagram-business-scopes-i)
- [静态住宅 vs 数据中心 IP 选型 — loongproxy](https://www.loongproxy.com/ipdaili/17401.html)
