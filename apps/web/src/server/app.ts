import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import { attachAuthContext, type AppEnv } from "./middleware/session";
import { isDatabaseNotConfiguredError } from "./db/client";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { commentRoutes } from "./routes/comments";
import { eventRoutes } from "./routes/events";
import { publicRoutes } from "./routes/public";
import { uploadRoutes } from "./routes/upload";

/**
 * Hono 核心实例：`/api/v1/*` 的全部后端契约。
 *
 * - 运行时应固定为 Node.js（`node:crypto.scrypt` 与 mammoth 依赖 Node 内置模块），
 *   入口在 `src/app/api/v1/[[...route]]/route.ts`；
 * - RSC 通过 `src/lib/api/server.ts` 的 `app.request()` 进程内直调，零网络 RTT；
 * - 浏览器同源请求 `/api/v1/*`。
 */
export const app = new Hono<AppEnv>().basePath("/api/v1");

/**
 * CSRF 允许的来源：
 * - 生产站点 `NEXT_PUBLIC_SITE_URL`；
 * - Vercel Preview / 分支域（`VERCEL_URL` / `VERCEL_BRANCH_URL`）；
 * - 本地开发 `http://localhost:3000`；
 * - 兜底：与当前请求 Host 同源（兼容自定义域名与预览别名）。
 */
function isAllowedOrigin(origin: string, c: Context) {
  const allowed = new Set<string>(
    [
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
      process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined,
      "http://localhost:3000",
    ].filter((value): value is string => Boolean(value)),
  );
  if (allowed.has(origin)) return true;

  const host = c.req.header("x-forwarded-host") || c.req.header("host");
  const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return Boolean(host && origin === `${proto}://${host}`);
}

app.use("*", logger());
app.use(
  "*",
  csrf({
    origin: isAllowedOrigin,
    // 浏览器表单提交与同源 fetch 都带 `same-origin`；`none` 用于直接访问/地址栏提交。
    secFetchSite: ["same-origin", "same-site", "none"],
  }),
);
app.use("*", attachAuthContext);

app
  .route("/", publicRoutes) // GET /site, /articles, /events, /redirects, /me, POST /visit, /treat
  .route("/account", authRoutes) // POST /login, /logout, /password, /notifications/read
  .route("/comments", commentRoutes) // POST /comments, PUT|PATCH|DELETE /comments/:id
  .route("/events", eventRoutes) // GET /events/:slug（含 extensions）, POST /events/:id/extensions/:kind/items
  .route("/upload", uploadRoutes) // POST /docx-parse, POST /event-document-token
  .route("/admin", adminRoutes); // 后台全部

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "接口不存在。" } }, 404));

app.onError((error, c) => {
  // CSRF 等中间件用 HTTPException 携带完整的 4xx 响应，必须原样返回。
  if (error instanceof HTTPException) return error.getResponse();
  console.error("[api/v1]", error);
  if (isDatabaseNotConfiguredError(error)) {
    // 本地首次拉起或 Vercel 漏配环境变量时，给出可读提示而不是笼统 500。
    return c.json({ error: error.message }, 503);
  }
  return c.json({ error: "服务器内部错误。" }, 500);
});

/**
 * 供 `hono/client` 等工具推导路由类型使用（当前前端走 `apiServer` / `apiClient`，
 * 仍保留导出以便后续按需启用 RPC 风格类型检查）。
 */
export type AppType = typeof app;
