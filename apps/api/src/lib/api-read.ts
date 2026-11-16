import { adminCredentialsAreConfigured, getAdminUsername, isAdminRequest } from "@/lib/auth";
import { commentPageForId, getCommentsPage } from "@/lib/comments";
import { containsLike } from "@/lib/db-search";
import { getDb } from "@/lib/db";
import { normalizeDateFilter } from "@/lib/date-filter";
import { localDayBoundaryUtc } from "@/lib/date-time";
import { getEventMapNodes } from "@/lib/event-map-nodes";
import { getEventMapRegions } from "@/lib/event-map-regions";
import { getEventMapRelations } from "@/lib/event-map-relations";
import { getEventMapSettings, getEventMapSettingsBySlug } from "@/lib/event-map-settings";
import { getEventMapSnapshot, getEventMapSnapshots } from "@/lib/event-map-snapshots";
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
} from "@/lib/queries";
import { getLastPublicUpdate, getSiteSettings } from "@/lib/site-settings";
import { getSlugRedirect, type SlugKind } from "@/lib/slug-redirects";
import { getUserFromRequest } from "@/lib/user-auth";

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

export function sitePayload() {
  return {
    settings: getSiteSettings(),
    archiveYears: getArchiveYears(),
    lastPublicUpdate: getLastPublicUpdate(),
  };
}

