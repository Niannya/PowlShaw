# 破晓作品档案

“破晓”是一个独立实现的文章展示网站。公开页面采用老式个人主页美学，后台提供文章、活动、受邀账号和评论管理。

> **当前分支（`feat/frontend-extraction`）**：前端已经剥离为独立的 Next.js 应用 `apps/web`，只通过 `/api/v1` 与后端 `apps/api` 通信，不再直接访问 SQLite 或读取服务端会话。设计与改造细节见 [`docs/frontend-extraction.md`](docs/frontend-extraction.md)，接口契约见 [`docs/api/openapi.yaml`](docs/api/openapi.yaml)。

## 已实现

- 首页最近更新和当前活动入口
- 可编辑的首页站内公告、页脚建站日期和首页来访计数
- 首页饼干与红茶小游戏、全站累计数量和登录用户个人统计
- 文章列表、正文、搜索、年份档案
- 活动按“破晓 / 其他”分组；历届破晓的作品按轮次→科幻/奇幻组排列，2019夏活独立归档；后台可直接创建分组并拖动文章完成所见即所得的归类和排序
- 支持归档第一届至第九届“破晓”及同期写作活动资料
- 导入作品展示网页正文与配图，不在文末提供原始文件下载；破晓作品按轮次、组别建立栏目
- 各活动的评议表、评议结果、成绩/晋级名单等资料可在后台上传、改名、排序和删除，并在对应活动页逐份下载；作品原稿仍不提供下载
- 登录后评论；账号只能由管理员创建，不开放公开注册
- 评论隐藏、恢复和删除管理
- 评论回复、@提及通知、编辑、置顶、分页和链接识别
- 用户首次登录改密、会话失效、管理员禁言、操作记录与内容快照
- 评论搜索筛选及 CSV/JSON 导出
- 私有管理后台
- 富文本文章及活动编辑
- DOCX 与 Markdown 文章导入、富文本/Markdown 双模式编辑、发布前预览、本机自动草稿和离开页面提醒
- 文章采用“活动网址 + 编号”的统一别名，并保留旧网址自动跳转
- 活动月份、活动手动排序，以及文章发布日期（精确到日）
- “列国纪”专属世界地图专题页；登录用户可维护自己的抽象节点、多边形区域与节点关系，节点可关联多篇已公开文章；管理员可手动保存只读世界快照
- 图片上传（JPG、PNG、GIF、WebP，最大 5MB）
- 桌面端和移动端响应式布局

## 项目结构

```text
apps/
  web/                      # 前端：Next.js SSR，只调用 /api/v1
    src/app/                # (site) 公开页、admin 后台页
    src/components/         # 展示与交互组件
    src/lib/api/            # 服务端/浏览器 API client、DTO、错误类型
    src/lib/                # 页面使用的数据适配与纯函数
    src/styles/             # 基础、内容、评论、后台与响应式样式
    public/assets/          # 站点静态素材
    tests/                  # 前端轻量回归测试
  api/                      # 后端：Next Route Handlers + SQLite
    src/app/api/v1/         # 全部接口（版本化）
    src/app/uploads/        # 活动资料下载
    src/lib/                # 查询、鉴权、校验、地图、文档等领域逻辑
    scripts/                # 资料导入、管理员重置、开发种子数据
    public/uploads/         # 后台上传的附件
    data/poxiao.db          # 本地 SQLite 数据库（不提交）
    tests/                  # 后端回归测试
docs/
  frontend-extraction.md    # 前端剥离说明与验证结果
  api/openapi.yaml          # /api/v1 契约
infra/
  nginx.conf.example        # 同源反代示例
```

前端数据流只有一个入口：`apps/web/src/lib/api/server.ts`（RSC，转发 Cookie）与 `apps/web/src/lib/api/client.ts`（浏览器，同源 `/api/v1`）。页面不再 import `@/lib/db`、`better-sqlite3` 或服务端会话实现。

## 开发与维护

全站基础配色在 `apps/web/src/styles/base.css`；页面样式按用途放在 `apps/web/src/styles/`，`apps/web/src/app/globals.css` 只负责按顺序引入。首页欢迎语、公告、文章、活动、评论账号与评论均通过后台维护，无需直接修改数据库。

```bash
pnpm install
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
# 编辑 apps/api/.env.local：ADMIN_PASSWORD、至少 32 字符的 SESSION_SECRET

pnpm dev          # 同时启动 3001（api）与 3000（web）
# 或
pnpm dev:api
pnpm dev:web
```

访问：

- 网站：`http://localhost:3000`
- 后台：`http://localhost:3000/admin`
- 评论账号登录：`http://localhost:3000/login`
- 接口：`http://localhost:3001/api/v1/health`

