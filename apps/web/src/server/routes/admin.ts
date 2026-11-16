import { del } from "@vercel/blob";
import { Hono, type Context } from "hono";
import {
  requireAdmin,
  requireAdminApi,
  requireAdminSession,
  type AppEnv,
} from "../middleware/session";
import { apiData, apiError, apiNotFound, formRedirect, jsonError } from "../lib/api-response";
import { all, get, run, transaction } from "../db/sql";
import { auditAdmin, recordContentRevision } from "../lib/audit";
import {
  ids,
  nextArticleSlug,
  normalizeArticleDate,
  normalizeEventMonth,
  normalizeVisualTheme,
  uniqueSlug,
} from "../lib/admin";
import {
  adminArticlePayload,
  adminArticlesPayload,
  adminAuditPayload,
  adminCommentsPayload,
  adminEventOptionsPayload,
  adminEventPayload,
  adminEventsPayload,
  adminOverviewPayload,
  adminSessionPayload,
  adminSettingsPayload,
  adminUsersPayload,
} from "../lib/api-read";
import {
  adminCredentialsAreConfigured,
  credentialsAreValid,
  readAdminCredentials,
  updateAdminPassword,
} from "../lib/admin-credentials";
import {
  checkLoginLimit,
  clearLoginFailures,
  recordLoginFailure,
  requestIsHttps,
} from "../lib/request-security";
import {
  clearAdminSessionCookie,
  hashPassword,
  setAdminSessionCookie,
  validateAdminNote,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from "../lib/session-tokens";
import { cleanHtml, markdownToHtml, textExcerpt } from "@/lib/content";
import {
  MAX_HTML_SIZE,
  MAX_MARKDOWN_SIZE,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
} from "@/lib/content-limits";
import { localDayBoundaryUtc, normalizeLocalDateTime } from "@/lib/date-time";
import { normalizeDateFilter } from "@/lib/date-filter";
import { isEventGroup } from "@/lib/event-groups";
import { containsLike } from "../lib/db-search";
import { recordSlugRedirect } from "../lib/slug-redirects";
import { getEventById } from "../lib/queries";
import { parseDocxUpload } from "./upload";
import {
  EVENT_DOCUMENT_EXTENSIONS,
  MAX_EVENT_DOCUMENT_SIZE,
  blobPathnameFromUrl,
  eventDocumentExtension,
  eventDocumentSourceRelPath,
  fileExtension,
  isBlobFileUrl,
  normalizeEventDocumentContext,
  normalizeEventDocumentName,
} from "../lib/event-documents";
import {
  findExtensionRow,
  listAdminExtensions,
  patchExtension,
  saveExtension,
  softDeleteExtension,
  type ExtensionItemInput,
} from "../lib/extensions/store";
import { getExtensionDefinition } from "../../lib/extensions/definitions";
import type { ExtensionVisibility } from "../../lib/extensions/types";

/**
 * 后台路由（挂在 `/api/v1/admin`）。
 *
 * 响应契约沿用旧实现：读取端点 `{ data }`，写操作 `{ ok: true }` / `{ error: "中文提示" }`；
 * 新增的活动扩展端点使用 `{ data }` 与 `{ error: { code, message } }`。
 */
export const adminRoutes = new Hono<AppEnv>();

const ITEM_KEY_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/* ------------------------------------------------------------ 登录 / 会话 */

adminRoutes.post("/login", async (c) => {
  const isFormSubmission =
    c.req.header("content-type")?.includes("application/x-www-form-urlencoded") ?? false;
  const body = isFormSubmission
    ? (Object.fromEntries(await c.req.formData()) as Record<string, unknown>)
    : ((await c.req.json().catch(() => ({}))) as Record<string, unknown>);
  const username = String(body.username || "").slice(0, 64);

  if (!(await adminCredentialsAreConfigured())) {
    if (isFormSubmission) return formRedirect(c, "/admin/login?error=not-configured");
    return Response.json({ error: "服务器尚未初始化后台账号。" }, { status: 503 });
  }

  const limit = await checkLoginLimit(username, c.req.raw, "admin-login");
  if (!limit.allowed) {
    if (isFormSubmission) return formRedirect(c, "/admin/login?error=rate-limit");
    return Response.json(
      { error: "尝试次数过多，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!(await credentialsAreValid(username, String(body.password || "")))) {
    await recordLoginFailure(limit.key);
    if (isFormSubmission) return formRedirect(c, "/admin/login?error=credentials");
    return Response.json({ error: "用户名或密码不正确。" }, { status: 401 });
  }

  await clearLoginFailures(limit.key);
  const credentials = await readAdminCredentials();
  setAdminSessionCookie(c, credentials?.session_version ?? 1, requestIsHttps(c.req.raw));
  if (isFormSubmission) return formRedirect(c, "/admin");
  // 必须用 c.json 返回，否则 Set-Cookie 不会进入响应头。
  return c.json({ ok: true });
});

adminRoutes.post("/logout", (c) => {
  clearAdminSessionCookie(c);
  return c.json({ ok: true });
});

adminRoutes.get("/session", async (c) => apiData(await adminSessionPayload(c.get("admin"))));

adminRoutes.put("/password", requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("没有收到密码信息。");

  const currentPassword = String(body.current_password || "");
  if (!currentPassword || currentPassword.length > 200) {
    return jsonError("当前密码不正确。");
  }
  const newPassword = validatePassword(body.new_password);
  if (!newPassword.ok) return jsonError(newPassword.error);
  if (newPassword.value !== String(body.confirm_password || "")) {
    return jsonError("两次输入的新密码不一致。");
  }

  const updated = await updateAdminPassword(currentPassword, newPassword.value);
  if (!updated.ok) return jsonError(updated.error);

  await auditAdmin("change_password", "admin_credentials");
  setAdminSessionCookie(c, updated.sessionVersion, requestIsHttps(c.req.raw));
  return c.json({ ok: true });
});

/* --------------------------------------------------------------- 概览 */

adminRoutes.get("/overview", requireAdminSession, async () =>
  apiData(await adminOverviewPayload()),
);

/* ----------------------------------------------------------------- 文章 */

async function validEventIds(values: number[]) {
  if (!values.length) return true;
  const placeholders = values.map(() => "?").join(",");
  const row = await get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM events WHERE id IN (${placeholders})`,
    values,
  );
  return Number(row?.count ?? 0) === values.length;
}

adminRoutes.get("/articles", requireAdminSession, async (c) => {
  const params = new URL(c.req.url).searchParams;
  return apiData(
    await adminArticlesPayload({
      q: params.get("q") ?? undefined,
      eventId: Number(params.get("event")) || undefined,
      page: Number(params.get("page")) || undefined,
    }),
  );
});

adminRoutes.post("/articles", requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return jsonError("请填写文章标题。");
  }

  const title = body.title.trim().slice(0, MAX_TITLE_LENGTH);
  const markdown = String(body.content_markdown || "");
  const rawHtml = String(body.content_html || "");
  if (markdown.length > MAX_MARKDOWN_SIZE) return jsonError("Markdown 正文过长。");
  if (rawHtml.length > MAX_HTML_SIZE) return jsonError("富文本正文过长。");
  const content = markdown ? markdownToHtml(markdown) : cleanHtml(rawHtml);
  const publishedAt = normalizeArticleDate(body.published_at);
  if (!publishedAt.ok) return jsonError(publishedAt.error);
  const eventIds = [...new Set(ids(body.event_ids))];
  if (eventIds.length !== 1) return jsonError("每篇文章必须选择一个所属活动。");
  if (!(await validEventIds(eventIds))) return jsonError("选择的活动已经不存在，请刷新页面。");

  const slug = await nextArticleSlug(eventIds, title);
  const visualTheme = normalizeVisualTheme(body.visual_theme);
  // 未提交内容只存在浏览器本机；进入此接口即表示管理员正式保存并公开文章。
  const status = "published";

  const articleId = await transaction(async () => {
    const result = await run(
      `INSERT INTO articles (
         slug, title, excerpt, content_html, content_markdown, status,
         published_at, visual_theme, is_pinned, comments_mode
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug,
        title,
        textExcerpt(content, 180),
        content,
        markdown,
        status,
        publishedAt.value,
        visualTheme,
        body.is_pinned ? 1 : 0,
        ["open", "closed", "hidden"].includes(String(body.comments_mode))
          ? String(body.comments_mode)
          : "open",
      ],
    );
    const id = result.lastInsertRowid;
    for (const eventId of eventIds) {
      await run(
        `INSERT INTO event_articles(event_id,article_id,sort_order)
         SELECT ?, ?, COALESCE(MAX(sort_order), -1) + 1
         FROM event_articles WHERE event_id=?`,
        [eventId, id, eventId],
      );
    }
    const snapshot = await get("SELECT * FROM articles WHERE id=?", [id]);
    await recordContentRevision("article", id, "create", {
      article: snapshot,
      event_ids: eventIds,
    });
    await auditAdmin("create", "article", id, { title, slug });
    return id;
  });

  return Response.json({ ok: true, id: articleId, slug });
});

