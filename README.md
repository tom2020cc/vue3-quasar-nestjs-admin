# Quasar + NestJS 后台管理系统

一个前后端分离的轻量后台管理系统示例，前端使用 **Vue 3 + Quasar**（桌面风格 UI），后端使用 **NestJS**，数据库使用 **SQLite**（零配置、无需额外安装数据库软件）。实现了登录鉴权、用户 / 菜单的增删改查、菜单树形展示以及图片上传等完整功能，前后端已互相联通，可直接运行。

---

## 一、项目描述

### 1. 功能特性

| 模块 | 功能说明 |
| ---- | -------- |
| 登录鉴权 | 账号密码登录、注册，JWT Token 认证，未登录自动跳转登录页，401 自动登出 |
| 用户管理 | 用户的增、删、改、查（列表 / 新增 / 编辑 / 删除，编辑时密码留空则不修改） |
| 菜单管理 | 菜单的增、删、改、查，支持「表格 / 树形」两种视图切换，树形按父子层级展示并可直接为某节点新增子菜单、编辑、删除 |
| 图片上传 | 单图上传、多图上传（最多 3 张），上传后返回访问地址并预览，菜单图标也可上传图片 |
| 视频多平台发布 | 上传视频后自动识别宽屏/窄屏，按尺寸匹配目标平台（宽屏→国产抖音/油管/Facebook；窄屏→抖音/TikTok/快手/Instagram），支持单个与批量发布，含任务列表与各平台发布记录 |
| 视频库 | 发布时自动入库（按内容哈希去重），集中查看封面、尺寸、时长，支持详情与删除；内置重复检测与一键清理冗余 |
| 平台视频管理 | 授权后一键拉取已授权油管频道 / TikTok 账号下已发布的视频列表 |

### 2. 技术栈

| 层级 | 技术 |
| ---- | ---- |
| 前端 | Vue 3（Composition API + TypeScript）、Quasar 2、Vite 5、Pinia、Vue Router、Axios |
| 后端 | NestJS 10、TypeORM、JWT（passport-jwt）、bcryptjs、Multer（文件上传）、Swagger |
| 数据库 | SQLite（better-sqlite3，依赖自带预编译二进制，无需安装数据库软件） |
| 包管理 | pnpm |

### 3. 系统地址一览

| 项目 | 地址 | 说明 |
| ---- | ---- | ---- |
| 前端页面 | <http://localhost:5173> | 浏览器访问入口 |
| 后端接口 | <http://localhost:5001> | REST API 根地址 |
| Swagger 文档 | <http://localhost:5001/api-docs> | 在线接口调试文档 |
| 上传图片 | <http://localhost:5001/uploads/xxx> | 上传后的图片访问地址 |

> 前端使用 hash 路由（`#/`），页面形如 `http://localhost:5173/#/users`，刷新页面不会 404。

---

## 二、目录结构

```
quasar_nestjs_admin/
├── README.md                  # 本文档
├── backend/                   # NestJS 后端（端口 5001）
│   ├── .env                   # 后端环境变量（端口等配置）
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── pnpm-workspace.yaml    # pnpm 构建脚本白名单
│   ├── nest-cli.json
│   ├── tsconfig.json / tsconfig.build.json
│   ├── database.sqlite        # SQLite 数据库（首次启动自动生成）
│   ├── uploads/               # 上传图片存放目录（首次启动自动创建）
│   └── src/
│       ├── main.ts            # 入口：端口、CORS、静态托管 /uploads、Swagger
│       ├── app.module.ts
│       ├── auth/              # 登录 / 注册 / JWT 鉴权
│       ├── user/              # 用户 CRUD（实体 + DTO）
│       ├── menu/              # 菜单 CRUD
│       ├── img-upload/        # 图片上传（单图 / 多图）
│       ├── platform/          # 平台配置 + 各平台上传适配器（抖音/油管/TikTok/快手）+ 油管/TikTok 视频拉取
│       ├── video-upload/      # 视频文件上传（分片上传 + 断点续传）
│       ├── video-library/     # 视频库（发布时自动入库，按哈希去重）
│       └── publish/           # 发布任务 / 平台发布记录 / 状态轮询
└── frontend/                  # Vue3 + Quasar 前端（端口 5173）
    ├── .env                   # 前端环境变量（后端接口地址）
    ├── package.json
    ├── pnpm-lock.yaml
    ├── pnpm-workspace.yaml
    ├── vite.config.ts         # Vite + Quasar 插件、路径别名 @、端口
    ├── index.html
    ├── tsconfig.json
    └── src/
        ├── main.ts            # 应用入口（Quasar / Pinia / Router）
        ├── App.vue
        ├── quasar-variables.sass
        ├── router/index.ts    # 路由定义 + 登录守卫
        ├── stores/myToken.ts  # Pinia token 存储
        ├── utils/request.ts   # axios 实例（token 注入、401 拦截）
        ├── api/               # 接口封装（users / menus / uploads / platform / publish / videoLibrary / youtube / tiktok）
        ├── layouts/MainLayout.vue        # 后台布局（侧边栏 + 顶部栏）
        ├── components/ImageUpload.vue    # 单图上传组件
        └── views/             # 登录 / 首页 / 用户管理 / 菜单管理 / 图片上传 / 视频发布 / 平台配置 / 接入教程 / 视频库 / 油管视频 / TikTok 视频 / 404
```

