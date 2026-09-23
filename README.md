# 破晓作品档案

“破晓”是一个独立实现的前后端文章展示网站。公开页面采用老式个人主页美学，后台提供文章、活动、受邀账号和评论管理。

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
- “列国纪”专属世界地图专题页；登录用户可维护自己的抽象节点、多边形区域与节点关系，节点可关联多篇已公开文章
- 图片上传（JPG、PNG、GIF、WebP，最大 5MB）
- 桌面端和移动端响应式布局

## 日常维护

不熟悉代码时，请先阅读 [`MAINTENANCE.md`](MAINTENANCE.md)。需要逐个了解源码文件时，
参阅 [`SRC_FILE_GUIDE.md`](SRC_FILE_GUIDE.md)。

全站基础配色在 `src/styles/base.css`；页面样式按用途放在 `src/styles/`，
`src/app/globals.css` 只负责按顺序引入，详细说明见 [`MAINTENANCE.md`](MAINTENANCE.md)。

## 项目结构

```text
src/
  app/
    (site)/           公开页面（路径中不含「site」）
    admin/            后台页面
    api/              后端接口
    globals.css       全站样式入口，按顺序加载 src/styles/
  components/
    account/          登录和账号组件
    admin/            后台表单、编辑器与草稿逻辑
    comments/         评论组件
    *.tsx             前台共用组件
  lib/
    db.ts             数据库连接入口
    db-schema.ts      建表、兼容旧数据库的增量迁移
    queries.ts        公开页面查询
    *.ts              登录、权限、内容处理等逻辑
  styles/             基础、前台内容、评论、后台和响应式样式
scripts/             可选的资料导入与整理脚本
tests/               可直接运行的轻量回归测试
public/uploads/      后台上传的附件
data/poxiao.db        本地 SQLite 数据库（不提交）
```

修改页面固定文字时直接编辑相应的 `page.tsx` 或组件；首页欢迎语和公告仍在后台编辑。
只改界面请从相应的 `src/styles/` 文件入手。不要手动修改 `data/poxiao.db`。

修改代码后可运行：

```powershell
pnpm check
pnpm build
```

重新整理本地活动资料中的评议文件时，先用
`python scripts/import_event_documents.py --dry-run --list` 核对清单，再运行
`pnpm db:import-event-documents`。脚本只复制评议及相关活动资料，不会改动原始目录，
运行前会备份数据库。

## 技术结构

- Next.js 16 App Router
- React 19 + TypeScript
- Next.js Route Handlers 后端 API
- SQLite 本地数据库（better-sqlite3）
- 原生 CSS 复古视觉

## 本地运行

```powershell
pnpm install
Copy-Item .env.example .env.local
# 编辑 .env.local，设置强密码和至少 32 字符的 SESSION_SECRET
pnpm dev
```

访问：

- 网站：`http://localhost:3000`
- 后台：`http://localhost:3000/admin`
- 评论账号登录：`http://localhost:3000/login`

`.env.local` 含初始化管理密码和会话密钥，已被 `.gitignore` 排除，不应提交或公开。数据库首次
初始化后，可以在后台“后台安全”页面修改管理员密码；新密码只保存加密哈希，无需再编辑
`.env.local`。

## 本地资料导入

本地维护环境可以从 `破晓相关/破晓相关/` 整理第一届至第九届“破晓”及同期写作活动。
原始资料、整理输出、运行数据库和上传附件均不属于公开源码仓库，已由 `.gitignore` 排除。
“其它稿件合集（上传文章请发在这里）”不是活动目录，导入脚本不会将其混入活动档案。

批量整理脚本和导入报告分别位于：

```text
scripts/import_remaining_activities.py
破晓相关/整理输出/其余活动-导入报告.md
```

脚本会保留原目录层级、提取文档正文和图片，不在文末添加下载链接；评议表、统计表和
活动管理资料不会作为作品导入。旧的原始文档公开副本已移至 `data/private-archive-files/`。
重复运行会更新这些导入文章，不会重复创建；旧版 `.doc`、`.rtf` 的转换
需要本机安装 Microsoft Word，PDF 文字提取需要先安装：

```powershell
python -m pip install -r scripts/requirements-activities.txt
pnpm db:import-activities
```

## 上线前

1. 修改 `.env.local` 中的管理密码和会话密钥。
2. 把 `data/` 和 `public/uploads/` 放在持久化磁盘，并纳入定时备份。
3. 使用反向代理启用 HTTPS。
4. 设置正式的 `NEXT_PUBLIC_SITE_URL`。
5. 执行 `pnpm build` 后以 `pnpm start` 运行。
6. 根据服务器所在地完成相应备案和合规工作。

## 数据说明

网站正文保存在 `data/poxiao.db`，后台上传的图片保存在 `public/uploads/`。这两个位置需要一起备份。

## GitHub 公开边界

公开仓库只包含程序代码、测试、维护文档和必要的静态素材。下列内容只保留在本地或部署环境：

- `.env.local` 及其他真实环境变量；
- `data/` 中的数据库、备份、导入报告和私密归档；
- `public/uploads/` 中的用户上传内容；
- `破晓相关/` 和 `破晓相关.zip` 等原始资料。

首次提交或推送前运行：

```powershell
pnpm release:check
pnpm check
pnpm build
```

`release:check` 按 Git 的实际忽略规则检查候选文件，发现数据库、私密资料、真实凭据或用户目录
绝对路径时会失败。