adminRoutes.post("/articles/preview", requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as { content_html?: unknown } | null;
  const content = String(body?.content_html || "");
  if (content.length > MAX_HTML_SIZE) return jsonError("正文过长，无法预览。");
  return Response.json({ ok: true, html: cleanHtml(content) });
});

/** 旧 DOCX 导入路径的别名：返回旧结构（`{ ok, title, content_html, ... }`）。 */
adminRoutes.post("/articles/import-docx", requireAdmin, async (c) => {
  const result = await parseDocxUpload(c);
  if (!result.ok) return jsonError(result.message);
  return Response.json({
    ok: true,
    title: result.title,
    content_html: result.contentHtml,
    image_count: 0,
    warnings: result.warnings,
  });
});

adminRoutes.get("/articles/:id", requireAdminSession, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id < 1) return apiNotFound("文章不存在。");
  const payload = await adminArticlePayload(id);
  if (!payload) return apiNotFound("文章不存在。");
  return apiData(payload);
});

adminRoutes.put("/articles/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id < 1) return jsonError("无效文章编号。");

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return jsonError("请填写文章标题。");
  }

  const previous = await get<Record<string, unknown>>("SELECT * FROM articles WHERE id=?", [id]);
  if (!previous) return jsonError("文章不存在。", 404);
  const previousEvents = await all<{ event_id: number }>(
    "SELECT * FROM event_articles WHERE article_id=? ORDER BY event_id",
    [id],
  );
  const title = body.title.trim().slice(0, MAX_TITLE_LENGTH);
  const markdown = String(body.content_markdown || "");
  const rawHtml = String(body.content_html || "");
  if (markdown.length > MAX_MARKDOWN_SIZE) return jsonError("Markdown 正文过长。");
  if (rawHtml.length > MAX_HTML_SIZE) return jsonError("富文本正文过长。");
  const content = markdown ? markdownToHtml(markdown) : cleanHtml(rawHtml);
  const publishedAt = normalizeArticleDate(body.published_at);
  if (!publishedAt.ok) return jsonError(publishedAt.error);

  const eventIds = [...new Set(ids(body.event_ids))];
  if (eventIds.length !== 1) return jsonError("每篇文章必须选择一个所属活动。");
  if (!(await validEventIds(eventIds))) {
    return jsonError("选择的活动已经不存在，请刷新页面。");
  }
  const previousEventIds = previousEvents.map((event) => Number(event.event_id));
  const stayedInSameEvent = previousEventIds.length === 1 && previousEventIds[0] === eventIds[0];
  const slug = stayedInSameEvent ? String(previous.slug) : await nextArticleSlug(eventIds, title);
  const visualTheme = normalizeVisualTheme(body.visual_theme);
  // 文章状态由保存动作决定，不接受浏览器提交的可编辑状态。
  const status = "published";

  await transaction(async () => {
    await recordContentRevision("article", id, "update", {
      article: previous,
      event_articles: previousEvents,
    });
    await run(
      `UPDATE articles
       SET slug = ?, title = ?, excerpt = ?, content_html = ?, content_markdown = ?,
           status = ?, published_at = ?, visual_theme = ?, is_pinned = ?,
           comments_mode = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        slug,
        title,
        textExcerpt(content, 180),
        content,
        markdown,
        status,
        publishedAt.value,
        visualTheme,
        body.is_pinned ? 1 : 0,
        ["open", "closed", "hidden"].includes(String(body.comments_mode))
          ? String(body.comments_mode)
          : "open",
        id,
      ],
    );
    // 只移除真正取消关联的活动，避免普通文章编辑把活动栏目路径和排序清空。
    if (eventIds.length) {
      const placeholders = eventIds.map(() => "?").join(",");
      await run(
        `DELETE FROM event_articles
         WHERE article_id=? AND event_id NOT IN (${placeholders})`,
        [id, ...eventIds],
      );
    } else {
      await run("DELETE FROM event_articles WHERE article_id=?", [id]);
    }
    for (const eventId of eventIds) {
      await run(
        `INSERT OR IGNORE INTO event_articles(event_id,article_id,sort_order)
         SELECT ?, ?, COALESCE(MAX(sort_order), -1) + 1
         FROM event_articles WHERE event_id=?`,
        [eventId, id, eventId],
      );
    }
    await recordSlugRedirect("article", String(previous.slug), slug);
    await auditAdmin("update", "article", id, { title, slug });
  });

  return Response.json({ ok: true, id, slug });
});

adminRoutes.delete("/articles/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id < 1) return jsonError("文章不存在。", 404);
  const article = await get<Record<string, unknown>>("SELECT * FROM articles WHERE id=?", [id]);
  if (!article) return jsonError("文章不存在。", 404);
  const eventArticles = await all("SELECT * FROM event_articles WHERE article_id=?", [id]);

  await transaction(async () => {
    await recordContentRevision("article", id, "delete", {
      article,
      event_articles: eventArticles,
    });
    await run("DELETE FROM articles WHERE id=?", [id]);
    await auditAdmin("delete", "article", id, {
      title: String(article.title || ""),
    });
  });

  return Response.json({ ok: true });
});

/* ----------------------------------------------------------------- 评论 */

adminRoutes.get("/comments", requireAdminSession, async (c) => {
  const params = new URL(c.req.url).searchParams;
  return apiData(
    await adminCommentsPayload({
      q: params.get("q") ?? undefined,
      status: params.get("status") ?? undefined,
      article: params.get("article") ?? undefined,
      user: params.get("user") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      page: Number(params.get("page")) || undefined,
    }),
  );
});

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

adminRoutes.get("/comments/export", requireAdmin, async (c) => {
  const search = new URL(c.req.url).searchParams;
  const format = search.get("format") === "json" ? "json" : "csv";
  const clauses: string[] = [];
  const values: unknown[] = [];
  const q = search.get("q");
  const article = search.get("article");
  const user = search.get("user");
  const status = search.get("status");
  if (q) {
    clauses.push("c.content LIKE ? ESCAPE '\\'");
    values.push(containsLike(q));
  }
  if (article) {
    clauses.push("(a.title LIKE ? ESCAPE '\\' OR a.slug LIKE ? ESCAPE '\\')");
    const value = containsLike(article);
    values.push(value, value);
  }
  if (user) {
    clauses.push("(u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')");
    const value = containsLike(user);
    values.push(value, value);
  }
  if (status === "visible" || status === "hidden") {
    clauses.push("c.status=?");
    values.push(status);
  } else if (status === "deleted") {
    clauses.push("c.deleted_at IS NOT NULL");
  }
  const from = normalizeDateFilter(search.get("from"));
  const to = normalizeDateFilter(search.get("to"));
  if (from) {
    clauses.push("c.created_at>=?");
    values.push(localDayBoundaryUtc(from));
  }
  if (to) {
    clauses.push("c.created_at<=?");
    values.push(localDayBoundaryUtc(to, true));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await all<Record<string, string | number | null>>(
    `SELECT c.id, c.content, c.status, c.is_pinned, c.edited_at, c.deleted_at,
            c.deleted_by, c.created_at, u.username, u.display_name,
            a.title AS article_title, a.slug AS article_slug
     FROM comments c
     JOIN users u ON u.id=c.user_id
     JOIN articles a ON a.id=c.article_id
     ${where}
     ORDER BY c.created_at DESC`,
    values,
  );
  await auditAdmin("export", "comments", undefined, { format, count: rows.length });
  if (format === "json") {
    return new Response(JSON.stringify(rows, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="comments.json"',
      },
    });
  }
  const columns = Object.keys(rows[0] || { id: "", content: "" });
  const csv = [columns.map(csvCell).join(",")]
    .concat(rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")))
    .join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="comments.csv"',
    },
  });
});

async function updateCommentAsAdmin(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!Number.isSafeInteger(id) || !body) return jsonError("评论不存在。", 404);

  let changes = 0;
  let action = "update";
  if (body.action === "restore") {
    const result = await run(
      `UPDATE comments
       SET deleted_at=NULL, deleted_by=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [id],
    );
    changes = result.changes;
    action = "restore";
  } else if (typeof body.is_pinned === "boolean") {
    const result = await run(
      "UPDATE comments SET is_pinned=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [body.is_pinned ? 1 : 0, id],
    );
    changes = result.changes;
    action = body.is_pinned ? "pin" : "unpin";
  } else {
    const status = String(body.status || "");
    if (!["visible", "hidden"].includes(status)) return jsonError("评论状态不正确。");
    const result = await run(
      "UPDATE comments SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [status, id],
    );
    changes = result.changes;
    action = status === "visible" ? "show" : "hide";
  }
  if (!changes) return jsonError("评论不存在。", 404);
  await auditAdmin(action, "comment", id);
  return Response.json({ ok: true });
}

