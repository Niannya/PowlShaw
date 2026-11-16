import { all, get } from "../db/sql";
import type { AdminIdentity, PublicUser } from "./session-tokens";
import { readAdminCredentials } from "./admin-credentials";
import { commentPageForId, getCommentsPage } from "./comments";
import { containsLike } from "./db-search";
import { normalizeDateFilter } from "@/lib/date-filter";
import { localDayBoundaryUtc } from "@/lib/date-time";
import {
  getArchiveYears,
  getArticle,
  getArticleNeighbors,
  getArticles,
  getArticlesByEvent,
  getArticlesByYear,
  getEvent,
  getEventDocuments,
  getEvents,
  getRecentArticles,
  searchArticles,
} from "./queries";
import { getLastPublicUpdate, getSiteSettings } from "./site-settings";
import { getSlugRedirect, type SlugKind } from "./slug-redirects";
import { listAdminExtensions, listPublicExtensions } from "./extensions/store";
import { userCanPublishContent } from "./session-tokens";

/**
 * 读取端点的数据装配层（旧 `apps/api/src/lib/api-read.ts` 的异步移植）。
 *
 * 与旧实现相比只有三处契约变化：
 * - 活动详情不再返回地图相关字段（`map` / `snapshots` / `snapshot` / `nodes` / `regions` / `relations`），
 *   改为返回 `extensions`；
 * - 文章列表/详情用 `visual_theme` 取代封面图片列；
 * - 后台概览的 `counts.media` 保留字段并固定返回 0（前端类型仍引用它）。
 */

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const number = Number.isFinite(value) ? Math.trunc(value as number) : fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function safePositiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

/* ------------------------------------------------------------------ public */

export async function sitePayload() {
  return {
    settings: await getSiteSettings(),
    archiveYears: await getArchiveYears(),
    lastPublicUpdate: await getLastPublicUpdate(),
  };
}

export async function mePayload(user: PublicUser | null) {
  let unreadNotifications = 0;
  if (user) {
    const row = await get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND is_read=0",
      [user.id],
    );
    unreadNotifications = Number(row?.count ?? 0);
  }
  return { user, unreadNotifications };
}

export type ArticleListInput = {
  page?: number;
  perPage?: number;
  limit?: number;
  q?: string;
  year?: string;
};

export async function articlesPayload(input: ArticleListInput) {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const perPage = clampInteger(input.perPage, 30, 1, 100);
  const query = String(input.q ?? "").trim();
  const year = String(input.year ?? "").trim();
  if (query) return searchArticles(query, page, perPage);
  if (/^\d{4}$/.test(year)) return getArticlesByYear(year, page, perPage);
  if (input.limit) {
    const items = await getRecentArticles(clampInteger(input.limit, 12, 1, 100));
    return { items, total: items.length, page: 1, pages: 1 };
  }
  return getArticles(page, perPage);
}

export async function articlePayload(
  slug: string,
  input: { commentPage?: number; commentSort?: string; commentId?: number },
) {
  const article = await getArticle(slug);
  if (!article) return undefined;
  const sort = input.commentSort === "newest" ? "newest" : "oldest";
  const page = input.commentId
    ? await commentPageForId(article.id, input.commentId, sort)
    : Math.max(1, Math.trunc(input.commentPage ?? 1));
  return {
    article,
    neighbors: await getArticleNeighbors(article.published_at, article.id),
    comments: await getCommentsPage(article.id, page, sort),
  };
}

export async function randomArticlePayload() {
  const row = await get<{ slug: string }>(
    "SELECT slug FROM articles WHERE status='published' ORDER BY RANDOM() LIMIT 1",
  );
  return { slug: row?.slug ?? null };
}

export async function eventsPayload() {
  return { items: await getEvents() };
}

/** 活动详情：`{ event, documents, articles, extensions }`，无任何地图字段。 */
export async function eventPayload(
  slug: string,
  options: { isMember: boolean; canSubmitEnabled: boolean },
) {
  const event = await getEvent(slug);
  if (!event) return undefined;
  return {
    event,
    documents: await getEventDocuments(event.id),
    articles: await getArticlesByEvent(event.id),
    extensions: await listPublicExtensions(event.id, options.isMember, options.canSubmitEnabled),
  };
}

/** 供活动详情路由计算 `canSubmit`：登录 + 未强制改密 + 未在禁言期内。 */
export function canSubmitExtensions(user: PublicUser | null) {
  return Boolean(user) && userCanPublishContent(user as PublicUser);
}

