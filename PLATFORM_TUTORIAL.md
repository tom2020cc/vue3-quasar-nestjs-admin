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
- [五、发布状态轮询是怎么工作的](#五发布状态轮询是怎么工作的)
- [六、常见问题排查](#六常见问题排查)

---

## 零、通用准备（先读）

接入任何一家平台，本质上都是同一套流程，只是各平台控制台的**名词和入口不同**：

```
① 注册开发者账号（部分需要企业资质/实名）
② 创建「应用」，拿到一对凭证（AppId + AppSecret，各家叫法不同）
③ 申请本次要用的「能力/权限/scope」
④ 填写「授权回调地址（Redirect URI）」
⑤ 回到本系统 →「平台配置」→ 填 AppId/AppSecret → 点「授权」→ 浏览器跳转平台登录授权
⑥ 授权成功后令牌自动回填 → 回「视频发布」页发视频
```

> 回调地址（本地开发）统一为：
> `http://localhost:5001/platform/<平台编码>/oauth/callback`
>
> 四个平台的编码分别是：`douyin_cn` / `youtube` / `tiktok` / `kuaishou`。

**名词对照表**（同一个东西，各家叫法不同）：

| 通用概念 | 抖音 | 油管 | TikTok | 快手 |
| -------- | ---- | ---- | ------ | ---- |
| 应用 ID | `client_key` | `client_id` | `client_key` | `app_id` |
| 应用密钥 | `client_secret` | `client_secret` | `client_secret` | `app_secret` |
| 用户令牌 | `access_token` | `access_token` | `access_token` | `access_token` |
| 刷新令牌 | `refresh_token` | `refresh_token` | `refresh_token` | `refresh_token` |
| 用户标识 | `open_id` | —（无需） | `open_id` | `open_id` |

---

## 一、国产抖音 `douyin_cn`

国产抖音支持**宽屏和窄屏**，用的是「抖音开放平台」的**代替用户发布内容到抖音**能力。

### 1. 注册与建应用

1. 打开 **抖音开放平台**：https://developer.open-douyin.com
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

1. 打开「平台配置」页，找到「国产抖音」，点「配置」。
2. 填写：
   - `appId` ← Client Key
   - `appSecret` ← Client Secret
3. 保存后点「授权」，浏览器跳转到抖音登录/授权页，用你的抖音账号扫码/登录并同意授权。
4. 授权完成后自动跳回，`accessToken` 和 `openId` 已自动回填。

### 5. 发布

回「视频发布」页，选宽屏或窄屏视频，勾选「国产抖音」发布即可。

**注意事项**：
- 抖音发布**必须有 `accessToken` + `openId` 两个字段**，缺一个会走模拟模式。
- `access_token` 有效期一般 15 天，到期可用 `refresh_token` 刷新（本系统已提供「刷新令牌」按钮）。
- 视频要求：时长 ≤ 15 分钟；建议单分片 20MB（>128MB 必须分片）。

---

## 二、油管 YouTube

油管只支持**宽屏（横屏）**，用的是 **YouTube Data API v3**，走 Google 的 OAuth2。

### 1. 创建 Google Cloud 项目

1. 打开 **Google Cloud 控制台**：https://console.cloud.google.com
2. 新建一个项目（或复用已有项目）。

### 2. 启用 YouTube Data API

1. 左侧「API 和服务 → 已启用的 API 和服务 → 启用 API 和服务」。
2. 搜索 **YouTube Data API v3**，点击**启用**。

### 3. 创建 OAuth2 凭据（重点）

1. 进入「API 和服务 → 凭据 → 创建凭据 → **OAuth 客户端 ID**」。
2. 应用类型选择 **「Web 应用」**（本系统是服务端应用）。
3. 在「**已获授权的重定向 URI**」中，**精确填写**（Google 校验完整路径）：
   `http://localhost:5001/platform/youtube/oauth/callback`
4. 创建完成后得到：
   - **客户端 ID**（对应 `appId`）
   - **客户端密钥**（对应 `appSecret`）

### 4. OAuth 同意屏幕

- 首次使用需配置「OAuth 同意屏幕」：选择用户类型（Internal 仅组织内 / External 任何人）。
- 添加你授权的 Google 账号为**测试用户**（未发布应用只有测试用户能授权）。

### 5. 在本系统授权

1. 打开「平台配置」页，找到「油管 YouTube」，点「配置」。
2. 填写 `appId`（客户端 ID）、`appSecret`（客户端密钥）。
3. 保存后点「授权」，用 Google 账号登录并同意 `youtube.upload` 权限。
4. 授权成功后，系统**只保存 `refreshToken`**（发布时再用它实时换 access_token）。

### 6. 发布

回「视频发布」页，选**宽屏**视频，勾选「油管 YouTube」发布。

**注意事项**：
- 油管必须拿到 **`refreshToken`**，因此授权地址里带了 `access_type=offline` + `prompt=consent`，这是保证能拿到刷新令牌的关键。
- 发布后油管会转码（SD/HD），我们系统会**轮询 `processingDetails.processingStatus`** 直到 `succeeded`。
- 未完成 OAuth 同意屏幕配置、或账号不是测试用户，会提示授权错误。

---

## 三、TikTok 海外版

TikTok 只支持**窄屏（竖屏）**，用的是 **TikTok Content Posting API**，并且 **强制使用 PKCE**（无需 `client_secret` 也能安全授权）。

### 1. 注册与建应用

1. 打开 **TikTok for Developers**：https://developers.tiktok.com
2. 登录（通常需要海外账号），进入 **My Apps**，创建应用。
3. 应用创建后，在应用详情页能看到 **Client Key** 与 **Client Secret**。

### 2. 添加产品 / 申请能力

- 在应用详情里找到 **「Content Posting API」** 产品，点击 **Add product / 添加**。
- 有些账号需要先完成企业验证或提交审核才能启用。

### 3. 配置回调地址（Redirect URI）

- 在应用的 **「Login Kit / Redirect URI」** 配置中，填写：
  `http://localhost:5001/platform/tiktok/oauth/callback`
- 若找不到独立入口，可在「添加产品 → Login Kit」里配置回调。

### 4. 在本系统授权

1. 打开「平台配置」页，找到「TikTok 海外版」，点「配置」。
2. 填写 `appId`（Client Key）、`appSecret`（Client Secret）。
3. 保存后点「授权」，跳转到 TikTok 授权页（需要科学上网访问），用 TikTok 账号授权 `video.publish`。
4. 授权完成后自动回填 `accessToken` + `refreshToken` + `openId`。

### 5. 发布

回「视频发布」页，选**窄屏**视频，勾选「TikTok 海外版」发布。

**注意事项**：
- TikTok 授权走 **PKCE（S256）**，系统会自动生成 `code_challenge`/`code_verifier`，你无需手动处理。
- `access_token` 有效期约 24 小时，发布时若过期需先点「刷新令牌」。
- 上传走分片（推荐 10MB/片），上传地址 1 小时有效；上传完成后系统**轮询 `status/fetch`** 直到 `PUBLISH_COMPLETE`。

---

## 四、快手 `kuaishou`

快手只支持**窄屏（竖屏）**，用的是「快手开放平台」的**发布视频**能力（scope: `user_video_publish`）。

### 1. 注册与建应用

1. 打开 **快手开放平台**：https://open.kuaishou.com
2. 注册/登录开发者账号（通常需企业资质）。
3. 创建应用，得到 **App ID** 与 **App Secret**。

### 2. 申请能力

- 在应用的「能力/权限」中申请 **「发布视频到快手」**（对应 scope `user_video_publish`）。
- 通过审核后才能正常授权与发布。

### 3. 配置回调地址

- 在应用的「安全设置 / 回调配置」中填写：
  `http://localhost:5001/platform/kuaishou/oauth/callback`

### 4. 在本系统授权

1. 打开「平台配置」页，找到「快手」，点「配置」。
2. 填写 `appId`（App ID）、`appSecret`（App Secret）。
3. 保存后点「授权」，用快手账号授权 `user_video_publish`。
4. 授权完成后自动回填 `accessToken` + `refreshToken` + `openId`。

### 5. 发布

回「视频发布」页，选**窄屏**视频，勾选「快手」发布。

**注意事项**：
- 快手发布是**异步**的，作品转码约 1 分钟后生效；系统会**尽力轮询视频列表**确认最终状态（接口字段随应用类型略有差异，失败时靠轮询超时兜底）。
- 快手开放平台的发布接口路径与入参**因应用类型不同有差异**，正式接入时务必对照官方文档核对。

---

## 五、发布状态轮询是怎么工作的

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

- **真实平台**：轮询调用各家 `queryStatus`（抖音查 `video/data`、油管查 `videos?part=processingDetails`、TikTok 查 `status/fetch`、快手查视频列表）。
- **模拟发布（未配凭证）**：本地模拟「处理中 → 完成」，第 2 次轮询即成功，便于你观察整个轮询过程。

---

## 六、常见问题排查

**1. 点「授权」后跳转报「redirect_uri 不匹配 / 未登记」？**
→ 各平台控制台填的回调地址必须与 `backend/.env` 的 `BACKEND_BASE_URL` 拼出的地址**完全一致**（油管/TikTok 校验完整路径，抖音/快手通常只校验域名）。

**2. 授权成功但发布仍走「模拟模式」？**
→ 检查该平台是否**缺关键凭证**：抖音要 `accessToken+openId`、油管要 `refreshToken`、TikTok/快手要 `accessToken`。缺少即触发模拟发布。

**3. 油管授权后没有 `refreshToken`？**
→ 确认授权地址带 `access_type=offline`（本系统已带）。若之前授权过，Google 可能不再重复下发，需要到 Google 账号的「第三方应用权限」里移除授权后重新授权。

**4. 抖音 `access_token` 过期了？**
→ 用「平台配置」页的「刷新令牌」按钮，或重新「授权」。

**5. 记录一直停在「处理中」？**
→ 说明轮询仍在进行；若超过 `POLL_MAX_ATTEMPTS` 次仍未完成会标记失败。可看后端日志或记录 message 了解平台返回的状态。

**6. 本地回调域名能用 `localhost` 吗？**
→ 油管/TikTok 允许 localhost；抖音/快手也支持本地调试。生产环境需换成已备案域名 + HTTPS。