adminRoutes.put("/comments/:id", requireAdmin, updateCommentAsAdmin);
adminRoutes.patch("/comments/:id", requireAdmin, updateCommentAsAdmin);

adminRoutes.delete("/comments/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id)) return jsonError("评论不存在。", 404);
  const permanent = new URL(c.req.url).searchParams.get("permanent") === "1";
  const result = permanent
    ? await run("DELETE FROM comments WHERE id=?", [id])
    : await run(
        `UPDATE comments
         SET deleted_at=CURRENT_TIMESTAMP, deleted_by='admin', updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND deleted_at IS NULL`,
        [id],
      );
  if (!result.changes) return jsonError("评论不存在。", 404);
  await auditAdmin(permanent ? "permanent-delete" : "soft-delete", "comment", id);
  return Response.json({ ok: true });
});

/* ----------------------------------------------------------------- 活动 */

adminRoutes.get("/events", requireAdminSession, async () => apiData(await adminEventsPayload()));

adminRoutes.post("/events", requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !String(body.title || "").trim()) return jsonError("请填写活动名称。");

  const title = String(body.title).trim();
  const eventGroup = body.event_group ?? "other";
  if (!isEventGroup(eventGroup)) return jsonError("请选择有效的活动类型。");
  const startsAt = normalizeEventMonth(body.starts_at);
  const endsAt = normalizeEventMonth(body.ends_at, true);
  if (!startsAt.ok) return jsonError(startsAt.error);
  if (!endsAt.ok) return jsonError(endsAt.error);
  if (startsAt.value && endsAt.value && startsAt.value > endsAt.value) {
    return jsonError("结束月份不能早于开始月份。");
  }
  const markdown = String(body.content_markdown || "");
  const rawHtml = String(body.content_html || "");
  if (markdown.length > MAX_MARKDOWN_SIZE) return jsonError("Markdown 正文过长。");
  if (rawHtml.length > MAX_HTML_SIZE) return jsonError("富文本正文过长。");
  const content = markdown ? markdownToHtml(markdown) : cleanHtml(rawHtml);
  const sortRow = await get<{ value: number }>(
    "SELECT COALESCE(MAX(sort_order), 0) + 10 AS value FROM events",
  );

  const safeTitle = title.slice(0, MAX_TITLE_LENGTH);
  const slug = await uniqueSlug("events", String(body.slug || safeTitle));
  const summary = String(body.summary || "").slice(0, MAX_SUMMARY_LENGTH);
  const visualTheme = normalizeVisualTheme(body.visual_theme);

  const eventId = await transaction(async () => {
    const result = await run(
      `INSERT INTO events (
         slug, title, event_group, summary, content_html, content_markdown, starts_at,
         ends_at, status_override, visual_theme, is_featured, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug,
        safeTitle,
        eventGroup,
        summary,
        content,
        markdown,
        startsAt.value,
        endsAt.value,
        ["upcoming", "active", "ended"].includes(String(body.status_override))
          ? String(body.status_override)
          : null,
        visualTheme,
        0,
        Number(sortRow?.value ?? 10),
      ],
    );
    const id = result.lastInsertRowid;
    await recordContentRevision(
      "event",
      id,
      "create",
      await get("SELECT * FROM events WHERE id=?", [id]),
    );
    await auditAdmin("create", "event", id, { title: safeTitle, slug });
    return id;
  });

  return Response.json({ ok: true, id: eventId });
});

adminRoutes.put("/events/order", requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as { ids?: unknown } | null;
  const orderedIds = [...new Set(ids(body?.ids))];
  const existingIds = (await all<{ id: number }>("SELECT id FROM events")).map((row) =>
    Number(row.id),
  );
  if (
    orderedIds.length !== existingIds.length ||
    existingIds.some((id) => !orderedIds.includes(id))
  ) {
    return jsonError("活动顺序数据不完整，请刷新页面后重试。");
  }

  await transaction(async () => {
    for (const [index, id] of orderedIds.entries()) {
      await run("UPDATE events SET sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", [
        index * 10,
        id,
      ]);
    }
  });
  await auditAdmin("reorder", "events", undefined, { ids: orderedIds });
  return Response.json({ ok: true });
});

adminRoutes.put("/events/featured", requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("没有收到首页活动设置。");

  const eventId = Number(body.eventId || 0);
  if (!Number.isSafeInteger(eventId) || eventId < 0) return jsonError("请选择有效活动。");

  if (eventId && !(await get("SELECT 1 AS one FROM events WHERE id=?", [eventId]))) {
    return jsonError("选中的活动不存在。", 404);
  }
  await run("UPDATE events SET is_featured=CASE WHEN id=? THEN 1 ELSE 0 END", [eventId]);
  await auditAdmin("update-homepage-showcase", "event", eventId || undefined);
  return Response.json({ ok: true });
});

adminRoutes.get("/event-options", requireAdminSession, async () =>
  apiData(await adminEventOptionsPayload()),
);

adminRoutes.get("/events/:id", requireAdminSession, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id < 1) return apiNotFound("活动不存在。");
  const payload = await adminEventPayload(id);
  if (!payload) return apiNotFound("活动不存在。");
  return apiData(payload);
});

adminRoutes.put("/events/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id < 1) return jsonError("活动不存在。", 404);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !String(body.title || "").trim()) return jsonError("请填写活动名称。");

  const title = String(body.title).trim();
  const existing = await get<{ event_group: string } & Record<string, unknown>>(
    "SELECT * FROM events WHERE id=?",
    [id],
  );
  if (!existing) return jsonError("活动不存在。", 404);
  const eventGroup = body.event_group ?? existing.event_group;
  if (!isEventGroup(eventGroup)) return jsonError("请选择有效的活动类型。");
  const startsAt = normalizeEventMonth(body.starts_at);
  const endsAt = normalizeEventMonth(body.ends_at, true);
  if (!startsAt.ok) return jsonError(startsAt.error);
  if (!endsAt.ok) return jsonError(endsAt.error);
  if (startsAt.value && endsAt.value && startsAt.value > endsAt.value) {
    return jsonError("结束月份不能早于开始月份。");
  }
  const markdown = String(body.content_markdown || "");
  const rawHtml = String(body.content_html || "");
  if (markdown.length > MAX_MARKDOWN_SIZE) return jsonError("Markdown 正文过长。");
  if (rawHtml.length > MAX_HTML_SIZE) return jsonError("富文本正文过长。");
  const content = markdown ? markdownToHtml(markdown) : cleanHtml(rawHtml);
  const safeTitle = title.slice(0, MAX_TITLE_LENGTH);
  const slug = await uniqueSlug("events", String(body.slug || safeTitle), id);
  const summary = String(body.summary || "").slice(0, MAX_SUMMARY_LENGTH);
  const visualTheme = normalizeVisualTheme(body.visual_theme);

  await transaction(async () => {
    await recordContentRevision("event", id, "update", existing);
    await run(
      `UPDATE events
       SET slug = ?, title = ?, event_group = ?, summary = ?, content_html = ?, content_markdown = ?,
           starts_at = ?, ends_at = ?, status_override = ?, visual_theme = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        slug,
        safeTitle,
        eventGroup,
        summary,
        content,
        markdown,
        startsAt.value,
        endsAt.value,
        ["upcoming", "active", "ended"].includes(String(body.status_override))
          ? String(body.status_override)
          : null,
        visualTheme,
        id,
      ],
    );
    await recordSlugRedirect("event", String(existing.slug), slug);
    await auditAdmin("update", "event", id, { title: safeTitle, slug });
  });

  return Response.json({ ok: true, id });
});

