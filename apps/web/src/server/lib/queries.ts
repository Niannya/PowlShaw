import { all, get } from "../db/sql";
import { containsLike } from "./db-search";
import type { EventGroup } from "@/lib/event-groups";

/**
 * 公共读取（异步版 `apps/api/src/lib/queries.ts`）。
 *
 * SQL 语义与旧实现一一对应，只做了两处必要调整：
 * - `articles` 的列表/详情列由封面图片列换成 `visual_theme`；
 * - 所有函数改为 `await`，供 Hono 路由与 RSC 进程内调用。
 */

export type VisualThemeName = "auto" | "astrolabe" | "stele" | "graticule" | "manuscript";

export type ArticleListItem = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  published_at: string | null;
  visual_theme: VisualThemeName;
  is_pinned: number;
  event_section_path?: string;
};

export type Article = ArticleListItem & {
  content_html: string;
  status: string;
  comments_mode: "open" | "closed" | "hidden";
  events: Event[];
};

export type Event = {
  id: number;
  slug: string;
  title: string;
  event_group: EventGroup;
  summary: string;
  content_html: string;
  starts_at: string | null;
  ends_at: string | null;
  status_override: "upcoming" | "active" | "ended" | null;
  visual_theme: VisualThemeName;
  is_featured: number;
  sort_order: number;
  article_count?: number;
};

export type EventDocument = {
  id: number;
  display_name: string;
  context_label: string;
  file_url: string;
  file_size: number;
};

export const articleSelect = `
  SELECT a.id, a.slug, a.title, a.excerpt, a.published_at, a.visual_theme, a.is_pinned
  FROM articles a
`;

export async function getRecentArticles(limit = 12) {
  return all<ArticleListItem>(
    `${articleSelect}
     WHERE a.status = 'published'
     ORDER BY a.is_pinned DESC, a.published_at DESC, a.id DESC
     LIMIT ?`,
    [limit],
  );
}

export async function getArticles(page = 1, perPage = 30) {
  const totalRow = await get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM articles WHERE status = 'published'",
  );
  const total = Number(totalRow?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(page, 1), pages);
  const offset = (currentPage - 1) * perPage;
  const items = await all<ArticleListItem>(
    `${articleSelect}
     WHERE a.status = 'published'
     ORDER BY a.is_pinned DESC, a.published_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [perPage, offset],
  );
  return { items, total, page: currentPage, pages };
}

export async function getArticle(slug: string) {
  const articleDetailSelect = articleSelect.replace(
    "a.is_pinned",
    "a.is_pinned, a.content_html, a.status, a.comments_mode",
  );
  const row = await get<Article>(
    `${articleDetailSelect}
     WHERE a.slug = ? AND a.status = 'published'`,
    [slug],
  );
  if (!row) return undefined;
  row.events = await all<Event>(
    `SELECT e.*
     FROM events e
     JOIN event_articles ea ON ea.event_id = e.id
     WHERE ea.article_id = ?
     ORDER BY e.starts_at DESC`,
    [row.id],
  );
  return row;
}

export async function getArticleNeighbors(publishedAt: string | null, id: number) {
  if (!publishedAt) return { previous: undefined, next: undefined };
  const previous = await get<ArticleListItem>(
    `${articleSelect}
     WHERE a.status = 'published'
       AND (a.published_at < ? OR (a.published_at = ? AND a.id < ?))
     ORDER BY a.published_at DESC, a.id DESC
     LIMIT 1`,
    [publishedAt, publishedAt, id],
  );
  const next = await get<ArticleListItem>(
    `${articleSelect}
     WHERE a.status = 'published'
       AND (a.published_at > ? OR (a.published_at = ? AND a.id > ?))
     ORDER BY a.published_at ASC, a.id ASC
     LIMIT 1`,
    [publishedAt, publishedAt, id],
  );
  return { previous, next };
}

export async function getEvents() {
  return all<Event>(
    `SELECT e.*, COUNT(ea.article_id) AS article_count
     FROM events e
     LEFT JOIN event_articles ea ON ea.event_id = e.id
     GROUP BY e.id
     ORDER BY e.sort_order ASC, COALESCE(e.starts_at, e.created_at) DESC`,
  );
}

export async function getFeaturedEvent() {
  // 首页只展示后台明确选择的活动，不再静默替换成其他“进行中”活动。
  return (await getEvents()).find((event) => event.is_featured);
}

export async function getEvent(slug: string) {
  return get<Event>("SELECT * FROM events WHERE slug=?", [slug]);
}

export async function getEventById(id: number) {
  return get<Event>("SELECT * FROM events WHERE id=?", [id]);
}

export async function getEventDocuments(eventId: number) {
  return all<EventDocument>(
    `SELECT id, display_name, context_label, file_url, file_size
     FROM event_documents
     WHERE event_id = ?
     ORDER BY sort_order, display_name`,
    [eventId],
  );
}

export async function getArticlesByEvent(eventId: number) {
  return all<ArticleListItem>(
    `SELECT a.id, a.slug, a.title, a.excerpt, a.published_at, a.visual_theme, a.is_pinned,
            ea.section_path AS event_section_path
     FROM articles a
     JOIN event_articles ea ON ea.article_id = a.id
     WHERE ea.event_id = ? AND a.status = 'published'
     ORDER BY ea.sort_order, a.published_at DESC, a.id DESC`,
    [eventId],
  );
}

export async function searchArticles(query: string, page = 1, perPage = 30) {
  const value = containsLike(query);
  const where = `a.status = 'published'
    AND (a.title LIKE ? ESCAPE '\\' OR a.excerpt LIKE ? ESCAPE '\\' OR a.content_html LIKE ? ESCAPE '\\')`;
  const totalRow = await get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM articles a WHERE ${where}`,
    [value, value, value],
  );
  const total = Number(totalRow?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(page, 1), pages);
  const items = await all<ArticleListItem>(
    `${articleSelect}
     WHERE ${where}
     ORDER BY a.published_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [value, value, value, perPage, (currentPage - 1) * perPage],
  );
  return { items, total, page: currentPage, pages };
}

export async function getArticlesByYear(year: string, page = 1, perPage = 30) {
  const totalRow = await get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM articles
     WHERE status='published' AND substr(published_at, 1, 4)=?`,
    [year],
  );
  const total = Number(totalRow?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(page, 1), pages);
  const items = await all<ArticleListItem>(
    `${articleSelect}
     WHERE a.status = 'published'
       AND substr(a.published_at, 1, 4) = ?
     ORDER BY a.published_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [year, perPage, (currentPage - 1) * perPage],
  );
  return { items, total, page: currentPage, pages };
}

export async function getArchiveYears() {
  return all<{ year: string; count: number }>(
    `SELECT substr(published_at, 1, 4) AS year, COUNT(*) AS count
     FROM articles
     WHERE status = 'published' AND published_at IS NOT NULL
     GROUP BY year
     ORDER BY year DESC`,
  );
}
