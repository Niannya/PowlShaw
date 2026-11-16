# Vercel + Turso + Blob 部署指南

本指南把重写后的单一 Next.js 应用部署到 Vercel。应用同时包含页面与 `/api/v1/*`（同仓 Hono），因此只需要**一个 Vercel 项目**。

## 0. 前置条件

- Node.js 24、pnpm 11.19（本地构建/迁移用）
- [Turso CLI](https://docs.turso.tech/cli/installation)（创建数据库、取连接串与令牌）
- 一个 Vercel 账号，以及仓库的导入权限
- 从旧站迁移时：旧 `poxiao.db`（30 张表）与 `apps/api/public/uploads/` 下的活动资料文件

## 1. 创建 Turso 数据库

```bash
turso auth login
turso db create powlshaw

# 记录连接串，并创建一个长期令牌
turso db show powlshaw --url
turso db tokens create powlshaw
```

初始化 20 张表（二选一）：

```bash
# A. 全新站点
turso db shell powlshaw < apps/web/scripts/schema.sql

# B. 从旧 SQLite 迁移（先清洗，再导入）
python apps/web/scripts/migrate_sqlite_to_turso.py \
  --db /path/to/poxiao.db \
  --out build/powlshaw_turso.sql
turso db shell powlshaw < build/powlshaw_turso.sql
```

迁移脚本只修改临时副本，并会：剥离正文 `<img>` / Markdown 图片、删除图片附件记录、删除 12 张废弃表、删除 3 个图片列、新增 `visual_theme`、重建 `content_revisions`、创建扩展表。迁移后请用下面命令核对：

```bash
turso db shell powlshaw "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
# 期望 20
```

> `event_documents.file_url` 里保存的旧 `/uploads/...` 相对地址不会自动迁移到 Blob。请把实际文件重新上传到 Vercel Blob，并通过后台“评议资料”重新入库，或写脚本批量更新 `file_url`。

## 2. 创建 Vercel Blob Store

在 Vercel 项目（或团队）的 **Storage → Blob** 创建一个 Store，复制 **Read/Write Token**（`BLOB_READ_WRITE_TOKEN`）。应用只通过浏览器直传与 `del()` 删除使用它，不在服务端接收文件体。

默认只接受 `*.public.blob.vercel-storage.com` 的 https 地址；若使用私有 Blob 或自定义域名，额外设置 `BLOB_HOST_SUFFIX`（如 `.private.blob.vercel-storage.com`）。

## 3. 导入 Vercel 项目

1. Vercel → **Add New → Project** → 选择 fork 后的仓库；
2. **Root Directory** 选择 `apps/web`（非常重要；仓库根目录只有 pnpm 配置与文档）；
3. Framework Preset 自动识别为 Next.js，Build Command / Output 保持默认；
4. 在 **Settings → General** 确认 Node.js Version 为 24.x。

## 4. 环境变量

在 Vercel → **Settings → Environment Variables** 配置（Production 与 Preview 都建议配置）：

| 变量                    | 必填     | 说明                                                      |
| ----------------------- | -------- | --------------------------------------------------------- |
| `TURSO_DATABASE_URL`    | 是       | `libsql://powlshaw-<org>.turso.io`                        |
| `TURSO_AUTH_TOKEN`      | 是       | Turso 数据库令牌                                          |
| `BLOB_READ_WRITE_TOKEN` | 是       | Vercel Blob 读写令牌                                      |
| `SESSION_SECRET`        | 是       | ≥32 字符随机串；用于双轨会话 HMAC                         |
| `NEXT_PUBLIC_SITE_URL`  | 是       | 生产地址，如 `https://powlshaw.example.com`               |
| `ADMIN_USERNAME`        | 首次必填 | 管理员用户名，默认 `admin`                                |
| `ADMIN_PASSWORD`        | 首次必填 | 首次初始化管理员密码（≥8 字符），登录后请立即修改         |
| `BLOB_HOST_SUFFIX`      | 否       | 默认 `.public.blob.vercel-storage.com`                    |
| `TRUST_PROXY_HEADERS`   | 否       | 仅自建反代时设为 `1`；Vercel 会自动信任 `x-forwarded-for` |
| `ALLOWED_DEV_ORIGINS`   | 否       | 本地额外开发主机名，逗号分隔                              |

`ADMIN_PASSWORD` 只用于数据库中没有管理员记录时的首次初始化。初始化完成后，密码哈希写入数据库，环境变量不再参与登录；建议之后从 Vercel 删除该变量。

## 5. 部署与初始化

1. 触发部署，等待 Build 完成；
2. 打开 `https://<域名>/admin/login`，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录；
3. 立即在 `/admin/security` 修改管理员密码（会递增 `session_version`，旧会话立即失效）；
4. 在后台创建设置、活动、文章与受邀账号。

## 6. 预览环境

- CSRF 允许 `NEXT_PUBLIC_SITE_URL`、`VERCEL_URL`、`VERCEL_BRANCH_URL` 以及与请求 Host 同源的 Origin；
- 若使用自定义预览域名，把它加入 `NEXT_PUBLIC_SITE_URL` 或用同源 Host 访问，写操作不会被误判 403；
- Preview 使用独立的 Turso 数据库/分支时，记得分别执行 `schema.sql`。

## 7. 部署后验收

```bash
curl -s https://<域名>/api/v1/health
# {"data":{"status":"ok","service":"powlshaw-api"}}
```

浏览器检查：

- 首页、文章、活动页均正常渲染；Network 面板中 `Img` 请求数为 **0**；
- 后台登录、文章发布、评论、活动扩展保存/启停、评议资料上传与删除；
- 活动页扩展插槽按顺序出现，未知模块不会白屏；
- 旧地图链接 `/events/<slug>/map` 301 到 `/events/<slug>`。

## 8. 常见问题

| 现象                                         | 原因 / 处理                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/site` 返回 503「数据库尚未配置」    | 缺少 `TURSO_DATABASE_URL`，或 Preview 环境未继承变量                                                                         |
| 写操作返回 403（空响应）                     | `hono/csrf` 拒绝了跨源请求；确认通过同源页面操作，或把预览域名加入允许列表                                                   |
| 上传资料提示「文件地址必须是 Vercel Blob」   | 未配置 Blob Store，或 `BLOB_HOST_SUFFIX` 与实际域名不符                                                                      |
| 后台登录提示「服务器尚未初始化后台账号」     | `admin_credentials` 为空且 `ADMIN_PASSWORD` 未配置/为占位符（`replace-with-a-strong-password`、`ci-only-password` 会被拒绝） |
| 活动资料下载 404                             | 该记录仍是旧 `/uploads/...` 地址，需要重新上传到 Blob                                                                        |
| 构建时报 `@libsql/client/web` 不支持 `file:` | 本地误用了文件数据库；改用 `turso dev` 或 Turso 云端地址                                                                     |
| `turso db shell` 导入后只有 19/21 张表       | 统计时把 `sqlite_sequence` 算进去了；业务表应为 20 张                                                                        |

## 9. 回滚

Vercel 支持 Instant Rollback 到上一个 Deployment；数据库迁移前请先 `turso db shell powlshaw .dump > backup.sql` 或在 Turso 控制台创建分支/快照。旧 `poxiao.db` 原文件始终保持只读备份，不要覆盖。