adminRoutes.delete("/events/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id < 1) return jsonError("活动不存在。", 404);
  const event = await get<Record<string, unknown>>("SELECT * FROM events WHERE id=?", [id]);
  if (!event) return jsonError("活动不存在。", 404);
  const eventArticles = await all("SELECT * FROM event_articles WHERE event_id=?", [id]);
  const eventSections = await all("SELECT * FROM event_sections WHERE event_id=?", [id]);
  const documents = await all("SELECT * FROM event_documents WHERE event_id=?", [id]);

  await transaction(async () => {
    await recordContentRevision("event", id, "delete", {
      event,
      event_articles: eventArticles,
      event_sections: eventSections,
      documents,
    });
    await run("DELETE FROM events WHERE id=?", [id]);
    await auditAdmin("delete", "event", id, {
      title: String(event.title || ""),
    });
  });

  return Response.json({ ok: true });
});

function normalizeSectionPath(value: unknown) {
  return String(value || "")
    .split(/\s*(?:\/|／|>|＞)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ")
    .slice(0, 160);
}

adminRoutes.put("/events/:id/articles", requireAdmin, async (c) => {
  const eventId = Number(c.req.param("id"));
  if (!Number.isSafeInteger(eventId)) return jsonError("活动不存在。", 404);
  const body = (await c.req.json().catch(() => null)) as {
    articles?: unknown[];
    article_ids?: unknown[];
    sections?: unknown[];
  } | null;
  const source = Array.isArray(body?.articles)
    ? body.articles
    : Array.isArray(body?.article_ids)
      ? body.article_ids.map((id) => ({ id }))
      : [];
  const seen = new Set<number>();
  const articles = source.flatMap((value) => {
    const item = typeof value === "object" && value !== null ? value : { id: value };
    const id = Number((item as { id?: unknown }).id);
    if (!Number.isSafeInteger(id) || seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        sectionPath: String(
          (item as { section_path?: unknown }).section_path ||
            [
              (item as { group_name?: unknown }).group_name,
              (item as { stage_name?: unknown }).stage_name,
            ]
              .filter(Boolean)
              .join(" / "),
        )
          .trim()
          .slice(0, 160),
      },
    ];
  });
  const suppliedSections = Array.isArray(body?.sections) ? body.sections : [];
  const sectionNames: string[] = [];
  const seenSectionNames = new Set<string>();
  for (const value of suppliedSections) {
    const rawName =
      typeof value === "object" && value !== null
        ? (value as { path_name?: unknown }).path_name
        : value;
    const pathName = normalizeSectionPath(rawName);
    if (!pathName) return jsonError("分组名称不能为空。");
    const compareName = pathName.toLocaleLowerCase("zh-CN");
    if (seenSectionNames.has(compareName)) return jsonError(`分组“${pathName}”重复了。`);
    seenSectionNames.add(compareName);
    sectionNames.push(pathName);
  }

  // 兼容旧客户端：没有单独提交分组时，按文章第一次出现的栏目路径建立分组。
  if (!Array.isArray(body?.sections)) {
    for (const article of articles) {
      const compareName = article.sectionPath.toLocaleLowerCase("zh-CN");
      if (!article.sectionPath || seenSectionNames.has(compareName)) continue;
      seenSectionNames.add(compareName);
      sectionNames.push(article.sectionPath);
    }
  }
  const knownSections = new Set(sectionNames.map((name) => name.toLocaleLowerCase("zh-CN")));
  if (
    articles.some(
      (article) =>
        article.sectionPath && !knownSections.has(article.sectionPath.toLocaleLowerCase("zh-CN")),
    )
  ) {
    return jsonError("有文章被放入了不存在的分组，请刷新页面后重试。");
  }

  if (!(await get("SELECT 1 AS one FROM events WHERE id=?", [eventId]))) {
    return jsonError("活动不存在。", 404);
  }
  if (articles.length) {
    const placeholders = articles.map(() => "?").join(",");
    const found = await get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM articles WHERE id IN (${placeholders})`,
      articles.map((article) => article.id),
    );
    if (Number(found?.count ?? 0) !== articles.length) {
      return jsonError("部分文章已经不存在，请刷新页面。", 409);
    }
  }

  const previous = {
    event_articles: await all(
      "SELECT * FROM event_articles WHERE event_id=? ORDER BY sort_order, article_id",
      [eventId],
    ),
    event_sections: await all(
      "SELECT * FROM event_sections WHERE event_id=? ORDER BY sort_order, id",
      [eventId],
    ),
  };

  await transaction(async () => {
    await recordContentRevision("event", eventId, "update-articles", previous);
    await run("DELETE FROM event_articles WHERE event_id=?", [eventId]);
    await run("DELETE FROM event_sections WHERE event_id=?", [eventId]);
    for (const [index, pathName] of sectionNames.entries()) {
      await run("INSERT INTO event_sections(event_id,path_name,sort_order) VALUES(?,?,?)", [
        eventId,
        pathName,
        index,
      ]);
    }
    for (const [index, article] of articles.entries()) {
      await run(
        "INSERT INTO event_articles(event_id,article_id,section_path,sort_order) VALUES(?,?,?,?)",
        [eventId, article.id, article.sectionPath, index],
      );
    }
    await auditAdmin("update-articles", "event", eventId, {
      count: articles.length,
      sections: sectionNames.length,
    });
  });

  return Response.json({ ok: true, count: articles.length, sectionCount: sectionNames.length });
});

/* ------------------------------------------------------------- 活动资料 */

adminRoutes.post("/events/:id/documents", requireAdmin, async (c) => {
  const eventId = Number(c.req.param("id"));
  if (!Number.isSafeInteger(eventId) || eventId < 1) return jsonError("活动不存在。", 404);
  const event = await getEventById(eventId);
  if (!event) return jsonError("活动不存在。", 404);

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("请求内容不正确。");

  const fileUrl = String(body.file_url || "").trim();
  if (!isBlobFileUrl(fileUrl)) {
    return jsonError("文件地址必须是 Vercel Blob 的 https 链接。");
  }
  const blobPathname = blobPathnameFromUrl(fileUrl);
  // 只能把“本活动目录下”的 Blob 挂到当前活动，避免借用其它活动（或任意路径）的文件。
  if (!blobPathname.startsWith(`events/${eventId}/`)) {
    return jsonError("文件地址不属于当前活动。");
  }
  const extension = eventDocumentExtension(blobPathname);
  if (!extension) {
    return jsonError(
      `只支持 ${[...EVENT_DOCUMENT_EXTENSIONS].map((item) => item.toUpperCase()).join("、")} 文件。`,
    );
  }
  const displayName = normalizeEventDocumentName(
    body.display_name || blobPathname.split("/").pop() || "",
    extension,
  );
  if (!displayName) return jsonError("显示名称不能为空，且扩展名必须与原文件一致。");
  const contextLabel = normalizeEventDocumentContext(body.context_label);

  const fileSize = Number(body.file_size);
  const normalizedSize = Number.isSafeInteger(fileSize) && fileSize >= 0 ? fileSize : 0;
  if (normalizedSize > MAX_EVENT_DOCUMENT_SIZE) {
    return jsonError("单个资料文件不能超过 20MB。");
  }

  const duplicate = await get<{ id: number }>(
    "SELECT id FROM event_documents WHERE event_id=? AND file_url=?",
    [eventId, fileUrl],
  );
  if (duplicate) return jsonError("这份文件已经上传到当前活动。", 409);

  const sourceRelPath = eventDocumentSourceRelPath(eventId, blobPathname);
  if (!sourceRelPath || sourceRelPath.length <= `blob/${eventId}/`.length) {
    return jsonError("文件地址不正确。");
  }

  const document = await transaction(async () => {
    const result = await run(
      `INSERT INTO event_documents (
         event_id, source_rel_path, display_name, context_label, file_url, file_size, sort_order
       )
       SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 10
       FROM event_documents WHERE event_id=?`,
      [eventId, sourceRelPath, displayName, contextLabel, fileUrl, normalizedSize, eventId],
    );
    const row = await get(
      `SELECT id, display_name, context_label, file_url, file_size, sort_order
       FROM event_documents WHERE id=?`,
      [result.lastInsertRowid],
    );
    await auditAdmin("create", "event-document", result.lastInsertRowid, {
      event_id: eventId,
      display_name: displayName,
    });
    return row;
  });

  return Response.json({ ok: true, document }, { status: 201 });
});

adminRoutes.put("/events/:id/documents/order", requireAdmin, async (c) => {
  const eventId = Number(c.req.param("id"));
  if (!Number.isSafeInteger(eventId) || eventId < 1) return jsonError("活动不存在。", 404);
  const body = (await c.req.json().catch(() => null)) as { document_ids?: unknown } | null;
  const documentIds = Array.isArray(body?.document_ids)
    ? body.document_ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
    : [];
  if (new Set(documentIds).size !== documentIds.length) return jsonError("资料顺序中有重复项目。");

  const existingIds = (
    await all<{ id: number }>("SELECT id FROM event_documents WHERE event_id=? ORDER BY id", [
      eventId,
    ])
  ).map((row) => Number(row.id));
  if (
    existingIds.length !== documentIds.length ||
    existingIds.some((id) => !documentIds.includes(id))
  ) {
    return jsonError("资料列表已经变化，请刷新页面后重试。", 409);
  }

  await transaction(async () => {
    for (const [index, documentId] of documentIds.entries()) {
      await run("UPDATE event_documents SET sort_order=? WHERE id=? AND event_id=?", [
        (index + 1) * 10,
        documentId,
        eventId,
      ]);
    }
    await auditAdmin("reorder", "event-document", eventId, { document_ids: documentIds });
  });
  return Response.json({ ok: true });
});

adminRoutes.put("/events/:id/documents/:documentId", requireAdmin, async (c) => {
  const eventId = Number(c.req.param("id"));
  const documentId = Number(c.req.param("documentId"));
  if (
    !Number.isSafeInteger(eventId) ||
    eventId < 1 ||
    !Number.isSafeInteger(documentId) ||
    documentId < 1
  ) {
    return jsonError("资料不存在。", 404);
  }
  const existing = await get<{ file_url: string; display_name: string }>(
    "SELECT * FROM event_documents WHERE id=? AND event_id=?",
    [documentId, eventId],
  );
  if (!existing) return jsonError("资料不存在。", 404);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("请求内容不正确。");

  const extension = fileExtension(existing.file_url);
  const displayName = normalizeEventDocumentName(body.display_name, extension);
  if (!displayName) return jsonError("显示名称不能为空，且扩展名必须与原文件一致。");
  const contextLabel = normalizeEventDocumentContext(body.context_label);

  await run(
    `UPDATE event_documents
     SET display_name=?, context_label=?
     WHERE id=? AND event_id=?`,
    [displayName, contextLabel, documentId, eventId],
  );
  await auditAdmin("update", "event-document", documentId, {
    event_id: eventId,
    display_name: displayName,
  });
  return Response.json({ ok: true, display_name: displayName, context_label: contextLabel });
});

adminRoutes.delete("/events/:id/documents/:documentId", requireAdmin, async (c) => {
  const eventId = Number(c.req.param("id"));
  const documentId = Number(c.req.param("documentId"));
  if (
    !Number.isSafeInteger(eventId) ||
    eventId < 1 ||
    !Number.isSafeInteger(documentId) ||
    documentId < 1
  ) {
    return jsonError("资料不存在。", 404);
  }
  const existing = await get<{ file_url: string; display_name: string }>(
    "SELECT * FROM event_documents WHERE id=? AND event_id=?",
    [documentId, eventId],
  );
  if (!existing) return jsonError("资料不存在。", 404);

  await run("DELETE FROM event_documents WHERE id=? AND event_id=?", [documentId, eventId]);
  await auditAdmin("delete", "event-document", documentId, {
    event_id: eventId,
    display_name: existing.display_name,
  });

  // 云端文件只有在该 URL 不再被任何资料引用时才删除；失败不影响接口结果。
  const stillReferenced = await get<{ one: number }>(
    "SELECT 1 AS one FROM event_documents WHERE file_url=?",
    [existing.file_url],
  );
  if (!stillReferenced && existing.file_url.startsWith("https://")) {
    await del(existing.file_url).catch(() => undefined);
  }
  return Response.json({ ok: true });
});

/* ----------------------------------------------------------------- 账号 */

adminRoutes.get("/users", requireAdminSession, async () => apiData(await adminUsersPayload()));

adminRoutes.post("/users", requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("请求格式不正确。");

  const username = validateUsername(body.username);
  const displayName = validateDisplayName(body.display_name);
  const adminNote = validateAdminNote(body.admin_note);
  const password = validatePassword(body.password);
  if (!username.ok) return jsonError(username.error);
  if (!displayName.ok) return jsonError(displayName.error);
  if (!adminNote.ok) return jsonError(adminNote.error);
  if (!password.ok) return jsonError(password.error);

  try {
    const result = await run(
      `INSERT INTO users(
         username, display_name, admin_note, password_hash, must_change_password
       ) VALUES (?, ?, ?, ?, 1)`,
      [username.value, displayName.value, adminNote.value, hashPassword(password.value)],
    );
    await auditAdmin("create", "user", result.lastInsertRowid, {
      username: username.value,
      display_name: displayName.value,
    });
    return Response.json({ ok: true, id: result.lastInsertRowid }, { status: 201 });
  } catch (error) {
    if (String(error).includes("UNIQUE")) return jsonError("这个用户名已经存在。", 409);
    throw error;
  }
});

async function updateUserAsAdmin(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id)) return jsonError("账号不存在。", 404);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("请求格式不正确。");

  const displayName = validateDisplayName(body.display_name);
  const adminNote = validateAdminNote(body.admin_note);
  const password = validatePassword(body.password, false);
  if (!displayName.ok) return jsonError(displayName.error);
  if (!adminNote.ok) return jsonError(adminNote.error);
  if (!password.ok) return jsonError(password.error);
  const active = body.is_active ? 1 : 0;
  const mutedUntilResult = normalizeLocalDateTime(body.muted_until);
  if (!mutedUntilResult.ok) return jsonError(mutedUntilResult.error);
  const mutedUntil = mutedUntilResult.value;
  const muteReason = String(body.mute_reason || "")
    .trim()
    .slice(0, 500);

  const previous = await get<{ is_active: number }>("SELECT is_active FROM users WHERE id=?", [id]);
  if (!previous) return jsonError("账号不存在。", 404);

  const result = password.value
    ? await run(
        `UPDATE users
         SET display_name=?, admin_note=?, password_hash=?, is_active=?,
             must_change_password=1, session_version=session_version+1,
             muted_until=?, mute_reason=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [
          displayName.value,
          adminNote.value,
          hashPassword(password.value),
          active,
          mutedUntil,
          muteReason,
          id,
        ],
      )
    : await run(
        `UPDATE users
         SET display_name=?, admin_note=?, is_active=?, muted_until=?, mute_reason=?,
             session_version=session_version+?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [
          displayName.value,
          adminNote.value,
          active,
          mutedUntil,
          muteReason,
          previous.is_active && !active ? 1 : 0,
          id,
        ],
      );
  if (!result.changes) return jsonError("账号不存在。", 404);
  await auditAdmin("update", "user", id, {
    display_name: displayName.value,
    is_active: active,
    password_reset: Boolean(password.value),
    muted_until: mutedUntil,
    mute_reason: muteReason,
  });
  return Response.json({ ok: true });
}

adminRoutes.put("/users/:id", requireAdmin, updateUserAsAdmin);
adminRoutes.patch("/users/:id", requireAdmin, updateUserAsAdmin);

adminRoutes.delete("/users/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id)) return jsonError("账号不存在。", 404);
  const result = await run("DELETE FROM users WHERE id=?", [id]);
  if (!result.changes) return jsonError("账号不存在。", 404);
  await auditAdmin("delete", "user", id);
  return Response.json({ ok: true });
});

/* ------------------------------------------------------------- 审计 / 设置 */

adminRoutes.get("/audit", requireAdminSession, async () => apiData(await adminAuditPayload()));

adminRoutes.get("/settings", requireAdminSession, async () =>
  apiData(await adminSettingsPayload()),
);

function validLink(url: string) {
  if (!url) return true;
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

adminRoutes.put("/settings", requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("没有收到站点设置。");

  const values = {
    welcome_title: String(body.welcome_title || "")
      .trim()
      .slice(0, 50),
    welcome_opening: String(body.welcome_opening || "")
      .trim()
      .slice(0, 200),
    welcome_about_link: String(body.welcome_about_link || "")
      .trim()
      .slice(0, 80),
    welcome_random_link: String(body.welcome_random_link || "")
      .trim()
      .slice(0, 80),
    welcome_treat_prefix: String(body.welcome_treat_prefix || "")
      .trim()
      .slice(0, 80),
    welcome_cookie_button: String(body.welcome_cookie_button || "")
      .trim()
      .slice(0, 40),
    welcome_tea_button: String(body.welcome_tea_button || "")
      .trim()
      .slice(0, 40),
    welcome_treat_suffix: String(body.welcome_treat_suffix || "")
      .trim()
      .slice(0, 40),
    welcome_closing: String(body.welcome_closing || "")
      .trim()
      .slice(0, 300),
    welcome_visit_prefix: String(body.welcome_visit_prefix || "").slice(0, 100),
    welcome_visit_suffix: String(body.welcome_visit_suffix || "").slice(0, 100),
    announcement_enabled: body.announcement_enabled === "1" ? "1" : "0",
    announcement_title: String(body.announcement_title || "")
      .trim()
      .slice(0, 50),
    announcement_body: String(body.announcement_body || "")
      .trim()
      .slice(0, 1000),
    announcement_link_label: String(body.announcement_link_label || "")
      .trim()
      .slice(0, 50),
    announcement_link_url: String(body.announcement_link_url || "")
      .trim()
      .slice(0, 300),
  };
  if (!validLink(values.announcement_link_url)) {
    return jsonError("公告链接必须是站内路径，或以 http://、https:// 开头。");
  }

  await transaction(async () => {
    for (const [key, value] of Object.entries(values)) {
      await run(
        `INSERT INTO site_settings(key,value) VALUES(?,?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        [key, value],
      );
    }
  });
  await auditAdmin("update", "site_settings", undefined, { keys: Object.keys(values) });
  return Response.json({ ok: true });
});

