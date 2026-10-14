# 视频多平台上传 · 平台配置与接口说明

本系统在现有 Quasar + NestJS 后台之上，新增「视频多平台上传」能力：上传一个视频，按宽屏 / 窄屏自动匹配目标平台，一次发布到多个平台。

> 核心设计：**适配器模式（Strategy）**。每家平台实现同一个 `IPlatformAdapter` 接口，后端用工厂按平台编码分发。新增平台只需「登记元信息 + 写一个适配器」。
>
> 📖 想直接照着操作把某个平台跑通？请看 **[PLATFORM_TUTORIAL.md](./PLATFORM_TUTORIAL.md)**（注册→建应用→拿凭证→授权→发布的步骤化教程）。本文档偏接口与字段规范。

---

## 一、平台 ↔ 尺寸映射

| 尺寸 | 平台编码 | 平台 | 说明 |
| ---- | -------- | ---- | ---- |
| 宽屏（横屏 `landscape`） | `douyin_cn` | 国产抖音 | 宽屏、窄屏均支持 |
| 横屏 / 竖屏（`landscape` / `portrait`） | `youtube` | 油管 YouTube | 两种方向均支持 |
| 宽屏（横屏 `landscape`） | `facebook` | Facebook | 宽屏、窄屏均支持 |
| 窄屏（竖屏 `portrait`） | `douyin_cn` | 国产抖音 | 宽屏、窄屏均支持 |
| 窄屏（竖屏 `portrait`） | `tiktok` | TikTok 海外版 | 仅窄屏 |
| 窄屏（竖屏 `portrait`） | `kuaishou` | 快手 | 仅窄屏 |
| 窄屏（竖屏 `portrait`） | `facebook` | Facebook | 宽屏、窄屏均支持 |
| 窄屏（竖屏 `portrait`） | `instagram` | Instagram | 仅窄屏 |

该映射在后端 `platform/adapters/platform.interface.ts` 的 `PLATFORMS` 中统一定义，前后端共用同一份元信息（前端通过接口拉取），修改一处即可全局生效。发布时后端会校验「所选平台是否支持当前尺寸」，不匹配会直接拒绝。

---

## 二、后端接口一览

除登录/注册外，均需请求头 `Authorization: Bearer <token>`（前端 axios 已自动注入）。

