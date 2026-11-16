# 前端剥离说明（apps/web）

> 实施日期：2026-11-16  
> 依据：外部评估报告《PowlShaw 前端剥离与后端重写方案》第 2 节方案 A + B、第 4.4 节目录结构、第 8 节前端改造清单（该报告不在本仓库内）。  
> 目标：把 Next.js 前端从“页面直接查数据库和读会话”改成“只通过 `/api/v1` 取数”的独立应用，并保留 SSR、路由、组件与 CSS。

## 1. 一句话结论

前端已经独立成 `apps/web`：它不再依赖 `better-sqlite3`、`@/lib/db`、`@/lib/auth`（服务端会话实现）或任何后端源码；所有取数都经过 `src/lib/api/server.ts`（RSC）或 `src/lib/api/client.ts`（浏览器）访问同源 `/api/v1`。后端保留为 `apps/api`，业务逻辑与 SQLite 实现未重写，只把路由前缀迁到 `/api/v1` 并补齐前端需要的只读端点。

## 2. 目录结构

```text
powlshaw/
  apps/
    web/                      # 前端（可独立部署）
      src/app/                # (site)、admin 页面
      src/components/         # 展示与交互组件
      src/lib/api/            # 唯一数据入口：server / client / types / errors
      src/lib/                # API 适配后的 queries、auth、comments、settings…
      public/assets/          # 站点静态素材
      tests/                  # 前端纯函数回归测试
    api/                      # 后端（Next Route Handlers + SQLite）
      src/app/api/v1/         # 全部接口，版本化
      src/app/uploads/        # 活动资料下载
      src/lib/                # 原有领域逻辑，未重写
      scripts/                # 导入、重置管理员、开发种子数据
      tests/                  # 后端回归测试
  docs/
    frontend-extraction.md    # 本文
    api/openapi.yaml          # /api/v1 契约
  infra/nginx.conf.example    # 同源反代示例
```

## 3. 数据流

### 3.1 服务端组件（RSC）

```text
page.tsx
  → src/lib/queries.ts / src/lib/api/public.ts
  → src/lib/api/server.ts（读取 next/headers 的 Cookie，只转发不解析）
  → http://API_INTERNAL_URL/api/v1/...
  → apps/api Route Handler
  → src/lib/db.ts (SQLite)
```

- `apiServer<T>()` 统一加 `accept`、转发 `cookie`、`cache: "no-store"`。
- 返回体按 `{ "data": ... }` 解包；404 在 article/event 适配层转成 `undefined`，页面据此 `notFound()`。
- 站点外壳的“设置 + 年份 + 当前用户 + 未读数”由 `getSiteData()` 与 `getMe()` 并行获取，并用 React `cache()` 在单次请求内去重。

### 3.2 浏览器交互

```text
Client Component
  → fetch("/api/v1/...", { credentials: "same-origin" })
  → Next rewrites（开发）或 Nginx（生产）同源转发
  → apps/api
```

- 现有表单仍使用 `fetchJson()`，只把地址从 `/api/...` 改为 `/api/v1/...`。
- 登录成功后由后端 `Set-Cookie`，经同源反代原样落到浏览器；前端不写会话 Cookie。
- 后台页面 `requireAdmin()` 改为调用 `GET /api/v1/admin/session`，401/未登录时 `redirect("/admin/login")`；真正的授权仍在 API 的 `isAdminRequest()`。

## 4. 前端改造清单（对照报告第 8 节）