---

## 三、环境要求

| 依赖 | 版本要求 | 说明 |
| ---- | -------- | ---- |
| Node.js | 18 及以上（推荐 20 LTS） | 后端/前端运行环境 |
| pnpm | 10 及以上 | 包管理工具 |

**安装 pnpm**（如未安装）：

```bash
npm install -g pnpm
```

> 无需安装任何数据库软件，SQLite 数据库文件会随首次启动自动生成。

---

## 四、快速开始（操作方法）

### 第 1 步：安装依赖

分别进入 `backend` 和 `frontend` 目录安装依赖：

```bash
# 后端
cd backend
pnpm install

# 前端
cd ../frontend
pnpm install
```

> 项目已在各自的 `pnpm-workspace.yaml` 中配置好构建脚本白名单（`@nestjs/core`、`esbuild`、`vue-demi` 等），`pnpm install` 可直接完成，无需手动批准构建脚本。

### 第 2 步：启动后端

```bash
cd backend
pnpm start:dev          # 开发模式（热更新）
```

看到如下日志即表示后端启动成功：

```
http://localhost:5001/api-docs
```

### 第 3 步：启动前端

**另开一个终端窗口**，进入前端目录：

```bash
cd frontend
pnpm dev
```

看到如下日志即表示前端启动成功：

```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

### 第 4 步：访问系统并登录

1. 浏览器打开 <http://localhost:5173>，会自动进入登录页。
2. 使用默认账号登录：

| 邮箱         | 密码     |
| ------------ | -------- |
| admin@qq.com | admin123 |

3. 登录成功后进入后台首页，左侧菜单可切换到「用户管理 / 菜单管理 / 图片上传」等页面。

> 后端首次启动时会自动创建数据库表，并**自动生成默认管理员**（上表账号）。如需全新账号，可在登录页点击「注册」。

---

## 五、功能使用说明

### 1. 用户管理（`/users`）

- **新增**：点击右上角「新增用户」，填写邮箱、密码后保存。
- **编辑**：点击行内「编辑」，修改邮箱；密码留空则保持原密码不变。
- **删除**：点击「删除」，弹出确认框，确认后删除。

### 2. 菜单管理（`/menus`）

- 页面右上角可切换「树形 / 表格」两种视图。
- **新增顶级菜单**：点击「新增菜单」，上级菜单选「顶级菜单」。
- **新增子菜单**：在树形视图的某个节点上点击「子菜单」，会以该节点为上级新增。
- **编辑 / 删除**：在树形或表格视图中均可操作（删除有二次确认）。
- **菜单图标**：编辑菜单时可上传一张图片作为图标。

### 3. 图片上传（`/upload`）

- **单图上传**：点击「选择一张图片」，选图后自动上传，上传成功显示预览和返回地址。
- **多图上传**：点击「选择多张图片」，一次最多选择 3 张，上传成功后逐张预览。
- 上传的图片保存在 `backend/uploads/`，通过 `http://localhost:5001/uploads/<文件名>` 访问。

---

## 六、配置说明

### 后端 `backend/.env`

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `BACKEND_PORT` | `5001` | 后端监听端口（默认 5001，避免与其它项目占用 5000 冲突） |
| `BACKEND_BASE_URL` | `http://localhost:5001` | 后端对外的基地址（用于生成 OAuth 回调地址，需在各平台控制台登记） |
| `FRONTEND_URL` | `http://localhost:5173` | 前端地址（OAuth 授权完成后跳回前端） |
| `POLL_INTERVAL_MS` | `15000` | 发布状态轮询间隔（毫秒） |
| `POLL_MAX_ATTEMPTS` | `20` | 单条发布记录最多轮询次数（超时标记失败） |
| `DB_SYNCHRONIZE` | `true` | 是否自动同步数据库表结构（开发 `true`；生产务必 `false` 并改用 migration） |
| `JWT_SECRET` | 占位符 | JWT 签名密钥（生产环境务必替换为随机强密钥） |
| `JWT_EXPIRES_IN` | `6000s` | JWT 有效期 |
| `STORAGE_ENDPOINT` | 空 | 对象存储端点（S3/OSS/COS 兼容地址；Instagram 发布需要） |
| `STORAGE_REGION` | `us-east-1` | 对象存储区域 |
| `STORAGE_BUCKET` | 空 | 存储桶名称 |
| `STORAGE_ACCESS_KEY` | 空 | 对象存储 AccessKey |
| `STORAGE_SECRET_KEY` | 空 | 对象存储 SecretKey |
| `STORAGE_URL_EXPIRES` | `172800` | 预签名 URL 有效期（秒，默认 48h） |