开发模式下浏览器请求 `/api/v1` 与 `/uploads` 由 `apps/web/next.config.ts` 的 rewrites 转发到 `http://127.0.0.1:3001`。

修改代码后可运行：

```bash
pnpm check       # 两个应用的 lint + typecheck + test
pnpm build       # 两个应用的 next build
```

只改界面请从 `apps/web/src/styles/` 或对应组件入手。不要手动修改 `apps/api/data/poxiao.db`。

重新整理本地活动资料中的评议文件时，先用
`python apps/api/scripts/import_event_documents.py --dry-run --list` 核对清单，再运行
`pnpm --filter @powlshaw/api db:import-event-documents`。脚本只复制评议及相关活动资料，不会改动原始目录，运行前会备份数据库。

## 技术结构

- Next.js 16 App Router
- React 19 + TypeScript
- 前端与后端拆分为两个独立 Next.js 应用（`apps/web` / `apps/api`）
- 后端使用 Next.js Route Handlers + SQLite（better-sqlite3）
- 原生 CSS 复古视觉

## 本地运行

`.env.local` 含初始化管理密码和会话密钥，已被 `.gitignore` 排除，不应提交或公开。数据库首次初始化后，可以在后台“后台安全”页面修改管理员密码；新密码只保存加密哈希，无需再编辑 `.env.local`。

使用不含管理员凭据的公开内容数据库时，先在 `apps/api/.env.local` 设置接收者自己的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，再执行：

```bash
pnpm --filter @powlshaw/api admin:reset
```

命令会先在数据库同级的 `backups/` 目录中创建备份，然后重置管理员凭据并使旧会话失效。密码不要作为命令行参数传入，也不要写入 URL。

需要演示数据时可以写入一个可丢弃的 seed 数据库：

```bash
# 先启动一次 API，让 SQLite 完成建表
DATABASE_PATH=data/seed.db pnpm --filter @powlshaw/api seed:dev
```

服务器更新、Nginx 配置和上线验证步骤见 [`SERVER_DEPLOYMENT.md`](SERVER_DEPLOYMENT.md)。

## 本地资料导入

本地维护环境可以从 `破晓相关/破晓相关/` 整理第一届至第九届“破晓”及同期写作活动。
原始资料、整理输出、运行数据库和上传附件均不属于公开源码仓库，已由 `.gitignore` 排除。
“其它稿件合集（上传文章请发在这里）”不是活动目录，导入脚本不会将其混入活动档案。

批量整理脚本和导入报告分别位于：

```text
apps/api/scripts/import_remaining_activities.py
破晓相关/整理输出/其余活动-导入报告.md
```

脚本会保留原目录层级、提取文档正文和图片，不在文末添加下载链接；评议表、统计表和
活动管理资料不会作为作品导入。旧的原始文档公开副本已移至 `apps/api/data/private-archive-files/`。
重复运行会更新这些导入文章，不会重复创建；旧版 `.doc`、`.rtf` 的转换
需要本机安装 Microsoft Word，PDF 文字提取需要先安装：

```bash
python -m pip install -r apps/api/scripts/requirements-activities.txt
pnpm --filter @powlshaw/api db:import-activities
```

## 上线前

1. 修改 `apps/api/.env.local` 中的管理密码和会话密钥。
2. 把 `apps/api/data/` 和 `apps/api/public/uploads/` 放在持久化磁盘，并纳入定时备份。
3. 使用反向代理启用 HTTPS，并同时转发 `/api/v1`、`/uploads` 与 `/`。
4. 设置正式的 `NEXT_PUBLIC_SITE_URL`（前端）与 `TRUST_PROXY_HEADERS=1`（后端，仅在可信代理后）。
5. 执行 `pnpm build` 后分别以 `pnpm --filter @powlshaw/api start`、`pnpm --filter @powlshaw/web start` 运行。
6. 根据服务器所在地完成相应备案和合规工作。

## 数据说明

网站正文保存在 `apps/api/data/poxiao.db`，后台上传的图片保存在 `apps/api/public/uploads/`。这两个位置需要一起备份。

## GitHub 公开边界

公开仓库只包含程序代码、测试、项目说明和必要的静态素材。下列内容只保留在本地或部署环境：

- `.env.local` 及其他真实环境变量；
- `apps/api/data/` 中的数据库、备份、导入报告和私密归档；
- `apps/api/public/uploads/` 中的用户上传内容；
- `破晓相关/` 和 `破晓相关.zip` 等原始资料。

首次提交或推送前运行：

```bash
pnpm release:check   # 需要 Python
pnpm check
pnpm build
```

`release:check` 按 Git 的实际忽略规则检查候选文件，发现数据库、私密资料、真实凭据或用户目录绝对路径时会失败。