| 项                                  | 状态                                              | 位置                                           |
| ----------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| 新增服务端 API client               | 已完成                                            | `apps/web/src/lib/api/server.ts`               |
| 新增浏览器 API client               | 已完成                                            | `apps/web/src/lib/api/client.ts`               |
| 统一 `ApiError`                     | 已完成                                            | `apps/web/src/lib/api/errors.ts`               |
| DTO 类型集中                        | 已完成                                            | `apps/web/src/lib/api/types.ts`                |
| 页面不再 import DB/queries 实现     | 已完成                                            | `queries.ts` 改为 HTTP 适配层                  |
| `SiteShell` 不再查库                | 已完成                                            | `components/SiteShell.tsx`                     |
| 文章页 metadata + 正文 + 评论走 API | 已完成                                            | `app/(site)/articles/[slug]/page.tsx`          |
| 活动页 / 地图页聚合取数             | 已完成                                            | `app/(site)/events/...`、`EventMapSpecialView` |
| 后台页面走 admin API                | 已完成                                            | `app/admin/*`                                  |
| 登录/登出 Cookie 由后端设置         | 已完成                                            | `/api/v1/account/*`、`/api/v1/admin/*`         |
| 上传/资料下载走后端                 | 已完成                                            | `/api/v1/admin/upload`、`/uploads/*` 反代      |
| 旧 `/api/*` 客户端调用清理          | 已完成                                            | 全部改为 `/api/v1/*`                           |
| 纯函数去重                          | 部分：前端复制了少量无 DB 依赖的纯函数，见第 8 节 | `apps/web/src/lib/*`                           |

## 5. API 契约摘要

- 前缀：`/api/v1`；管理端 `/api/v1/admin/...`。
- 成功：`{ "data": ... }`；错误：`{ "error": { "code", "message", "details"? } }`。
- 新只读端点全部包 `{ data }`；旧写接口（登录、评论写入、后台 CRUD）暂保留 `{ "error": "文案" }` 的历史格式，前端 `toApiError()` 同时兼容两种。
- 完整列表见 [`docs/api/openapi.yaml`](api/openapi.yaml)。

前端实际使用的主要端点：

| 页面 / 功能                     | 端点                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| 站点外壳（设置/年份/用户/未读） | `GET /site`、`GET /me`                                                               |
| 首页                            | `GET /articles?limit=15`、`GET /events`、`GET /site`                                 |
| 文章列表/搜索/年份              | `GET /articles?page=&perPage=&q=&year=`                                              |
| 文章详情（含上下篇、评论）      | `GET /articles/{slug}?commentPage=&commentSort=&commentId=`                          |
| 随机文章                        | `GET /articles/random`                                                               |
| 活动列表/详情/地图/快照         | `GET /events`、`GET /events/{slug}?snapshot=`                                        |
| 别名跳转                        | `GET /redirects?kind=&slug=`                                                         |
| 账号中心                        | `GET /me`、`GET /me/notifications`                                                   |
| 后台会话                        | `GET /admin/session`                                                                 |
| 后台概览                        | `GET /admin/overview`                                                                |
| 文章管理                        | `GET /admin/articles`、`GET /admin/articles/{id}`、`GET /admin/event-options`        |
| 活动管理                        | `GET /admin/events`、`GET /admin/events/{id}`                                        |
| 评论/账号/审计/设置             | `GET /admin/comments`、`GET /admin/users`、`GET /admin/audit`、`GET /admin/settings` |
| 写入类                          | `/admin/*`、`/comments*`、`/treat`、`/visit`、`/account/*`                           |

## 6. 运行方式

### 6.1 本地

```bash
pnpm install
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
# 编辑 apps/api/.env.local：ADMIN_PASSWORD、至少 32 字符的 SESSION_SECRET

pnpm dev:api   # http://localhost:3001
pnpm dev:web   # http://localhost:3000
```

或 `pnpm dev` 同时启动。浏览器访问 `http://localhost:3000`，`/api/v1` 与 `/uploads` 由 Next rewrite 转发到 3001。

### 6.2 生产构建

```bash
pnpm build
pnpm --filter @powlshaw/api start   # 3001
pnpm --filter @powlshaw/web start   # 3000
```

生产推荐由 Nginx 同源反代（见 `infra/nginx.conf.example`），并把 `apps/web` 构建时的 `API_PROXY_TARGET` 设为空字符串，避免 Next 再转发一层。

### 6.3 冒烟数据

