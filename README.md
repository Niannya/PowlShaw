# 破晓作品档案

“破晓”是一个独立实现的文章与活动档案站：公开页面采用老式个人主页与纸本档案美学，后台提供文章、活动、受邀账号和评论管理。

当前版本（`0.3.0`）是 **Vercel 云原生重写版**：单一 Next.js 应用同仓挂载 Hono，数据库迁移到 Turso（libSQL）+ Drizzle，活动资料走 Vercel Blob 直传；全站不再引用任何光栅图片，题头由 `slug` 确定性生成 SVG。

- 原 `apps/api` 独立后端、`better-sqlite3` 本地数据库、Nginx 双进程反代均已移除。
- 30 张旧表裁剪为 **20 张**（18 张核心业务表 + 2 张活动扩展表）。
- 接口契约仍为 `/api/v1/*`；RSC 通过 `app.request()` 进程内直调 Hono，浏览器同源请求。

## 已实现

- 首页最近更新、当前活动入口、可编辑公告、来访计数
- 首页饼干与红茶小游戏（纯 CSS）、全站累计与登录用户个人统计
- 文章列表、正文、搜索、年份档案
- 活动按“破晓 / 其他”分组；作品按组别与轮次归档，后台可创建分组并排序
- **纯代码视觉**：`FNV-1a(slug)` 确定性生成 SVG 题头（星轨 / 碑刻 / 经纬 / 稿纸四种主题），零图片请求
- **活动扩展插槽**：`event_extensions` + `event_extension_items`，内置晋级名单、时间线、作品墙、读者投票四种模块；新增形态只需注册 `kind`，不改主表与主路由
- 活动评议资料：Vercel Blob 浏览器直传 + 客户端确认入库 + 删除联动清理；仅接受 8 种文档/表格格式
- 登录后评论；账号只能由管理员创建，不开放公开注册
- 评论回复、@提及通知、编辑、置顶、分页和链接识别
- 用户首次登录改密、会话失效、管理员禁言、操作记录与内容快照
- 评论搜索筛选及 CSV/JSON 导出
- 私有管理后台：文章、活动、评议资料、扩展模块、用户、站点设置
- DOCX 与 Markdown 文章导入（DOCX 内存解析，内嵌图片忽略）、富文本/Markdown 双模式编辑、发布前预览、本机自动草稿
- 文章采用“活动网址 + 编号”的统一别名，并保留旧网址自动跳转
- 桌面端与移动端响应式布局

## 技术栈

| 层     | 选型                                                                                 |
| ------ | ------------------------------------------------------------------------------------ |
| 前端   | Next.js 16 App Router + React 19（`apps/web`）                                       |
| 后端   | Hono 4，挂载于 `apps/web/src/app/api/v1/[[...route]]/route.ts`，`runtime = "nodejs"` |
| 数据库 | Turso / libSQL（`@libsql/client/web`）+ Drizzle ORM                                  |
| 校验   | Zod 4 + `@hono/zod-validator`                                                        |
| 文件   | Vercel Blob 客户端直传（`@vercel/blob/client`）                                      |
| DOCX   | `mammoth`（纯内存，无落盘）                                                          |
| 部署   | Vercel 单项目（Root Directory = `apps/web`）                                         |

## 项目结构

```text
apps/web/
  src/app/
    (site)/                 # 公开页面
    admin/                  # 管理后台页面
    api/v1/[[...route]]/    # Hono 挂载入口（Next Route Handler）
  src/server/
    app.ts                  # Hono 实例：CSRF / 会话 / 路由挂载
    db/                     # libSQL 客户端、异步 SQL 门面、Drizzle schema
    routes/                 # public / auth / comments / events / upload / admin
    lib/                    # 查询、鉴权、审计、扩展、上传等领域逻辑
    middleware/session.ts   # 双轨会话与权限门禁
  src/components/           # 展示、后台与纯代码视觉组件
  src/lib/                  # 前端取数、类型、扩展注册表、纯函数
  src/styles/               # 基础、内容、评论、后台与生成式题头样式
  scripts/
    schema.sql              # 20 张表的权威 DDL + 种子
    init_local_db.mjs       # 在空数据库执行 schema.sql
    migrate_sqlite_to_turso.py  # 旧 30 表 SQLite → 20 表 Turso 导入 SQL
  tests/                    # node:test 单元测试（不依赖真实数据库）
docs/
  api/openapi.yaml          # /api/v1 契约
  vercel-deployment.md      # Vercel + Turso + Blob 部署步骤
```