### 1. 平台定义与配置

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/platform/list` | 平台定义列表（编码、名称、支持尺寸、所需配置字段、接口地址） |
| GET | `/platform` | 平台配置列表（元信息 + 已保存的凭证） |
| POST | `/platform` | 新增平台配置（正常情况无需调用，首次启动已自动生成 4 条默认配置） |
| PATCH | `/platform/:id` | 更新平台凭证 / 启用状态 |
| DELETE | `/platform/:id` | 删除平台配置 |

### 2. 视频上传与发布

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| POST | `/video-upload/video` | 上传视频（表单字段 `file`，不设文件大小上限），返回 `filename`/`url`/`size` |
| POST | `/publish` | 创建发布任务（携带已上传视频名 + 尺寸 + 目标平台），异步发布 |
| GET | `/publish` | 发布任务列表 |
| GET | `/publish/:id` | 任务详情（含各平台发布记录） |
| POST | `/publish/:id/retry` | 重试失败/跳过的平台 |
| DELETE | `/publish/:id` | 删除任务 |

### 3. 创建发布任务 `POST /publish` 请求体示例

```json
{
  "title": "我的第一个视频",
  "description": "视频文案（可选）",
  "videoFilename": "1718xxxx.mp4",
  "orientation": "landscape",
  "width": 1920,
  "height": 1080,
  "platforms": ["douyin_cn", "youtube"]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `title` | string | 是 | 视频标题 / 文案 |
| `description` | string | 否 | 视频描述 |
| `videoFilename` | string | 是 | 上一步 `/video-upload/video` 返回的文件名 |
| `orientation` | string | 是 | `landscape`（宽屏）或 `portrait`（窄屏） |
| `width` / `height` | number | 是 | 视频分辨率，用于记录与展示 |
| `platforms` | string[] | 是 | 目标平台编码数组，需与 `orientation` 匹配 |

### 4. OAuth 授权

| 方法 | 路径 | 说明 | 是否需要登录 |
| ---- | ---- | ---- | ------------ |
| GET | `/platform/:code/oauth/url` | 获取授权跳转地址（返回 `{ url }`） | 是 |
| GET | `/platform/:code/oauth/callback` | 授权回调（平台方跳转，换 token 后存库） | 否 |
| POST | `/platform/:code/oauth/refresh` | 用 refresh_token 刷新 access_token | 是 |

---

## 三、各平台配置字段与接口流程

### 3.1 国产抖音 `douyin_cn`（宽屏 + 窄屏）

- **官方文档**：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/video-management/douyin/create-video/video-part-upload-init
- **接口根地址**：`https://open.douyin.com`
- **权限 scope**：`video.create` / `video.create.bind`（需在「能力管理 → 代替用户发布内容到抖音」申请）

| 配置字段 | 实体列 | 必填 | 说明 |
| -------- | ------ | ---- | ---- |
| 应用ID | `appId` | 是 | 开放平台应用的 `client_key` |
| 应用密钥 | `appSecret` | 是 | 应用的 `client_secret` |
| 访问令牌 | `accessToken` | 是 | 用户授权后获得的 access_token |
| open_id | `openId` | 是 | 授权用户的 open_id |

**接口流程（分片上传，大文件适用）**：

```
1) POST /video/part/init/        ?open_id={open_id}         -> upload_id
2) POST /video/part/upload/      ?open_id&upload_id&part_number=1..N   body: video（分片二进制）
3) POST /video/part/complete/    ?open_id&upload_id          -> video_id
4) POST /video/create/           ?open_id   body: { video_id, text }    -> 发布
```

> 单分片建议 20MB；超过 128MB 必须分片；时长 ≤15 分钟。

### 3.2 油管 YouTube `youtube`（横屏、竖屏）

- **官方文档**：https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- **接口根地址**：`https://www.googleapis.com`（OAuth 令牌 `https://oauth2.googleapis.com`）
- **权限 scope**：`https://www.googleapis.com/auth/youtube.upload`

| 配置字段 | 实体列 | 必填 | 说明 |
| -------- | ------ | ---- | ---- |
| 应用ID | `appId` | 是 | Google Cloud OAuth2 的 `client_id` |
| 应用密钥 | `appSecret` | 是 | OAuth2 的 `client_secret` |
| 刷新令牌 | `refreshToken` | 是 | OAuth2 授权后拿到的 refresh_token（用于换 access_token） |

**接口流程（可恢复上传）**：

```
1) POST https://oauth2.googleapis.com/token   grant_type=refresh_token  -> access_token
2) POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
       headers: Authorization Bearer; body: { snippet:{title,description}, status:{privacyStatus} }
       -> 响应头 Location 即上传地址
3) PUT <Location>   body: 视频二进制  -> 返回视频 id
```

### 3.3 TikTok 海外版 `tiktok`（窄屏）

- **官方文档**：https://developers.tiktok.com/doc/content-posting-api-get-started
- **接口根地址**：`https://open.tiktokapis.com`
- **权限 scope**：`video.publish`（发布）；`video.list`（「TikTok 视频」列表功能，需额外添加 Video List 产品）

| 配置字段 | 实体列 | 必填 | 说明 |
| -------- | ------ | ---- | ---- |
| 应用ID | `appId` | 是 | TikTok 应用的 `client_key` |
| 应用密钥 | `appSecret` | 是 | 应用的 `client_secret` |
| 访问令牌 | `accessToken` | 是 | 授权后 access_token（有效期 24h，需刷新） |

**接口流程（Content Posting API）**：

```
1) POST /v2/post/publish/video/init/   body: { post_info:{title,privacy_level},
       source_info:{ source:"FILE_UPLOAD", video_size, chunk_size, total_chunk_count } }
       -> publish_id, upload_url
2) PUT <upload_url>   按分片顺序 PUT，携带 Content-Range 头
3) POST /v2/post/publish/status/fetch/  body:{ publish_id }   轮询直到 PUBLISH_COMPLETE
```

> 推荐分片 10MB；上传地址 1 小时有效；也支持 `PULL_FROM_URL` 直接拉取服务器上的视频。

### 3.4 快手 `kuaishou`（窄屏）

- **官方文档**：https://open.kuaishou.com/platformDocs/openAbility/contentManagement/createAVideo.html
- **接口根地址**：`https://open.kuaishou.com`
- **权限 scope**：`user_video_publish`

| 配置字段 | 实体列 | 必填 | 说明 |
| -------- | ------ | ---- | ---- |
| 应用ID | `appId` | 是 | 快手开放平台应用 ID |
| 应用密钥 | `appSecret` | 是 | 应用密钥 |
| 访问令牌 | `accessToken` | 是 | 用户授权后 access_token |

**接口流程**：

```
1) POST /openapi/photo/start_upload?access_token&app_id   -> upload_token, endpoint
2) 上传视频：POST http://{endpoint}/api/upload?upload_token=xxx   body: 视频二进制
   （大文件走 /api/upload/fragment 分片）
3) POST /openapi/photo/publish?access_token&app_id  body:{ upload_token, caption, cover }  -> 发布
```

> 发布为异步过程，约 1 分钟后生效。**注意**：发布接口的精确路径与入参随应用类型略有差异，对接时以快手官方文档为准。

### 3.5 Facebook `facebook`（宽屏 + 窄屏）

- **官方文档**：https://developers.facebook.com/docs/video-api/guides/publishing
- **接口根地址**：`https://graph.facebook.com`（OAuth/令牌/账号）；上传走 `https://graph-video.facebook.com`
- **权限 scope**：`pages_show_list` / `pages_read_engagement` / `pages_manage_posts`

| 配置字段 | 实体列 | 必填 | 说明 |
| -------- | ------ | ---- | ---- |
| 应用ID | `appId` | 是 | Meta App 的 `App ID` |
| 应用密钥 | `appSecret` | 是 | Meta App 的 `App Secret` |
| 访问令牌 | `accessToken` | 是 | 授权后 60 天长期用户令牌 |
| 页面 ID | `openId` / `extra.pageId` | 是 | 目标 Facebook Page 的 ID |
| 页面令牌 | `extra.pageAccessToken` | 是 | 发布用的 Page Access Token |

**接口流程（OAuth + 可断点续传上传）**：

```
1) OAuth 授权码换令牌：
   code -> GET /oauth/access_token               -> 短期 user token
   -> GET /oauth/access_token?grant_type=fb_exchange_token  -> 60 天长期 token
   -> GET /me/accounts?access_token=<长期token>  -> { pageId, pageAccessToken }
2) 上传视频（三段式）：
   POST https://graph-video.facebook.com/{pageId}/videos?upload_phase=start&access_token=...
        body: { file_size, file_name }            -> { video_id, upload_session_id }
   POST .../videos?upload_phase=transfer          body: 分片二进制（32MB/片，带 Content-Range）
   POST .../videos?upload_phase=finish            body: { title, description }  -> 完成
3) 状态轮询：
   GET /{video_id}?fields=status                   -> status.video_status: ready/error
```

### 3.6 Instagram `instagram`（窄屏）

- **官方文档**：https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing
- **接口根地址**：`https://graph.facebook.com`
- **权限 scope**：`instagram_business_basic` / `instagram_business_content_publish`
- **特殊要求**：视频必须提供**公网可访问的 `video_url`**（不支持直接上传二进制），因此需先配置对象存储。

| 配置字段 | 实体列 | 必填 | 说明 |
| -------- | ------ | ---- | ---- |
| 应用ID | `appId` | 是 | Meta App 的 `App ID` |
| 应用密钥 | `appSecret` | 是 | Meta App 的 `App Secret` |
| 访问令牌 | `accessToken` | 是 | 授权后 60 天长期用户令牌 |
| IG 账号 ID | `openId` / `extra.igUserId` | 是 | Instagram 专业账号 ID |
| 页面令牌 | `extra.pageAccessToken` | 是 | 用于反查 `instagram_business_account` |

**接口流程（容器式发布）**：

```
1) OAuth 授权码换令牌（同 Facebook），并反查 IG 账号：
   GET /{pageId}?fields=instagram_business_account&access_token=<pageAccessToken>
        -> { instagram_business_account: { id: igUserId } }
2) 创建媒体容器：
   POST /{igUserId}/media
        body: { media_type:"REELS", video_url:"<对象存储公网URL>", caption, access_token }
        -> { id: containerId }
3) 状态轮询：
   GET /{containerId}?fields=status_code,status
        status_code: FINISHED -> POST /{igUserId}/media_publish  -> success
                     PUBLISHED -> success
                     IN_PROGRESS -> processing（继续轮询）
                     ERROR/EXPIRED -> failed
```

> 限流：每账号 **25 条 / 24 小时**；`media_type=REELS` 目前仅 Business 账号支持。

### 3.7 对象存储（Instagram 发布依赖）

Instagram 需要 `video_url` 指向公网视频，系统通过 **S3 兼容对象存储**在发布前把视频上传并生成**预签名 GET URL**。

后端 `publish.service.ts` 对声明了 `requiresPublicUrl` 的适配器（目前仅 Instagram），会在调用 `adapter.publish()` 前执行 `storage.upload(localPath, 'videos/' + filename)`，把返回的 URL 作为 `input.publicUrl` 传给适配器。

相关实现：`backend/src/platform/storage/s3-storage.service.ts`（`S3StorageService`，`forcePathStyle: true` 兼容 OSS/COS/MinIO）。环境变量见 README「六、配置说明」的 `STORAGE_*`，未配置时上传会抛出明确错误提示。

---

## 四、OAuth 授权流程

### 4.1 授权前准备

1. 在「平台配置」页对应平台点「配置」，填好 `appId` 与 `appSecret`；
2. 将回调地址登记到各平台开放平台控制台（「授权回调域 / Redirect URI」）：

| 平台 | 回调地址 |
| ---- | -------- |
| 抖音 | `http://localhost:5001/platform/douyin_cn/oauth/callback` |
| 油管 | `http://localhost:5001/platform/youtube/oauth/callback` |
| TikTok | `http://localhost:5001/platform/tiktok/oauth/callback` |
| 快手 | `http://localhost:5001/platform/kuaishou/oauth/callback` |
| Facebook | `http://localhost:5001/platform/facebook/oauth/callback` |
| Instagram | `http://localhost:5001/platform/instagram/oauth/callback` |

> 回调地址的域名由 `backend/.env` 的 `BACKEND_BASE_URL` 决定；生产环境需换成已备案域名并支持 HTTPS。

### 4.2 授权流程（授权码模式，TikTok 额外 PKCE）

```
前端点「授权」 → GET /platform/:code/oauth/url（后端生成 state，TikTok 额外生成 PKCE verifier）
        → 浏览器跳转平台授权页 → 用户授权
        → 平台重定向到 /platform/:code/oauth/callback?code=xxx&state=yyy
        → 后端校验 state → 用 code 换 access_token/refresh_token/open_id
        → 令牌写入平台配置 → 浏览器跳回前端 #/platform-config?oauth=success
```

- **抖音 / 快手 / 油管 / Facebook / Instagram**：服务端使用 `client_secret` 换取令牌，无需 PKCE。
- **TikTok**：强制 PKCE，授权地址携带 `code_challenge`（S256），回调时携带 `code_verifier` 换取令牌。
- **Facebook / Instagram 额外换链**：拿到用户令牌后还需走 `fb_exchange_token`（换 60 天长期 token）→ `me/accounts`（拿 Page token），Instagram 再反查 `instagram_business_account`。

### 4.3 各平台授权接口

| 平台 | 授权页 | 换 token | 刷新 token | scope |
| ---- | ------ | -------- | ---------- | ----- |
| 抖音 | `/platform/oauth/connect/` | `/oauth/access_token/` | `/oauth/refresh_token/` | `video.create` |
| 油管 | `accounts.google.com/o/oauth2/v2/auth` | `oauth2.googleapis.com/token` | 同左 | `youtube.upload` |
| TikTok | `www.tiktok.com/v2/auth/authorize/` | `open.tiktokapis.com/v2/oauth/token/` | 同左 | `video.publish,video.list` |
| 快手 | `/oauth2/authorize` | `/oauth2/access_token` | `/oauth2/refresh_token` | `user_video_publish` |
| Facebook | `www.facebook.com/v21.0/dialog/oauth` | `graph.facebook.com/oauth/access_token` | —（无刷新，60 天重授权） | `pages_show_list,pages_read_engagement,pages_manage_posts` |
| Instagram | 同 Facebook（Meta 登录） | `graph.facebook.com/oauth/access_token` | —（无刷新，60 天重授权） | `instagram_business_basic,instagram_business_content_publish` |

> 授权成功后令牌自动回写：抖音写入 `accessToken + openId + refreshToken`；油管写入 `refreshToken`（发布时再用它换 access_token）；TikTok / 快手写入 `accessToken + refreshToken`；Facebook 写入 `accessToken + extra.pageId + extra.pageAccessToken`；Instagram 写入 `accessToken + extra.igUserId + extra.pageId + extra.pageAccessToken`（`extra` 结构见实体列定义）。

---

## 五、模拟模式（重要）

真实平台接口都需要开发者账号、应用审核与 OAuth 授权，本地开发时通常拿不到真实凭证。因此系统约定：

- **已配置凭证**（如抖音的 `accessToken`+`openId`、油管的 `refreshToken`）→ 调用**真实接口**；
- **未配置凭证** 或 **平台停用（`enabled=false`）** → 走**模拟发布**：标记 `mock=true`，返回一个 `mock_` 前缀的假 ID，便于端到端联调流程。

发布记录中的 `mock` 字段标识是否为模拟发布，前端详情页会显示「模拟」徽标。

### 发布状态与轮询

发布是异步的：视频提交后平台还要转码/审核。因此：

- 适配器 `publish()` 返回 `pending: true`（已提交、待平台处理）时，记录状态置为 `processing`；
- 后台 `PublishPollerService` 周期性（默认 15s）扫描 `processing` 记录，调用各平台 `queryStatus()` 查询最终状态并落库，再汇总任务整体状态；
- 超过 `POLL_MAX_ATTEMPTS` 次仍未完成，标记失败。

各平台的 `queryStatus()` 分别实现为：抖音查 `video/data`、油管查 `videos?part=processingDetails`、TikTok 查 `status/fetch`、快手查视频列表（尽力而为）、Facebook 查 `status.video_status`、Instagram 查容器 `status_code`（`FINISHED` 后再 `media_publish`）。相关轮询配置见 `backend/.env` 的 `POLL_INTERVAL_MS` / `POLL_MAX_ATTEMPTS`。

---

## 六、如何新增一个平台

1. 在 `backend/src/platform/adapters/platform.interface.ts` 中：
   - 给 `PlatformCode` 增加枚举值；
   - 在 `PLATFORMS` 数组登记该平台的元信息（编码、名称、支持尺寸、接口地址、所需字段）。
2. 新建 `xxx.adapter.ts`，实现 `IPlatformAdapter` 接口的 `publish()` 方法（参照 `youtube.adapter.ts`）。
3. 在 `platform-adapter.factory.ts` 构造函数中注册该适配器。

前端「视频发布页 / 平台配置页」通过 `/platform/list` 动态读取平台，无需改动即可自动显示新平台。

---

## 七、关键源码位置

| 内容 | 路径 |
| ---- | ---- |
| 平台接口定义 / 元信息 | `backend/src/platform/adapters/platform.interface.ts` |
| 适配器（6 家） | `backend/src/platform/adapters/*.adapter.ts` |
| 适配器工厂 | `backend/src/platform/adapters/platform-adapter.factory.ts` |
| 对象存储（Instagram 依赖） | `backend/src/platform/storage/s3-storage.service.ts` |
| 平台配置实体 / CRUD | `backend/src/platform/` |
| 视频上传 | `backend/src/video-upload/` |
| 发布任务 / 记录 | `backend/src/publish/` |
| 发布状态轮询服务 | `backend/src/publish/publish-poller.service.ts` |
| 前端发布页 | `frontend/src/views/VideoPublishView.vue` |
| 前端配置页 | `frontend/src/views/PlatformConfigView.vue` |