/* ----------------------------------------------------------- 活动扩展 */

adminRoutes.get("/events/:id/extensions", requireAdminSession, async (c) => {
  const eventId = Number(c.req.param("id"));
  if (!Number.isSafeInteger(eventId) || eventId < 1) return apiNotFound("活动不存在。");
  const event = await getEventById(eventId);
  if (!event) return apiNotFound("活动不存在。");
  return apiData({ extensions: await listAdminExtensions(eventId) });
});

function normalizeVisibility(value: unknown): ExtensionVisibility | undefined | null {
  if (value === undefined || value === null) return undefined;
  return value === "public" || value === "member" ? value : null;
}

adminRoutes.put("/events/:id/extensions/:kind", requireAdminApi, async (c) => {
  const eventId = Number(c.req.param("id"));
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    return apiError("NOT_FOUND", "活动不存在。", 404);
  }
  const event = await getEventById(eventId);
  if (!event) return apiError("NOT_FOUND", "活动不存在。", 404);

  const kind = c.req.param("kind");
  const definition = getExtensionDefinition(kind);
  if (!definition) {
    return apiError("UNKNOWN_EXTENSION", `未注册的模块: ${kind}`, 400);
  }

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("INVALID_BODY", "请求格式不正确。", 400);

  const version = Number(body.version);
  if (version !== definition.version) {
    return apiError(
      "VERSION_MISMATCH",
      `期望版本 ${definition.version}，收到 ${String(body.version)}`,
      409,
    );
  }

  const parsedConfig = definition.configSchema.safeParse(body.config);
  if (!parsedConfig.success) {
    return apiError("INVALID_CONFIG", "扩展配置校验失败", 422, parsedConfig.error.issues);
  }

  const visibility = normalizeVisibility(body.visibility);
  if (visibility === null) {
    return apiError("INVALID_VISIBILITY", "可见性必须是 public 或 member。", 422);
  }

  let sortOrder: number | undefined;
  if (body.sortOrder !== undefined) {
    const value = Number(body.sortOrder);
    if (!Number.isSafeInteger(value)) {
      return apiError("INVALID_SORT_ORDER", "排序必须是整数。", 422);
    }
    sortOrder = value;
  }

  let items: ExtensionItemInput[] | undefined;
  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) {
      return apiError("INVALID_ITEMS", "items 必须是数组。", 422);
    }
    if (!definition.itemSchema) {
      return apiError("INVALID_ITEMS", "该模块不接受条目。", 422);
    }
    items = [];
    const seenKeys = new Set<string>();
    for (const raw of body.items) {
      const record = (raw ?? {}) as Record<string, unknown>;
      const itemKey = typeof record.itemKey === "string" ? record.itemKey.trim() : "";
      if (!ITEM_KEY_PATTERN.test(itemKey)) {
        return apiError(
          "INVALID_ITEM_KEY",
          "itemKey 只能包含字母、数字、下划线与连字符，长度 1—80。",
          422,
        );
      }
      if (seenKeys.has(itemKey)) {
        return apiError("DUPLICATE_ITEM_KEY", `itemKey “${itemKey}” 重复。`, 422);
      }
      seenKeys.add(itemKey);
      const parsedItem = definition.itemSchema.safeParse(record.payload);
      if (!parsedItem.success) {
        return apiError("INVALID_ITEM", `条目“${itemKey}”校验失败。`, 422, parsedItem.error.issues);
      }
      items.push({ itemKey, payloadJson: JSON.stringify(parsedItem.data) });
    }
  }

  const previous = await findExtensionRow(eventId, kind);
  const record = await saveExtension({
    eventId,
    kind,
    version,
    visibility,
    sortOrder,
    enabled: body.enabled === undefined ? true : Boolean(body.enabled),
    allowUserItems: Boolean(definition.allowsUserItems),
    configJson: JSON.stringify(parsedConfig.data),
    items,
  });

  await auditAdmin(previous ? "update" : "create", "event_extension", record.id, {
    event_id: eventId,
    kind,
    version,
    item_count: record.items.length,
  });

  return apiData(record);
});

