# 破晓项目协作说明

开始修改前请先阅读根目录的 `PROJECT_STATUS.md` 和 `MAINTENANCE.md`。前者记录当前实现、
产品约定和最近交接状态，后者记录站长日常维护方法。`data/poxiao.db` 是正在使用的内容库；
除非用户明确要求恢复或重新导入旧资料，不要运行重置或批量导入命令。不得在回复、日志或
文档中公开 `.env.local`、密码、会话密钥或用户隐私数据。完成代码修改后运行 `pnpm check`
和 `pnpm build`。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