```bash
# 先启动一次 API 让 SQLite 建表
DATABASE_PATH=data/seed.db pnpm --filter @powlshaw/api seed:dev
```

种子脚本只允许写名字含 `seed`/`dev` 的数据库，且拒绝在 `NODE_ENV=production` 下运行。

## 7. 验证结果

在 Windows / Node 24 / pnpm 11.19 下执行：

| 检查                                    | 结果                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm --filter @powlshaw/web typecheck` | 通过                                                                               |
| `pnpm --filter @powlshaw/api typecheck` | 通过                                                                               |
| `pnpm --filter @powlshaw/web lint`      | 通过                                                                               |
| `pnpm --filter @powlshaw/api lint`      | 通过                                                                               |
| `pnpm --filter @powlshaw/web test`      | 8/8 通过                                                                           |
| `pnpm --filter @powlshaw/api test`      | 25/25 通过                                                                         |
| `pnpm --filter @powlshaw/web build`     | 通过，25 个动态路由                                                                |
| `pnpm --filter @powlshaw/api build`     | 通过，45+ 路由                                                                     |
| 本地冒烟（seed 数据）                   | 首页/文章/搜索/活动/地图/后台页面均 200；`/random` 307、旧别名 308、未登录后台 307 |

冒烟覆盖：

- 公开页：`/`、`/articles`、`/articles/smoke-one`、`/search?q=`、`/events`、`/events/first-poxiao`、`/events/the-legends-of-countries`、`/events/.../map`、`/random`、`/account`、`/login`；
- 后台：概览、文章列表/编辑/新建、活动列表/编辑/新建、评论、账号、审计、设置、安全；
- 反代：`/api/v1/site`、`/uploads/events/documents/...`、登录 `Set-Cookie`、登录后后台页面；
- 写入：通过 3000 端口代理提交评论返回 201；`/visit`、`/treat` 正常。

## 8. 已知差异与后续工作

1. **后端仍是 Next Route Handlers + SQLite**。本次只做前端剥离与 API 边界，没有重写 NestJS/Postgres；`apps/api/src/lib` 仍是原实现。
2. **后台只读端点的 SQL 从页面搬到 `apps/api/src/lib/api-read.ts`**，逻辑等价但尚未加契约测试；后续可逐项补 OpenAPI 校验。
3. **上传仍写 `apps/api/public/uploads`**，通过同源 `/uploads` 暴露；对象存储/`media_assets` 是后续阶段（报告 8.5）。
4. **CSRF 仍是 SameSite Cookie 级别**；报告第 9 节的双提交 Token 尚未实现。
5. **错误格式不统一**：新读端点 `{ error: { code, message } }`，旧写端点 `{ error: string }`；前端已兼容，后续统一。
6. **少量纯函数在前端复制**：`content.ts`、`date-time.ts`、`date-filter.ts`、`safe-path.ts`、`event-groups.ts`、`event-order.ts`、`event-status.ts`、`comment-rules.ts`、`content-limits.ts`、`event-map-*-validation.ts`。它们没有 DB/网络依赖，复制是为了让 `apps/web` 真正自包含；下一步可抽到 `packages/contracts` 或 `packages/shared` 并让两端 re-export。
7. **样式与静态素材**：`public/assets` 在前端；`public/uploads` 在后端。生产反代需同时转发 `/api/v1` 与 `/uploads`。
8. **站点 SEO 增强**（`sitemap.ts`/`robots.ts`、canonical）未在本次范围内。

## 9. 回滚

- 本分支不改 `main` 的数据库文件；`apps/api/data/*.db` 被 `.gitignore` 排除。
- 回退到 `main` 即可恢复原单应用结构；数据库仍为同一份 SQLite 文件（迁移是向前兼容的 `CREATE TABLE IF NOT EXISTS`）。
- 若只回退前端部署，可让 Nginx 的 `/` 指回旧 Next 进程，`/api/v1` 保持指向新 API。
