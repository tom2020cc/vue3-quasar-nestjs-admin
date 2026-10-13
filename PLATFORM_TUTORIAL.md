# 视频多平台发布 · 各平台接入教程（手把手）

> 本教程面向「第一次接入某个平台」的情况，按 **注册 → 建应用 → 拿凭证 → 申请权限 → 配回调 → 授权 → 发布** 的顺序，逐步说明怎么做。
>
> 更偏「接口 / 字段 / 流程」的技术细节，请看 **[PLATFORM_CONFIG.md](./PLATFORM_CONFIG.md)**；本教程聚焦**操作步骤和为什么**。

---

## 目录

- [零、通用准备（先读）](#零通用准备先读)
- [一、国产抖音](#一国产抖音-douyin_cn)
- [二、油管 YouTube](#二油管-youtube)
- [三、TikTok 海外版](#三tiktok-海外版)
- [四、快手](#四快手-kuaishou)
- [五、Facebook](#五facebook)
- [六、Instagram（需对象存储）](#六instagram需对象存储)
- [七、发布状态轮询是怎么工作的](#七发布状态轮询是怎么工作的)
- [八、常见问题排查](#八常见问题排查)

---

## 零、通用准备（先读）

接入任何一家平台，本质上都是同一套流程，只是各平台控制台的**名词和入口不同**：

```
① 注册开发者账号（部分需要企业资质/实名）
② 创建「应用」，拿到一对凭证（AppId + AppSecret，各家叫法不同）
③ 申请本次要用的「能力/权限/scope」
④ 填写「授权回调地址（Redirect URI）」
⑤ 回到本系统 →[平台配置](http://localhost:5173/#/platform-config)→ 填 AppId/AppSecret → 点「授权」→ 浏览器跳转平台登录授权
⑥ 授权成功后令牌自动回填 → 回[视频发布](http://localhost:5173/#/publish)页发视频
```

> 回调地址（本地开发）统一为：
> `http://localhost:5001/platform/<平台编码>/oauth/callback`
>
> 六个平台的编码分别是：`douyin_cn` / `youtube` / `tiktok` / `kuaishou` / `facebook` / `instagram`。

**名词对照表**（同一个东西，各家叫法不同）：

| 通用概念 | 抖音 | 油管 | TikTok | 快手 | Facebook | Instagram |
| -------- | ---- | ---- | ------ | ---- | -------- | --------- |
| 应用 ID | `client_key` | `client_id` | `client_key` | `app_id` | `App ID` | `App ID` |
| 应用密钥 | `client_secret` | `client_secret` | `client_secret` | `app_secret` | `App Secret` | `App Secret` |
| 用户令牌 | `access_token` | `access_token` | `access_token` | `access_token` | `User Token`（60 天） | `User Token`（60 天） |
| 刷新令牌 | `refresh_token` | `refresh_token` | `refresh_token` | `refresh_token` | —（无，过期重新授权） | —（无，过期重新授权） |
| 用户/资源标识 | `open_id` | —（无需） | `open_id` | `open_id` | `pageId`（Page ID） | `igUserId`（专业账号 ID） |

> Facebook 与 Instagram 同属 Meta，共用一个 Meta 应用（App ID / App Secret），只是申请的能力与授权的资源不同：Facebook 发布到 **Page**，Instagram 发布到**绑定 Page 的 IG 专业账号**。

---

## 一、国产抖音 `douyin_cn`

国产抖音支持**宽屏和窄屏**，用的是「抖音开放平台」的**代替用户发布内容到抖音**能力。

### 1. 注册与建应用

1. 打开 **抖音开放平台**：[官方入口](https://developer.open-douyin.com)
2. 注册/登录（个人或企业开发者均可，部分能力要求企业资质）。
3. 进入「控制台 → 移动应用/网站应用」，点击**创建应用**，填写应用名称、图标、简介。
4. 应用创建后，在「应用详情 → 凭据」页能看到：
   - **Client Key**（对应我们系统的 `appId`）
   - **Client Secret**（对应 `appSecret`）

### 2. 申请权限（能力）

- 进入应用的「能力管理」，找到 **「代替用户发布内容到抖音」**，申请开通。
- 相关 scope：`video.create`（发布视频）、`video.data`（查询视频数据，用于轮询最终状态）。
- 部分能力需要提交审核，通过后才能在授权时拿到对应权限。

### 3. 配置回调地址

- 在应用「安全设置 / 回调配置」中，填写**授权回调域**：
  `http://localhost:5001/platform/douyin_cn/oauth/callback`
- 抖音的「授权回调域」通常只校验**域名**（`localhost:5001`）而不校验完整路径，登记域名即可。

### 4. 在本系统授权

1. 打开[平台配置](http://localhost:5173/#/platform-config)页，找到「国产抖音」，点「配置」。
2. 填写：
   - `appId` ← Client Key
   - `appSecret` ← Client Secret
3. 保存后点「授权」，浏览器跳转到抖音登录/授权页，用你的抖音账号扫码/登录并同意授权。
4. 授权完成后自动跳回，`accessToken` 和 `openId` 已自动回填。

### 5. 发布

回[视频发布](http://localhost:5173/#/publish)页，选宽屏或窄屏视频，勾选「国产抖音」发布即可。

**注意事项**：
- 抖音发布**必须有 `accessToken` + `openId` 两个字段**，缺一个会走模拟模式。
- `access_token` 有效期一般 15 天，到期可用 `refresh_token` 刷新（本系统已提供「刷新令牌」按钮）。
- 视频要求：时长 ≤ 15 分钟；建议单分片 20MB（>128MB 必须分片）。

---

## 二、油管 YouTube

本项目 YouTube 支持**横屏和竖屏**，单个和批量发布均可选。使用 **YouTube Data API v3** 和 Google OAuth2；是否归类为 Shorts 由 YouTube 判断，参见[官方 Shorts 说明](https://support.google.com/youtube/answer/15424877?hl=zh-Hans)。

2026-10-07 实操图文记录已加入 [网页教程](frontend/public/guides/youtube.html#walkthrough)，系统内「接入教程 → 油管 YouTube」可直接查看。截图素材位于 `frontend/public/guides/images/youtube-setup/`。

本次已确认授权成功、令牌保存，并读取到 TomPlay 频道视频；没有上传或发布新视频。此前 `fetch failed` 的排查证据是后端直连 Google 超时、通过本机代理可以连通。用户提供的成功配置为：系统代理关闭、虚拟网卡开启、规则模式。这是本机的有效配置，不是所有电脑都必须采用的设置。重点是让后端也能访问 Google，而不只是浏览器能访问。

若使用本机已有的 `127.0.0.1:7890` HTTP 代理，也可以在停止原后端后双击 `start-backend-proxy.bat`，单独为后端指定代理（Node.js 24+，前端仍需运行）。其他环境按实际代理地址配置；已正常连接时无需改动。后端重启后，旧授权回调中的 code / state 不可复用，需重新从系统发起授权。

### 1. 创建 Google Cloud 项目

直接打开：[当前项目](https://console.cloud.google.com/welcome?project=shanbo-search-console) · [新建项目](https://console.cloud.google.com/projectcreate)。

1. 打开 **Google Cloud 控制台**：[官方入口](https://console.cloud.google.com)
2. 新建一个项目（或复用已有项目）。

### 2. 启用 YouTube Data API

直接打开：[打开 YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com?project=shanbo-search-console)。

1. 左侧「API 和服务 → 已启用的 API 和服务 → 启用 API 和服务」。
2. 搜索 **YouTube Data API v3**，点击**启用**。

### 3. 创建 OAuth2 凭据（重点）

直接打开：[打开 OAuth 客户端 / 回调设置](https://console.cloud.google.com/auth/clients?project=shanbo-search-console) · [创建 OAuth 客户端](https://console.cloud.google.com/auth/clients/create?project=shanbo-search-console)。

1. 进入「API 和服务 → 凭据 → 创建凭据 → **OAuth 客户端 ID**」。
2. 应用类型选择 **「Web 应用」**（本系统是服务端应用）。
3. 在「**已获授权的重定向 URI**」中，**精确填写**（Google 校验完整路径）：
   `http://localhost:5001/platform/youtube/oauth/callback`
4. 创建完成后得到：
   - **客户端 ID**（对应 `appId`）
   - **客户端密钥**（对应 `appSecret`）

### 4. OAuth 同意屏幕

直接打开：[打开品牌 / 同意屏幕](https://console.cloud.google.com/auth/branding?project=shanbo-search-console) · [打开目标对象 / 测试用户](https://console.cloud.google.com/auth/audience?project=shanbo-search-console) · [打开数据访问 / 权限范围](https://console.cloud.google.com/auth/scopes?project=shanbo-search-console)。

- 首次使用需配置「OAuth 同意屏幕」：选择用户类型（Internal 仅组织内 / External 任何人）。
- 添加实际授权频道所用的 Google 账号为**测试用户**（测试模式仅允许测试用户授权）。Google Cloud 项目管理账号可以与频道账号不同。

### 5. 在本系统授权

直接打开：[本地平台配置](http://localhost:5173/#/platform-config)。

1. 打开[平台配置](http://localhost:5173/#/platform-config)页，找到「油管 YouTube」，点「配置」。
2. 填写 `appId`（客户端 ID）、`appSecret`（客户端密钥）。
3. 保存后点「授权」，用 Google 账号登录并同意 `youtube.upload` 权限。
4. 授权成功后，系统自动保存 `accessToken`、`refreshToken` 和过期时间；发布和读取频道时会使用刷新令牌换取访问令牌，无需手工填写两个 token。令牌失效或授权被撤销时需重新授权。

### 6. 发布

直接打开：[视频发布](http://localhost:5173/#/publish) · [油管视频列表](http://localhost:5173/#/youtube-videos)。

回[视频发布](http://localhost:5173/#/publish)页，选**宽屏**视频，勾选「油管 YouTube」发布。

**注意事项**：
- 油管必须拿到 **`refreshToken`**，因此授权地址里带了 `access_type=offline` + `prompt=consent`，这是保证能拿到刷新令牌的关键。
- 发布后油管会转码（SD/HD），我们系统会**轮询 `processingDetails.processingStatus`** 直到 `succeeded`。
- 未完成 OAuth 同意屏幕配置、或账号不是测试用户，会提示授权错误。

---

## 三、TikTok 海外版

TikTok 只支持**窄屏（竖屏）**，用的是 **TikTok Content Posting API**，并且 **强制使用 PKCE**（无需 `client_secret` 也能安全授权）。

### 1. 注册与建应用

1. 打开 **TikTok for Developers**：[官方入口](https://developers.tiktok.com)
2. 登录（通常需要海外账号），进入 **My Apps**，创建应用。
3. 应用创建后，在应用详情页能看到 **Client Key** 与 **Client Secret**。

### 2. 添加产品 / 申请能力

- 在应用详情里找到 **「Content Posting API」** 产品，点击 **Add product / 添加**（对应 `video.publish` 权限，用于发布）。
- 若要使用左侧「**TikTok 视频**」栏目拉取已发布视频，还需额外添加 **「Video List」** 产品并申请 `video.list` 权限；仅发布则不需要。
- 有些账号需要先完成企业验证或提交审核才能启用。

### 3. 配置回调地址（Redirect URI）

- 在应用的 **「Login Kit / Redirect URI」** 配置中，填写：
  `http://localhost:5001/platform/tiktok/oauth/callback`
- 若找不到独立入口，可在「添加产品 → Login Kit」里配置回调。

### 4. 在本系统授权

1. 打开[平台配置](http://localhost:5173/#/platform-config)页，找到「TikTok 海外版」，点「配置」。
2. 填写 `appId`（Client Key）、`appSecret`（Client Secret）。
3. 保存后点「授权」，跳转到 TikTok 授权页（需要科学上网访问），用 TikTok 账号授权 `video.publish`。
4. 授权完成后自动回填 `accessToken` + `refreshToken` + `openId`。

### 5. 发布

回[视频发布](http://localhost:5173/#/publish)页，选**窄屏**视频，勾选「TikTok 海外版」发布。

**注意事项**：
- TikTok 授权走 **PKCE（S256）**，系统会自动生成 `code_challenge`/`code_verifier`，你无需手动处理。
- `access_token` 有效期约 24 小时，发布时若过期需先点「刷新令牌」。
- 上传走分片（推荐 10MB/片），上传地址 1 小时有效；上传完成后系统**轮询 `status/fetch`** 直到 `PUBLISH_COMPLETE`。

---

## 四、快手 `kuaishou`

快手只支持**窄屏（竖屏）**，用的是「快手开放平台」的**发布视频**能力（scope: `user_video_publish`）。

### 1. 注册与建应用

1. 打开 **快手开放平台**：[官方入口](https://open.kuaishou.com)
2. 注册/登录开发者账号（通常需企业资质）。
3. 创建应用，得到 **App ID** 与 **App Secret**。

### 2. 申请能力

- 在应用的「能力/权限」中申请 **「发布视频到快手」**（对应 scope `user_video_publish`）。
- 通过审核后才能正常授权与发布。

### 3. 配置回调地址

- 在应用的「安全设置 / 回调配置」中填写：
  `http://localhost:5001/platform/kuaishou/oauth/callback`

### 4. 在本系统授权

1. 打开[平台配置](http://localhost:5173/#/platform-config)页，找到「快手」，点「配置」。
2. 填写 `appId`（App ID）、`appSecret`（App Secret）。
3. 保存后点「授权」，用快手账号授权 `user_video_publish`。
4. 授权完成后自动回填 `accessToken` + `refreshToken` + `openId`。

### 5. 发布

回[视频发布](http://localhost:5173/#/publish)页，选**窄屏**视频，勾选「快手」发布。

**注意事项**：
- 快手发布是**异步**的，作品转码约 1 分钟后生效；系统会**尽力轮询视频列表**确认最终状态（接口字段随应用类型略有差异，失败时靠轮询超时兜底）。
- 快手开放平台的发布接口路径与入参**因应用类型不同有差异**，正式接入时务必对照官方文档核对。

---

## 五、Facebook

Facebook 支持**宽屏和窄屏**，用的是 **Meta Graph API**，把视频发到你自己的 **Facebook Page（公共主页）**。

### 1. 注册 Meta 开发者 & 创建 App

1. 打开 **Meta for Developers**：[官方入口](https://developers.facebook.com) ，用你的 Facebook 账号登录。
2. 「我的应用 → 创建应用」，应用类型选 **Business（商务）**。
3. 创建后在「应用设置 → 基本信息」拿到：
   - **App ID**（对应系统 `appId`）
   - **App Secret**（对应 `appSecret`）

### 2. 添加 Facebook Login & 申请页面发布权限

1. 应用里点「添加产品」，选择 **Facebook Login**（勾选 Facebook Login for Business 的「配置」）。
2. 在「应用审核 → 权限和功能」中申请（Development Mode 下默认可直接用）：
   - `pages_show_list` —— 读取你的 Page 列表
   - `pages_read_engagement` —— 读取 Page 互动数据
   - `pages_manage_posts` —— 发布到 Page（**核心**）

### 3. 配置回调地址

在「Facebook Login → 设置」的 **有效 OAuth 跳转 URI** 中，精确填写：

```
http://localhost:5001/platform/facebook/oauth/callback
```

### 4. 准备 Facebook Page

- 账号名下要有一个 **Page（公共主页）**，没有就先建一个。
- 你必须是该 Page 的**管理员**，否则授权时看不到该 Page。

### 5. 在本系统授权

1. 打开[平台配置](http://localhost:5173/#/platform-config)页，找到「Facebook」，点「配置」，填 `appId`（App ID）、`appSecret`（App Secret），保存。
2. 点「授权」，跳转 Meta 授权页，选择你的 Page 并同意。
3. 授权成功后自动回填：系统用授权码换 **60 天长期 token**，再拉 `me/accounts` 拿到 **Page Token + pageId**，全部写入配置。

### 6. 发布

回[视频发布](http://localhost:5173/#/publish)页，选宽屏或窄屏视频，勾选「Facebook」发布。发布走**可断点续传上传**（start → 分片 transfer → finish），完成后轮询 `status.video_status` 直到 `ready`。

**注意事项**：
- 发布**必须用 Page Access Token**，用户 token 会报 `#100 No permission`——本系统已自动完成「用户 token → 页面 token」的转换，你无需手动处理。
- Meta 令牌约 **60 天过期且无刷新机制**，过期后在本页重新点「授权」即可。
- Development Mode 只有 App 成员能授权；要给他人用，需对方自建 App，或把他加为 App「测试用户」。

---

## 六、Instagram（需对象存储）

Instagram 只支持**窄屏（竖屏）**，用的是 **Content Publishing API**，且**必须配合对象存储**（IG 要求视频先有公网 URL，不能直接上传二进制）。

### 1. 注册 Meta 开发者 & 创建 App

同 Facebook，一个 Meta App 即可共用。拿到 **App ID / App Secret**。

### 2. 申请 Instagram 发布权限

在「应用审核 → 权限和功能」中申请（Development Mode 下默认可直接用）：

- `instagram_business_basic` —— 读取 IG 专业账号信息
- `instagram_business_content_publish` —— 发布内容（**核心**）

> 旧权限 `instagram_basic` / `instagram_content_publish` 已于 2025-01 废弃，务必用上面两个新权限。

### 3. 配置回调地址

在 OAuth 设置中加入：

```
http://localhost:5001/platform/instagram/oauth/callback
```

### 4. 准备账号资产（专业账号 + 绑定 Page）

1. 把 Instagram 账号切换为**专业账号**（IG 里：设置 → 账号类型和工具 → 切换为专业账号 → 选 Business）。
2. 把该 IG 账号**绑定**到你的一个 Facebook Page（在 Meta 专业账户中心里关联）。

> 普通个人号无法通过 API 发布；Reels 通过 API 发布目前仅支持 **Business** 账号（Creator 不支持）。

### 5. 配置对象存储（Instagram 专属，必做）

IG 发布时系统会先把视频上传到对象存储、生成公网 URL 再交给 IG 抓取。任选一个 **S3 兼容**存储（AWS S3 / 阿里云 OSS / 腾讯云 COS / MinIO 等），在 `backend/.env` 填入：

| 变量 | 说明 | 示例 |
| ---- | ---- | ---- |
| `STORAGE_ENDPOINT` | 存储端点（含协议） | `https://oss-cn-hangzhou.aliyuncs.com`（MinIO：`http://localhost:9000`） |
| `STORAGE_REGION` | 区域 | `oss-cn-hangzhou` 或 `us-east-1` |
| `STORAGE_BUCKET` | 桶名 | `my-video-bucket` |
| `STORAGE_ACCESS_KEY` | AccessKey | 从云厂商控制台获取 |
| `STORAGE_SECRET_KEY` | SecretKey | 同上 |
| `STORAGE_URL_EXPIRES` | 预签名 URL 有效期（秒） | `172800`（48h） |

> 桶需**公网可读**（预签名 URL 让 IG 在有效期内抓取）。本地开发可用 MinIO 自建；生产建议用云厂商 OSS/COS。填好后**重启后端**生效。

### 6. 在本系统授权

1. 打开[平台配置](http://localhost:5173/#/platform-config)页，找到「Instagram」，填 `appId` / `appSecret`，保存。
2. 点「授权」，跳转 Meta 授权页，选择你的 **IG 专业账号**和关联 Page，同意授权。
3. 授权成功后自动回填：系统通过 Page 反查 `instagram_business_account.id` 得到 **igUserId**，连同 60 天 token 一并写入配置。

### 7. 发布

回[视频发布](http://localhost:5173/#/publish)页，选**窄屏**视频，勾选「Instagram」发布。系统会先上传对象存储 → 创建 IG 容器 → 轮询 `status_code` → `FINISHED` 后 `media_publish`。

**注意事项**：
- **必须专业账号 + 绑定 Page + 对象存储公网 URL**，三者缺一不可。
- 限流：每账号 **25 条 / 24 小时**，批量发布请分批控制节奏。
- 视频抓取失败（`Error 36003`）通常是对象存储 URL 非公网或已过期，检查 `STORAGE_*` 与桶权限。

---

## 七、发布状态轮询是怎么工作的

视频发布到平台后，平台不是立即返回「成功」，而是要经历**转码 / 审核**等异步过程。因此系统把发布拆成两段：

```
提交发布（publish）  →  返回 pending: true → 记录状态变为 processing
                                        ↓
        后台定时任务（PublishPollerService，默认每 15 秒一轮）
          · 找出所有 processing 状态的记录
          · 记录 pollCount +1
          · 调用各平台 queryStatus() 查询最终状态
          · 写回 success / failed（或继续 processing）
          · 重新汇总任务整体状态（success / partial / failed / publishing）
                                        ↓
        超过最大轮询次数仍未完成 → 标记 failed（轮询超时）
```

相关配置在 `backend/.env`：

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `POLL_INTERVAL_MS` | `15000` | 每轮轮询间隔（毫秒） |
| `POLL_MAX_ATTEMPTS` | `20` | 单条记录最多轮询次数，超时标记失败 |

- **真实平台**：轮询调用各家 `queryStatus`（抖音查 `video/data`、油管查 `videos?part=processingDetails`、TikTok 查 `status/fetch`、快手查视频列表、Facebook 查 `status.video_status`、Instagram 查容器 `status_code` 后触发 `media_publish`）。
- **模拟发布（未配凭证）**：本地模拟「处理中 → 完成」，第 2 次轮询即成功，便于你观察整个轮询过程。

---

## 八、常见问题排查

**1. 点「授权」后跳转报「redirect_uri 不匹配 / 未登记」？**
→ 各平台控制台填的回调地址必须与 `backend/.env` 的 `BACKEND_BASE_URL` 拼出的地址**完全一致**（油管/TikTok 校验完整路径，抖音/快手通常只校验域名）。

**2. 授权成功但发布仍走「模拟模式」？**
→ YouTube 已改为多账号管理，必须添加或识别频道并在发布页选择，未选择不能提交。其他平台检查是否缺关键凭证：抖音要 `accessToken+openId`、TikTok/快手要 `accessToken`、Facebook 要 `accessToken + pageId`、Instagram 要 `accessToken + igUserId`。多账号步骤与截图见 [YouTube 多账号指南](YOUTUBE_MULTI_ACCOUNT.md)。

**3. 油管授权后没有 `refreshToken`？**
→ 确认授权地址带 `access_type=offline`（本系统已带）。若之前授权过，Google 可能不再重复下发，需要到 Google 账号的「第三方应用权限」里移除授权后重新授权。

**4. 抖音 `access_token` 过期了？**
→ 用[平台配置](http://localhost:5173/#/platform-config)页的「刷新令牌」按钮，或重新「授权」。

**5. 记录一直停在「处理中」？**
→ 说明轮询仍在进行；若超过 `POLL_MAX_ATTEMPTS` 次仍未完成会标记失败。可看后端日志或记录 message 了解平台返回的状态。

**6. 本地回调域名能用 `localhost` 吗？**
→ 油管/TikTok 允许 localhost；抖音/快手也支持本地调试。生产环境需换成已备案域名 + HTTPS。

**7. Facebook 发布报 `#100 No permission`？**
→ 说明用了用户 token 而非 Page token。确认授权时选了 Page，且[平台配置](http://localhost:5173/#/platform-config)里 `pageId` 已回填；仍异常可重新「授权」让系统重新拉取 Page token。

**8. Instagram 发布报 `Error 36003`（无法抓取视频）？**
→ 对象存储 URL 非公网或已过期。确认 `STORAGE_*` 配置正确、桶允许公网读取、预签名 URL 未过期；本地测试确保后端能访问到 MinIO/OSS 且 IG 能访问该公网地址。

**9. Instagram 授权后拿不到 IG 账号（`instagram_business_account` 为空）？**
→ 通常是 IG 账号未切换为专业账号、或未绑定 Facebook Page。按「六、Instagram 第 4 步」检查账号资产后重新授权。
