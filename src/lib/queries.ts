import { getDb } from "@/lib/db";
import type { EventGroup } from "@/lib/event-groups";
import { containsLike } from "@/lib/db-search";

export { eventStatus } from "@/lib/event-status";

export type ArticleListItem = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  published_at: string | null;
  cover_url: string | null;
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
  banner_url: string | null;
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

const articleSelect = `
  SELECT a.id, a.slug, a.title, a.excerpt, a.published_at, a.cover_url, a.is_pinned
  FROM articles a
`;

export function getRecentArticles(limit = 12) {
  return getDb()
    .prepare(
      `${articleSelect}
       WHERE a.status = 'published'
       ORDER BY a.is_pinned DESC, a.published_at DESC, a.id DESC
       LIMIT ?`,
    )
    .all(limit) as unknown as ArticleListItem[];
}

export function getArticles(page = 1, perPage = 30) {
  const total = (
    getDb().prepare("SELECT COUNT(*) AS count FROM articles WHERE status = 'published'").get() as {
      count: number;
    }
  ).count;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(page, 1), pages);
  const offset = (currentPage - 1) * perPage;
  const items = getDb()
    .prepare(
      `${articleSelect}
       WHERE a.status = 'published'
       ORDER BY a.is_pinned DESC, a.published_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(perPage, offset) as unknown as ArticleListItem[];
  return { items, total, page: currentPage, pages };
}

export function getArticle(slug: string) {
  const articleDetailSelect = articleSelect.replace(
    "a.is_pinned",
    "a.is_pinned, a.content_html, a.status, a.comments_mode",
  );
  const row = getDb()
    .prepare(
      `${articleDetailSelect}
       WHERE a.slug = ? AND a.status = 'published'`,
    )
    .get(slug) as unknown as Article | undefined;
  if (!row) return undefined;
  row.events = getDb()
    .prepare(
      `SELECT e.*
       FROM events e
       JOIN event_articles ea ON ea.event_id = e.id
       WHERE ea.article_id = ?
       ORDER BY e.starts_at DESC`,
    )
    .all(row.id) as unknown as Event[];
  return row;
}

export function getArticleNeighbors(publishedAt: string | null, id: number) {
  if (!publishedAt) return { previous: undefined, next: undefined };
  const previous = getDb()
    .prepare(
      `${articleSelect}
       WHERE a.status = 'published'
         AND (a.published_at < ? OR (a.published_at = ? AND a.id < ?))
       ORDER BY a.published_at DESC, a.id DESC
       LIMIT 1`,
    )
    .get(publishedAt, publishedAt, id) as unknown as ArticleListItem | undefined;
  const next = getDb()
    .prepare(
      `${articleSelect}
       WHERE a.status = 'published'
         AND (a.published_at > ? OR (a.published_at = ? AND a.id > ?))
       ORDER BY a.published_at ASC, a.id ASC
       LIMIT 1`,
    )
    .get(publishedAt, publishedAt, id) as unknown as ArticleListItem | undefined;
  return { previous, next };
}

export function getEvents() {
  return getDb()
    .prepare(
      `SELECT e.*, COUNT(ea.article_id) AS article_count
       FROM events e
       LEFT JOIN event_articles ea ON ea.event_id = e.id
       GROUP BY e.id
       ORDER BY e.sort_order ASC, COALESCE(e.starts_at, e.created_at) DESC`,
    )
    .all() as unknown as Event[];
}

export function getFeaturedEvent() {
  // 首页只展示后台明确选择的活动，不再静默替换成其他“进行中”活动。
  return getEvents().find((event) => event.is_featured);
}

export function getEvent(slug: string) {
  return getDb().prepare("SELECT * FROM events WHERE slug=?").get(slug) as unknown as
    Event | undefined;
}

export function getEventDocuments(eventId: number) {
  return getDb()
    .prepare(
      `SELECT id, display_name, context_label, file_url, file_size
       FROM event_documents
       WHERE event_id = ?
       ORDER BY sort_order, display_name`,
    )
    .all(eventId) as EventDocument[];
}

export function getArticlesByEvent(eventId: number) {
  return getDb()
    .prepare(
      `SELECT a.id, a.slug, a.title, a.excerpt, a.published_at, a.cover_url, a.is_pinned,
              ea.section_path AS event_section_path
       FROM articles a
       JOIN event_articles ea ON ea.article_id = a.id
       WHERE ea.event_id = ? AND a.status = 'published'
       ORDER BY ea.sort_order, a.published_at DESC, a.id DESC`,
    )
    .all(eventId) as unknown as ArticleListItem[];
}

export function searchArticles(query: string, page = 1, perPage = 30) {
  const value = containsLike(query);
  const where = `a.status = 'published'
    AND (a.title LIKE ? ESCAPE '\\' OR a.excerpt LIKE ? ESCAPE '\\' OR a.content_html LIKE ? ESCAPE '\\')`;
  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) AS count FROM articles a WHERE ${where}`)
      .get(value, value, value) as { count: number }
  ).count;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(page, 1), pages);
  const items = getDb()
    .prepare(
      `${articleSelect}
       WHERE ${where}
       ORDER BY a.published_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(value, value, value, perPage, (currentPage - 1) * perPage) as unknown as ArticleListItem[];
  return { items, total, page: currentPage, pages };
}

export function getArticlesByYear(year: string, page = 1, perPage = 30) {
  const total = (
    getDb()
      .prepare(
        `SELECT COUNT(*) AS count FROM articles
         WHERE status='published' AND substr(published_at, 1, 4)=?`,
      )
      .get(year) as { count: number }
  ).count;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(page, 1), pages);
  const items = getDb()
    .prepare(
      `${articleSelect}
       WHERE a.status = 'published'
         AND substr(a.published_at, 1, 4) = ?
       ORDER BY a.published_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(year, perPage, (currentPage - 1) * perPage) as unknown as ArticleListItem[];
  return { items, total, page: currentPage, pages };
}

export function getArchiveYears() {
  return getDb()
    .prepare(
      `SELECT substr(published_at, 1, 4) AS year, COUNT(*) AS count
       FROM articles
       WHERE status = 'published' AND published_at IS NOT NULL
       GROUP BY year
       ORDER BY year DESC`,
    )
    .all() as unknown as { year: string; count: number }[];
}