## 本地开发

前置：Node.js 24、pnpm 11.19、一个 libSQL 服务（Turso 云端或本地 `turso dev`）。

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# 编辑 apps/web/.env.local：SESSION_SECRET（≥32 字符）、ADMIN_PASSWORD、TURSO_DATABASE_URL

# 方案 A：本地 libSQL（需要 Turso CLI）
turso dev --db-file local.db          # 默认 http://127.0.0.1:8080
# apps/web/.env.local:
#   TURSO_DATABASE_URL=http://127.0.0.1:8080

# 初始化 20 张表与种子数据（可重复执行）
pnpm --filter @powlshaw/web db:init

# 方案 B：Turso 云端
#   turso db create powlshaw
#   turso db shell powlshaw < apps/web/scripts/schema.sql
#   TURSO_DATABASE_URL=libsql://...
#   TURSO_AUTH_TOKEN=...

pnpm dev
```

访问 `http://localhost:3000`，后台 `http://localhost:3000/admin`，账号登录 `http://localhost:3000/login`。

首次初始化管理员：数据库为空时，`ADMIN_USERNAME` / `ADMIN_PASSWORD` 会在第一次后台登录请求时写入 `admin_credentials`（只保存 scrypt 哈希）。之后请在 `/admin/security` 修改密码。

### 从旧版 SQLite 迁移

```bash
python apps/web/scripts/migrate_sqlite_to_turso.py \
  --db /path/to/poxiao.db \
  --out build/powlshaw_turso.sql

turso db create powlshaw
turso db shell powlshaw < build/powlshaw_turso.sql
```

脚本只操作临时副本，不会改动原库。它会：

1. 剥离 `articles` / `events` 正文中的 `<img>` 与 Markdown 图片；
2. 删除 `event_documents` 中的图片附件记录；
3. 删除 12 张废弃表（图片/分类 4 + 地图 6 + `pages`/`comments_archive`）；
4. 删除 `avatar_url` / `cover_url` / `banner_url`，新增 `visual_theme`；
5. 重建 `content_revisions` 以支持 `event_extension` 快照；
6. 创建两张扩展表并导出可直接导入 Turso 的 SQL。

> 旧 `event_documents.file_url` 里指向 `/uploads/...` 的相对地址不会自动上传到 Blob；部署前需要把实际文件重新上传，并更新 `file_url`（页面链接才能继续下载）。
>
> Vercel Functions 的请求体上限为 **4.5 MB**，因此超过约 4 MB 的 DOCX 无法经 `/upload/docx-parse` 直接上传（自托管部署不受此限制）。大文件请改用 Markdown 粘贴，或拆分为多个 DOCX 导入。

## 质量检查

```bash
pnpm check      # Prettier + ESLint + tsc + node:test
pnpm build      # Next.js 生产构建（无 Turso/Blob 凭据也可完成）
```

单元测试覆盖：会话 token 签发/篡改/过期、扩展配置与条目 Zod 校验、扩展可见性聚合、DOCX/Blob 校验、SQL 语句切分、文章草稿、视觉主题哈希等。真实数据库与 Blob 的端到端验证需要配置凭据后执行。

## 部署

见 [`docs/vercel-deployment.md`](docs/vercel-deployment.md)。核心步骤：

1. Vercel 导入仓库，**Root Directory 设为 `apps/web`**；
2. 创建 Turso 数据库并导入 `schema.sql` 或迁移后的 SQL；
3. 创建 Vercel Blob Store；
4. 配置环境变量 `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`、`BLOB_READ_WRITE_TOKEN`、`SESSION_SECRET`、`NEXT_PUBLIC_SITE_URL`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`；
5. 部署后首次访问后台完成管理员初始化，并更换初始密码。

## 已下线内容

- “列国纪”世界地图专题、6 张 `event_map_*` 表、地图编辑与快照接口/页面；
- 所有位图上传（`/admin/upload`）、正文内嵌图片、活动横幅/文章封面/作者头像字段；
- 独立 `apps/api` 应用与 Nginx 反向代理配置。

旧地图深链 `/events/:slug/map` 会 301 到活动详情页；`?snapshot=` 参数被忽略。