### 前端 `frontend/.env`

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `VITE_API_BASE_URL` | `http://localhost:5001` | 前端请求的后端接口地址 |

> 修改 `.env` 后需**重启对应服务**才会生效。

---

## 七、主要接口

| 方法 | 路径 | 说明 | 是否需要登录 |
| ---- | ---- | ---- | ------------ |
| POST | `/auth/login` | 登录，返回 token | 否 |
| POST | `/auth/signup` | 注册 | 否 |
| GET | `/auth/profile` | 当前登录用户信息 | 是 |
| GET | `/user` | 用户列表 | 是 |
| POST | `/user` | 新增用户 | 是 |
| GET | `/user/:id` | 用户详情 | 是 |
| PATCH | `/user/:id` | 更新用户 | 是 |
| DELETE | `/user/:id` | 删除用户 | 是 |
| GET | `/menus` | 菜单列表 | 是 |
| POST | `/menus` | 新增菜单 | 是 |
| GET | `/menus/:id` | 菜单详情 | 是 |
| PATCH | `/menus/:id` | 更新菜单 | 是 |
| DELETE | `/menus/:id` | 删除菜单 | 是 |
| POST | `/img-upload/img` | 单图上传（字段 `file`） | 是 |
| POST | `/img-upload/imgs` | 多图上传（字段 `files`，最多 3 张） | 是 |
| GET | `/platform/list` | 平台定义列表（编码/支持尺寸/所需配置字段） | 是 |
| GET | `/platform` | 平台配置列表（元信息 + 凭证） | 是 |
| PATCH | `/platform/:id` | 更新平台凭证 / 启用状态 | 是 |
| POST | `/video-upload/video` | 上传视频（字段 `file`，最大 500MB） | 是 |
| POST | `/publish` | 创建发布任务（异步发布到所选平台） | 是 |
| POST | `/publish/batch` | 批量创建发布任务（逐条隔离失败，返回成功/失败统计） | 是 |
| GET | `/publish` | 发布任务列表 | 是 |
| GET | `/publish/:id` | 任务详情（含各平台发布记录） | 是 |
| POST | `/publish/:id/retry` | 重试失败/跳过的平台 | 是 |
| DELETE | `/publish/:id` | 删除发布任务 | 是 |
| GET | `/platform/:code/oauth/url` | 获取 OAuth 授权跳转地址 | 是 |
| GET | `/platform/:code/oauth/callback` | OAuth 授权回调（换 token 存库） | 否 |
| POST | `/platform/:code/oauth/refresh` | 刷新访问令牌 | 是 |
| GET | `/video-library` | 视频库列表 | 是 |
| GET | `/video-library/duplicates` | 视频库重复检测（按内容哈希分组） | 是 |
| GET | `/video-library/:id` | 视频库详情 | 是 |
| DELETE | `/video-library/:id` | 删除视频库记录 | 是 |
| GET | `/youtube/videos` | 拉取已授权油管频道视频 | 是 |
| GET | `/tiktok/videos` | 拉取已授权 TikTok 视频 | 是 |

> 除登录 / 注册外，其余接口需携带请求头 `Authorization: Bearer <token>`。前端 axios 已自动注入，无需手动处理。

---

## 八、生产构建与部署

```bash
# 后端：构建并运行
cd backend
pnpm build
pnpm start:prod

# 前端：构建静态产物（输出到 frontend/dist）
cd frontend
pnpm build
```

前端构建产物 `frontend/dist/` 可用任意静态服务器（如 Nginx）托管，并将 `/api` 或跨域请求指向后端 `http://localhost:5001`。

---

## 九、常见问题（FAQ）

**1. 启动后端提示端口被占用（EADDRINUSE）？**

说明 5001 端口已被占用。可修改 `backend/.env` 中的 `BACKEND_PORT` 为其它端口，并同步修改 `frontend/.env` 的 `VITE_API_BASE_URL`。

**2. `pnpm install` 报构建脚本相关错误？**

