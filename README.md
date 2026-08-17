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
│       └── img-upload/        # 图片上传（单图 / 多图）
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
        ├── api/               # 接口封装（users / menus / uploads）
        ├── layouts/MainLayout.vue        # 后台布局（侧边栏 + 顶部栏）
        ├── components/ImageUpload.vue    # 单图上传组件
        └── views/             # 登录 / 首页 / 用户管理 / 菜单管理 / 图片上传 / 404
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

## 十、默认账号与安全提示

- 默认管理员：`admin@qq.com / admin123`，仅用于演示，**生产环境请务必修改密码**。
- 后端 JWT 密钥在 `backend/src/auth/constants.ts` 中，生产环境请替换为自己的随机密钥。
