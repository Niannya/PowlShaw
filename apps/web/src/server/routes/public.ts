import crypto from "node:crypto";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../middleware/session";
import { apiBadRequest, apiData, apiNotFound, apiUnauthorized } from "../lib/api-response";
import {
  articlePayload,
  articlesPayload,
  eventsPayload,
  mePayload,
  notificationsPayload,
  randomArticlePayload,
  redirectPayload,
  sitePayload,
} from "../lib/api-read";
import { consumeRateLimit, requestIsHttps } from "../lib/request-security";
import { getTreatTotals, type TreatKind, type TreatOutcome } from "../lib/treats";
import { get, run, transaction } from "../db/sql";

/**
 * 公开路由：站点信息、文章、活动列表、跳转查询、访问计数与点心小游戏。
 * 路径前缀由 `app.ts` 挂在 `/api/v1` 下。
 */
export const publicRoutes = new Hono<AppEnv>();

const VISIT_COOKIE = "poxiao_visit";
const VISIT_WINDOW_SECONDS = 60 * 60 * 12;

/** 每点击一千次摔碎一次；调整这个数字即可改变概率。 */
const BREAK_CHANCE_DENOMINATOR = 1000;

const counterFields = {
  cookie: { served: "cookie_eaten", broken: "cookie_broken" },
  tea: { served: "tea_drunk", broken: "tea_broken" },
} as const;

async function currentVisitCount() {
  const row = await get<{ value: string }>(
    "SELECT value FROM site_settings WHERE key='visit_count'",
  );
  return Math.max(0, Number.parseInt(row?.value || "0", 10) || 0);
}

publicRoutes.get("/health", () => apiData({ status: "ok", service: "powlshaw-api" }));

publicRoutes.get("/site", async () => apiData(await sitePayload()));

publicRoutes.get("/articles", async (c) => {
  const params = new URL(c.req.url).searchParams;
  return apiData(
    await articlesPayload({
      page: Number(params.get("page")) || undefined,
      perPage: Number(params.get("perPage")) || undefined,
      limit: Number(params.get("limit")) || undefined,
      q: params.get("q") ?? undefined,
      year: params.get("year") ?? undefined,
    }),
  );
});

// 必须排在 `/articles/:slug` 之前：`random` 是静态路径。
publicRoutes.get("/articles/random", async () => apiData(await randomArticlePayload()));

publicRoutes.get("/articles/:slug", async (c) => {
  const slug = c.req.param("slug");
  const params = new URL(c.req.url).searchParams;
  const payload = await articlePayload(slug, {
    commentPage: Number(params.get("commentPage")) || undefined,
    commentSort: params.get("commentSort") ?? undefined,
    commentId: Number(params.get("commentId")) || undefined,
  });
  if (!payload) return apiNotFound("文章不存在。");
  return apiData(payload);
});

publicRoutes.get("/events", async () => apiData(await eventsPayload()));

publicRoutes.get("/redirects", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const payload = await redirectPayload(
    params.get("kind") ?? "",
    (params.get("slug") ?? "").trim(),
  );
  if (!payload) return apiBadRequest("重定向查询参数不正确。");
  return apiData(payload);
});

publicRoutes.get("/me", async (c) => apiData(await mePayload(c.get("user"))));

publicRoutes.get("/me/notifications", async (c) => {
  const user = c.get("user");
  if (!user) return apiUnauthorized("请先登录账号。");
  return apiData(await notificationsPayload(user.id));
});

/** 访问计数：同一浏览器 12 小时内只记一次，配合固定窗口限流防刷。 */
publicRoutes.post("/visit", async (c) => {
  if (getCookie(c, VISIT_COOKIE)) return Response.json({ count: await currentVisitCount() });

  const limit = await consumeRateLimit("visit", c.req.raw, 20, VISIT_WINDOW_SECONDS);
  if (limit.allowed) {
    await run(
      `INSERT INTO site_settings(key,value) VALUES('visit_count','1')
       ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1`,
    );
  }
  setCookie(c, VISIT_COOKIE, "1", {
    httpOnly: true,
    sameSite: "strict",
    secure: requestIsHttps(c.req.raw),
    path: "/",
    maxAge: VISIT_WINDOW_SECONDS,
  });
  return Response.json({ count: await currentVisitCount() });
});

publicRoutes.get("/treat", async () => Response.json({ totals: await getTreatTotals() }));

publicRoutes.post("/treat", async (c) => {
  const limit = await consumeRateLimit("treat", c.req.raw, 120, 15 * 60);
  if (!limit.allowed) {
    return Response.json(
      { error: "点心拿得太快了，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }
  const body = (await c.req.json().catch(() => null)) as { kind?: unknown } | null;
  if (body?.kind !== "cookie" && body?.kind !== "tea") {
    return Response.json({ error: "点心种类不正确。" }, { status: 400 });
  }

  const kind: TreatKind = body.kind;
  const outcome: TreatOutcome =
    crypto.randomInt(BREAK_CHANCE_DENOMINATOR) === 0 ? "broken" : "served";
  const field = counterFields[kind][outcome];
  const user = c.get("user");

  await transaction(async () => {
    // 字段名来自上面的固定映射，不使用用户输入。
    await run(
      `UPDATE treat_stats
       SET ${field} = ${field} + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
    );
    if (user) {
      await run(
        `INSERT INTO user_treat_stats(user_id, ${field}) VALUES (?, 1)
         ON CONFLICT(user_id) DO UPDATE SET
           ${field} = ${field} + 1,
           updated_at = CURRENT_TIMESTAMP`,
        [user.id],
      );
    }
  });

  return Response.json({ kind, outcome, totals: await getTreatTotals() });
});