adminRoutes.patch("/events/:id/extensions/:kind", requireAdminApi, async (c) => {
  const eventId = Number(c.req.param("id"));
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    return apiError("NOT_FOUND", "活动不存在。", 404);
  }
  const kind = c.req.param("kind");
  if (!getExtensionDefinition(kind)) {
    return apiError("UNKNOWN_EXTENSION", `未注册的模块: ${kind}`, 400);
  }

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("INVALID_BODY", "请求格式不正确。", 400);

  const visibility = normalizeVisibility(body.visibility);
  if (visibility === null) {
    return apiError("INVALID_VISIBILITY", "可见性必须是 public 或 member。", 422);
  }
  let sortOrder: number | undefined;
  if (body.sortOrder !== undefined) {
    const value = Number(body.sortOrder);
    if (!Number.isSafeInteger(value)) {
      return apiError("INVALID_SORT_ORDER", "排序必须是整数。", 422);
    }
    sortOrder = value;
  }
  const enabled = body.enabled === undefined ? undefined : Boolean(body.enabled);
  if (enabled === undefined && sortOrder === undefined && visibility === undefined) {
    return apiError("INVALID_BODY", "没有需要更新的字段。", 400);
  }

  const record = await patchExtension(eventId, kind, { enabled, sortOrder, visibility });
  if (!record) return apiError("NOT_FOUND", "活动扩展不存在。", 404);

  await auditAdmin("update", "event_extension", record.id, {
    event_id: eventId,
    kind,
    enabled: record.enabled,
    visibility: record.visibility,
    sort_order: record.sortOrder,
  });
  return apiData(record);
});

adminRoutes.delete("/events/:id/extensions/:kind", requireAdminApi, async (c) => {
  const eventId = Number(c.req.param("id"));
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    return apiError("NOT_FOUND", "活动不存在。", 404);
  }
  const kind = c.req.param("kind");
  if (!getExtensionDefinition(kind)) {
    return apiError("UNKNOWN_EXTENSION", `未注册的模块: ${kind}`, 400);
  }

  const deleted = await softDeleteExtension(eventId, kind);
  if (!deleted) return apiError("NOT_FOUND", "活动扩展不存在。", 404);

  const existing = await findExtensionRow(eventId, kind);
  await auditAdmin("delete", "event_extension", existing?.id, { event_id: eventId, kind });
  return apiData(deleted);
});