export async function redirectPayload(kind: string, slug: string) {
  if ((kind !== "article" && kind !== "event") || !slug) return undefined;
  return { target: (await getSlugRedirect(kind as SlugKind, slug)) ?? null };
}

export async function notificationsPayload(userId: number) {
  const items = await all(
    `SELECT n.id, n.type, n.is_read, n.created_at, c.id AS comment_id,
            a.slug AS article_slug, a.title AS article_title,
            actor.display_name AS actor_name
     FROM notifications n
     LEFT JOIN comments c ON c.id=n.comment_id
     LEFT JOIN articles a ON a.id=c.article_id
     LEFT JOIN users actor ON actor.id=n.actor_user_id
     WHERE n.user_id=?
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT 100`,
    [userId],
  );
  return { items };
}

/* ------------------------------------------------------------------- admin */

export async function adminSessionPayload(admin: AdminIdentity | null) {
  const credentials = await readAdminCredentials();
  return {
    authenticated: Boolean(admin),
    credentialsConfigured: Boolean(credentials),
    username: credentials ? credentials.username : undefined,
  };
}

export async function adminOverviewPayload() {
  const count = async (table: "articles" | "events" | "comments" | "users") => {
    const row = await get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    return Number(row?.count ?? 0);
  };
  const recentArticles = await all<{
    id: number;
    title: string;
    status: string;
    updated_at: string;
  }>(
    `SELECT id, title, status, updated_at
     FROM articles ORDER BY updated_at DESC, id DESC LIMIT 6`,
  );
  return {
    counts: {
      articles: await count("articles"),
      events: await count("events"),
      comments: await count("comments"),
      users: await count("users"),
      // 去图片化后不再有媒体库；字段保留以免前端类型与页面报错。
      media: 0,
    },
    recentArticles,
  };
}

export async function adminArticlesPayload(input: { q?: string; eventId?: number; page?: number }) {
  const keyword = String(input.q ?? "").trim();
  const eventId = safePositiveInteger(input.eventId);
  const eventFilter = Boolean(eventId);
  const perPage = 100;
  const requestedPage = Math.max(1, Math.trunc(input.page ?? 1));
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (keyword) {
    clauses.push("(a.title LIKE ? ESCAPE '\\' OR a.slug LIKE ? ESCAPE '\\')");
    const value = containsLike(keyword);
    values.push(value, value);
  }
  if (eventFilter) {
    clauses.push(
      "EXISTS(SELECT 1 FROM event_articles filter_ea WHERE filter_ea.article_id=a.id AND filter_ea.event_id=?)",
    );
    values.push(eventId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const totalRow = await get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM articles a ${where}`,
    values,
  );
  const total = Number(totalRow?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(requestedPage, pages);
  const rows = await all(
    `SELECT a.id, a.title, a.slug, a.status, a.published_at,
            e.id AS event_id, e.title AS event_title,
            COUNT(*) OVER (PARTITION BY e.id) AS group_count
     FROM articles a
     LEFT JOIN event_articles ea ON ea.article_id = a.id
       AND ea.event_id = COALESCE(
         ${eventFilter ? "?" : "NULL"},
         (SELECT ea2.event_id
          FROM event_articles ea2 JOIN events e2 ON e2.id=ea2.event_id
          WHERE ea2.article_id=a.id
          ORDER BY e2.sort_order, e2.id LIMIT 1)
       )
     LEFT JOIN events e ON e.id = ea.event_id
     ${where}
     ORDER BY CASE WHEN e.id IS NULL THEN 1 ELSE 0 END,
              e.sort_order, a.published_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...(eventFilter ? [eventId] : []), ...values, perPage, (page - 1) * perPage],
  );
  const events = await all<{ id: number; title: string }>(
    "SELECT id, title FROM events ORDER BY sort_order, starts_at DESC, id DESC",
  );
  return { rows, events, total, page, pages, perPage };
}

export async function adminArticlePayload(id: number) {
  const article = await get<Record<string, unknown>>("SELECT * FROM articles WHERE id=?", [id]);
  if (!article) return undefined;
  const events = await all<{ id: number; title: string }>(
    "SELECT id, title FROM events ORDER BY starts_at DESC",
  );
  const eventIds = (
    await all<{ id: number }>("SELECT event_id AS id FROM event_articles WHERE article_id=?", [id])
  ).map((row) => Number(row.id));
  return { article, events, eventIds };
}