项目已在 `pnpm-workspace.yaml` 中配置 `allowBuilds` 白名单。若你的 pnpm 版本较老，可忽略相关提示；若仍报错，可尝试 `pnpm install --ignore-scripts`（本项目使用的 `better-sqlite3` 依赖自带预编译二进制，跳过其构建脚本不影响运行）。

**3. 想重置数据库？**

删除 `backend/database.sqlite` 文件后重启后端即可，会自动重建数据库并重新生成默认管理员。

**4. 上传的图片在哪里？**

保存在 `backend/uploads/` 目录，通过 `/uploads/<文件名>` 静态访问。上传接口返回的 `url` 即为该地址。

**5. 后端改了端口，前端连不上？**

确认 `frontend/.env` 的 `VITE_API_BASE_URL` 与后端实际端口一致，然后重启前端。

---

## 十、视频多平台发布

左侧菜单新增「视频发布」与「平台配置」两个页面：

1. **视频发布**：选择视频文件 → 自动识别宽屏/窄屏（可手动切换）→ 填写标题 → 勾选目标平台 → 发布。顶部可切换「单个 / 批量」两种模式：批量模式一次多选文件，自动逐文件识别尺寸并按尺寸过滤兼容平台后一次性提交。右侧任务列表可查看发布状态、各平台结果，支持重试与删除。
2. **平台配置**：维护各平台（国产抖音、油管、TikTok、快手、Facebook、Instagram）的接入凭证与启用状态；点「授权」可跳转到各平台授权页，走 OAuth 授权码流程自动回填令牌（无需手动粘贴 token）。其中 **Instagram 需先配置对象存储**（见下文「对象存储配置」），因为 IG 要求视频提供公网 URL。
3. **视频库**：发布成功的视频会自动入库（按内容哈希去重），集中查看封面、尺寸、时长等信息；点「重复检测」可查看按内容哈希分组的重复记录，并一键清理冗余（每组保留最新一条）。
4. **油管视频 / TikTok 视频**：授权后一键拉取对应账号频道下已发布的视频列表。

### 对象存储配置（Instagram 发布需要）

Instagram 通过 Content Publishing API 发布时，要求视频先有**公网可访问的 URL**，不能直接上传二进制。系统在发布前会把视频上传到 **S3 兼容对象存储**（AWS S3 / 阿里云 OSS / 腾讯云 COS / MinIO 均可）并生成预签名 GET URL。在 `backend/.env` 填入：

| 变量 | 说明 | 示例 |
| ---- | ---- | ---- |
| `STORAGE_ENDPOINT` | 存储端点（含协议） | `https://oss-cn-hangzhou.aliyuncs.com`（MinIO：`http://localhost:9000`） |
| `STORAGE_REGION` | 区域 | `oss-cn-hangzhou` 或 `us-east-1` |
| `STORAGE_BUCKET` | 桶名 | `my-video-bucket` |
| `STORAGE_ACCESS_KEY` | AccessKey | 云厂商控制台获取 |
| `STORAGE_SECRET_KEY` | SecretKey | 同上 |
| `STORAGE_URL_EXPIRES` | 预签名 URL 有效期（秒） | `172800` |

> 桶需**公网可读**（预签名 URL 让 IG 在有效期内抓取），填好后重启后端。Facebook / 油管 / TikTok / 抖音 / 快手直接上传二进制，**无需**对象存储。

### Facebook / Instagram 联调前置

两者共用 **Meta（Facebook）** 开放平台，需在 [Meta for Developers](https://developers.facebook.com) 创建 **Business 类型应用**并完成授权：

- **Facebook**：申请 `pages_show_list` / `pages_read_engagement` / `pages_manage_posts`，名下需有 Page（公共主页）且为管理员；发布走 Page Access Token。
- **Instagram**：申请 `instagram_business_basic` / `instagram_business_content_publish`，IG 需为**专业账号（Business）**并绑定 FB Page；发布需先配置上面的对象存储。
- Meta 令牌约 60 天过期且无刷新机制，过期后在本系统「平台配置」页重新点「授权」。

> 平台接入凭证、各平台官方接口流程、如何新增平台的完整说明见 **[PLATFORM_CONFIG.md](./PLATFORM_CONFIG.md)**；「注册账号 → 建应用 → 拿凭证 → 授权 → 发布」的分平台手把手教程见 **[PLATFORM_TUTORIAL.md](./PLATFORM_TUTORIAL.md)**。未配置真实凭证时，发布走「模拟模式」，仅演示流程。

---

## 十一、默认账号与安全提示

- 默认管理员：`admin@qq.com / admin123`，仅用于演示，**生产环境请务必修改密码**。
- 后端 JWT 密钥在 `backend/.env` 的 `JWT_SECRET` 中配置，生产环境请替换为自己的随机密钥。