export function mePayload(request: Request) {
  const user = getUserFromRequest(request) ?? null;
  let unreadNotifications = 0;
  if (user) {
    unreadNotifications = (
      getDb()
        .prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND is_read=0")
        .get(user.id) as { count: number }
    ).count;
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

export function articlesPayload(input: ArticleListInput) {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const perPage = clampInteger(input.perPage, 30, 1, 100);
  const query = String(input.q ?? "").trim();
  const year = String(input.year ?? "").trim();
  if (query) return searchArticles(query, page, perPage);
  if (/^\d{4}$/.test(year)) return getArticlesByYear(year, page, perPage);
  if (input.limit) {
    const items = getRecentArticles(clampInteger(input.limit, 12, 1, 100));
    return { items, total: items.length, page: 1, pages: 1 };
  }
  return getArticles(page, perPage);
}

export function articlePayload(
  slug: string,
  input: { commentPage?: number; commentSort?: string; commentId?: number },
) {
  const article = getArticle(slug);
  if (!article) return undefined;
  const sort = input.commentSort === "newest" ? "newest" : "oldest";
  const page = input.commentId
    ? commentPageForId(article.id, input.commentId, sort)
    : Math.max(1, Math.trunc(input.commentPage ?? 1));
  return {
    article,
    neighbors: getArticleNeighbors(article.published_at, article.id),
    comments: getCommentsPage(article.id, page, sort),
  };
}

export function randomArticlePayload() {
  const row = getDb()
    .prepare("SELECT slug FROM articles WHERE status='published' ORDER BY RANDOM() LIMIT 1")
    .get() as { slug: string } | undefined;
  return { slug: row?.slug ?? null };
}

export function eventsPayload() {
  return { items: getEvents() };
}

export function eventPayload(slug: string, snapshotId?: number) {
  const event = getEvent(slug);
  if (!event) return undefined;
  const map = getEventMapSettingsBySlug(slug) ?? null;
  const snapshot = snapshotId && map ? (getEventMapSnapshot(event.id, snapshotId) ?? null) : null;
  const snapshots = map ? getEventMapSnapshots(event.id) : [];
  const nodes = snapshot?.nodes ?? (map ? getEventMapNodes(event.id) : []);
  const regions = snapshot?.regions ?? (map ? getEventMapRegions(event.id) : []);
  const relations = snapshot?.relations ?? (map ? getEventMapRelations(event.id) : []);
  return {
    event,
    map,
    documents: getEventDocuments(event.id),
    articles: getArticlesByEvent(event.id),
    snapshots,
    snapshot,
    nodes,
    regions,
    relations,
  };
}

export function redirectPayload(kind: string, slug: string) {
  if ((kind !== "article" && kind !== "event") || !slug) return undefined;
  return { target: getSlugRedirect(kind as SlugKind, slug) ?? null };
}

export function notificationsPayload(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) return undefined;
  const items = getDb()
    .prepare(
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
    )
    .all(user.id);
  return { items };
}

/* ------------------------------------------------------------------- admin */

export function adminSessionPayload(request: Request) {
  const authenticated = isAdminRequest(request);
  const credentialsConfigured = adminCredentialsAreConfigured();
  return {
    authenticated,
    credentialsConfigured,
    username: credentialsConfigured ? getAdminUsername() : undefined,
  };
}

export function adminOverviewPayload() {
  const db = getDb();
  const count = (table: "articles" | "events" | "comments" | "users" | "media") =>
    (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  const recentArticles = db
    .prepare(
      `SELECT id, title, status, updated_at
       FROM articles ORDER BY updated_at DESC, id DESC LIMIT 6`,
    )
    .all() as { id: number; title: string; status: string; updated_at: string }[];
  return {
    counts: {
      articles: count("articles"),
      events: count("events"),
      comments: count("comments"),
      users: count("users"),
      media: count("media"),
    },
    recentArticles,
  };
}

export function adminArticlesPayload(input: { q?: string; eventId?: number; page?: number }) {
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

  const db = getDb();
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM articles a ${where}`).get(...values) as {
      count: number;
    }
  ).count;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(requestedPage, pages);
  const rows = db
    .prepare(
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
    )
    .all(...(eventFilter ? [eventId] : []), ...values, perPage, (page - 1) * perPage);
  const events = db
    .prepare("SELECT id, title FROM events ORDER BY sort_order, starts_at DESC, id DESC")
    .all() as { id: number; title: string }[];
  return { rows, events, total, page, pages, perPage };
}

export function adminArticlePayload(id: number) {
  const db = getDb();
  const article = db.prepare("SELECT * FROM articles WHERE id=?").get(id) as
    Record<string, unknown> | undefined;
  if (!article) return undefined;
  const events = db.prepare("SELECT id,title FROM events ORDER BY starts_at DESC").all() as {
    id: number;
    title: string;
  }[];
  const eventIds = (
    db.prepare("SELECT event_id AS id FROM event_articles WHERE article_id=?").all(id) as {
      id: number;
    }[]
  ).map((row) => row.id);
  return { article, events, eventIds };
}

export function adminEventOptionsPayload() {
  return {
    items: getDb().prepare("SELECT id,title FROM events ORDER BY starts_at DESC").all() as {
      id: number;
      title: string;
    }[],
  };
}

export function adminEventsPayload() {
  return { items: getEvents() };
}

export function adminEventPayload(id: number) {
  const db = getDb();
  const event = db.prepare("SELECT * FROM events WHERE id=?").get(id) as
    Record<string, unknown> | undefined;
  if (!event) return undefined;
  const entries = db
    .prepare(
      `SELECT a.id, a.title, ea.section_path
       FROM event_articles ea
       JOIN articles a ON a.id=ea.article_id
       WHERE ea.event_id=?
       ORDER BY ea.sort_order,a.id`,
    )
    .all(id);
  const sections = db
    .prepare(
      `SELECT id, path_name
       FROM event_sections
       WHERE event_id=?
       ORDER BY sort_order,id`,
    )
    .all(id);
  const documents = db
    .prepare(
      `SELECT id, display_name, context_label, file_url, file_size, sort_order
       FROM event_documents
       WHERE event_id=?
       ORDER BY sort_order, display_name`,
    )
    .all(id);
  const mapSettings = getEventMapSettings(id) ?? null;
  return {
    event,
    entries,
    sections,
    documents,
    mapSettings,
    mapSnapshots: mapSettings ? getEventMapSnapshots(id) : [],
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

export function adminCommentsPayload(query: AdminCommentQuery) {
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
  const db = getDb();
  const baseFrom = `FROM comments c JOIN users u ON u.id=c.user_id JOIN articles a ON a.id=c.article_id`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS count ${baseFrom} ${where}`).get(...values) as { count: number }
  ).count;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, Math.trunc(query.page ?? 1)), pages);
  const items = db
    .prepare(
      `SELECT c.id, c.content, c.status, c.is_pinned, c.deleted_at, c.deleted_by,
              c.edited_at, c.created_at, u.display_name, u.username,
              a.title AS article_title, a.slug AS article_slug
       ${baseFrom} ${where}
       ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...values, perPage, (page - 1) * perPage);
  return { items, total, page, pages, perPage };
}

export function adminUsersPayload() {
  const items = getDb()
    .prepare(
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
    )
    .all();
  return { items };
}

export function adminAuditPayload() {
  const db = getDb();
  const audit = db
    .prepare(
      `SELECT id, action, target_type, target_id, details, created_at
       FROM admin_audit_log ORDER BY created_at DESC, id DESC LIMIT 1000`,
    )
    .all();
  const revisions = db
    .prepare(
      `SELECT id, target_type, target_id, action, length(snapshot_json) AS snapshot_size, created_at
       FROM content_revisions ORDER BY created_at DESC, id DESC LIMIT 100`,
    )
    .all();
  return { audit, revisions };
}

export function adminSettingsPayload() {
  return { settings: getSiteSettings() };
}