export async function adminEventOptionsPayload() {
  return {
    items: await all<{ id: number; title: string }>(
      "SELECT id, title FROM events ORDER BY starts_at DESC",
    ),
  };
}

export async function adminEventsPayload() {
  return { items: await getEvents() };
}

export async function adminEventPayload(id: number) {
  const event = await get<Record<string, unknown>>("SELECT * FROM events WHERE id=?", [id]);
  if (!event) return undefined;
  const entries = await all(
    `SELECT a.id, a.title, ea.section_path
     FROM event_articles ea
     JOIN articles a ON a.id=ea.article_id
     WHERE ea.event_id=?
     ORDER BY ea.sort_order,a.id`,
    [id],
  );
  const sections = await all(
    `SELECT id, path_name
     FROM event_sections
     WHERE event_id=?
     ORDER BY sort_order,id`,
    [id],
  );
  const documents = await all(
    `SELECT id, display_name, context_label, file_url, file_size, sort_order
     FROM event_documents
     WHERE event_id=?
     ORDER BY sort_order, display_name`,
    [id],
  );
  return {
    event,
    entries,
    sections,
    documents,
    extensions: await listAdminExtensions(id),
  };
}

type AdminCommentQuery = {
  q?: string;
  status?: string;
  article?: string;
  user?: string;
  from?: string;
  to?: string;
  page?: number;
};

export async function adminCommentsPayload(query: AdminCommentQuery) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const q = String(query.q ?? "").trim();
  const article = String(query.article ?? "").trim();
  const user = String(query.user ?? "").trim();
  if (q) {
    clauses.push("c.content LIKE ? ESCAPE '\\'");
    values.push(containsLike(q));
  }
  if (query.status === "visible" || query.status === "hidden") {
    clauses.push("c.status=?");
    values.push(query.status);
  } else if (query.status === "deleted") {
    clauses.push("c.deleted_at IS NOT NULL");
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
  const from = normalizeDateFilter(query.from);
  const to = normalizeDateFilter(query.to);
  if (from) {
    clauses.push("c.created_at>=?");
    values.push(localDayBoundaryUtc(from));
  }
  if (to) {
    clauses.push("c.created_at<=?");
    values.push(localDayBoundaryUtc(to, true));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const perPage = 50;
  const baseFrom = `FROM comments c JOIN users u ON u.id=c.user_id JOIN articles a ON a.id=c.article_id`;
  const totalRow = await get<{ count: number }>(
    `SELECT COUNT(*) AS count ${baseFrom} ${where}`,
    values,
  );
  const total = Number(totalRow?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, Math.trunc(query.page ?? 1)), pages);
  const items = await all(
    `SELECT c.id, c.content, c.status, c.is_pinned, c.deleted_at, c.deleted_by,
            c.edited_at, c.created_at, u.display_name, u.username,
            a.title AS article_title, a.slug AS article_slug
     ${baseFrom} ${where}
     ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`,
    [...values, perPage, (page - 1) * perPage],
  );
  return { items, total, page, pages, perPage };
}

export async function adminUsersPayload() {
  const items = await all(
    `SELECT u.id, u.username, u.display_name, u.admin_note, u.is_active,
            u.must_change_password, u.muted_until, u.mute_reason,
            u.last_login_at, u.created_at,
            COUNT(c.id) AS comment_count,
            COALESCE(ts.cookie_eaten, 0) AS cookie_eaten,
            COALESCE(ts.tea_drunk, 0) AS tea_drunk,
            COALESCE(ts.cookie_broken, 0) AS cookie_broken,
            COALESCE(ts.tea_broken, 0) AS tea_broken
     FROM users u
     LEFT JOIN comments c ON c.user_id = u.id
     LEFT JOIN user_treat_stats ts ON ts.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at DESC, u.id DESC`,
  );
  return { items };
}

export async function adminAuditPayload() {
  const audit = await all(
    `SELECT id, action, target_type, target_id, details, created_at
     FROM admin_audit_log ORDER BY created_at DESC, id DESC LIMIT 1000`,
  );
  const revisions = await all(
    `SELECT id, target_type, target_id, action, length(snapshot_json) AS snapshot_size, created_at
     FROM content_revisions ORDER BY created_at DESC, id DESC LIMIT 100`,
  );
  return { audit, revisions };
}

export async function adminSettingsPayload() {
  return { settings: await getSiteSettings() };
}
