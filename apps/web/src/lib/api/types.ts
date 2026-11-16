import type { EventGroup } from "@/lib/event-groups";
import type { EventExtensionRecord, PublicEventExtension } from "@/lib/extensions/types";
import type { VisualTheme } from "@/lib/visual-theme";

/* --------------------------------------------------------------- site data */

export type SiteSettings = {
  welcome_title: string;
  welcome_opening: string;
  welcome_about_link: string;
  welcome_random_link: string;
  welcome_treat_prefix: string;
  welcome_cookie_button: string;
  welcome_tea_button: string;
  welcome_treat_suffix: string;
  welcome_closing: string;
  welcome_visit_prefix: string;
  welcome_visit_suffix: string;
  announcement_enabled: string;
  announcement_title: string;
  announcement_body: string;
  announcement_link_label: string;
  announcement_link_url: string;
  site_started_on: string;
  visit_count: string;
};

export type SiteSettingKey = keyof SiteSettings;

export type ArchiveYear = { year: string; count: number };

export type SitePayload = {
  settings: SiteSettings;
  archiveYears: ArchiveYear[];
  lastPublicUpdate: string | null;
};

export type PublicUser = {
  id: number;
  username: string;
  display_name: string;
  is_active: number;
  must_change_password: number;
  session_version: number;
  muted_until: string | null;
  mute_reason: string;
};

export type MePayload = {
  user: PublicUser | null;
  unreadNotifications: number;
};

export type NotificationItem = {
  id: number;
  type: "mention" | "reply";
  is_read: number;
  created_at: string;
  comment_id: number | null;
  article_slug: string | null;
  article_title: string | null;
  actor_name: string | null;
};

/* ------------------------------------------------------------------ content */

export type ArticleListItem = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  published_at: string | null;
  /** 纯代码视觉主题；旧数据缺省时按 `auto` 处理。 */
  visual_theme?: VisualTheme;
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
  /** 纯代码视觉主题；旧数据缺省时按 `auto` 处理。 */
  visual_theme?: VisualTheme;
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

export type EventDocumentRecord = EventDocument & { sort_order: number };

export type ArticleListResult = {
  items: ArticleListItem[];
  total: number;
  page: number;
  pages: number;
};

export type Comment = {
  id: number;
  article_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  status: "visible" | "hidden";
  is_pinned: number;
  edited_at: string | null;
  deleted_at: string | null;
  deleted_by: "user" | "admin" | null;
  created_at: string;
  display_name: string;
  username: string;
  replies: Comment[];
};

export type CommentsPage = {
  comments: Comment[];
  page: number;
  pages: number;
  totalComments: number;
  sort: "oldest" | "newest";
};

export type ArticleNeighbors = {
  previous?: ArticleListItem;
  next?: ArticleListItem;
};

export type ArticleDetailPayload = {
  article: Article;
  neighbors: ArticleNeighbors;
  comments: CommentsPage;
};

/**
 * 活动详情：固定骨架 + 扩展插槽。
 * 六张地图表与列国纪专题下线后不再有 map / snapshot / nodes / regions 字段。
 */
export type EventPayload = {
  event: Event;
  documents: EventDocument[];
  articles: ArticleListItem[];
  extensions: PublicEventExtension[];
};

/* ------------------------------------------------------------------- admin */

export type AdminSession = {
  authenticated: boolean;
  credentialsConfigured: boolean;
  username?: string;
};

export type AdminOverviewPayload = {
  counts: {
    articles: number;
    events: number;
    comments: number;
    users: number;
    media: number;
  };
  recentArticles: { id: number; title: string; status: string; updated_at: string }[];
};

export type AdminArticleRow = {
  id: number;
  title: string;
  slug: string;
  status: string;
  published_at: string | null;
  event_id: number | null;
  event_title: string | null;
  group_count: number;
};

export type AdminArticleListPayload = {
  rows: AdminArticleRow[];
  events: { id: number; title: string }[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
};

export type AdminArticlePayload = {
  article: Record<string, unknown>;
  events: { id: number; title: string }[];
  eventIds: number[];
};

/**
 * 管理端扩展条目：与 `PUT /admin/events/:id/extensions/:kind` 的 `items` 完全同构，
 * 可原样 round-trip 回写。
 */
export type AdminEventExtensionItem = {
  itemKey: string;
  payload: unknown;
};

/** 管理端扩展记录：`GET /admin/events/:id/extensions` 的单项。 */
export type AdminEventExtension = EventExtensionRecord<unknown> & {
  items: AdminEventExtensionItem[];
};

export type AdminEventDetailPayload = {
  event: Record<string, unknown>;
  entries: { id: number; title: string; section_path: string }[];
  sections: { id: number; path_name: string }[];
  documents: EventDocumentRecord[];
  extensions: AdminEventExtension[];
};

export type AdminComment = {
  id: number;
  content: string;
  status: string;
  is_pinned: number;
  deleted_at: string | null;
  deleted_by: string | null;
  edited_at: string | null;
  created_at: string;
  display_name: string;
  username: string;
  article_title: string;
  article_slug: string;
};

export type AdminCommentListPayload = {
  items: AdminComment[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
};

export type AdminUser = {
  id: number;
  username: string;
  display_name: string;
  admin_note: string;
  is_active: number;
  must_change_password: number;
  muted_until: string | null;
  mute_reason: string;
  last_login_at: string | null;
  created_at: string;
  comment_count: number;
  cookie_eaten: number;
  tea_drunk: number;
  cookie_broken: number;
  tea_broken: number;
};

export type AdminAuditRow = {
  id: number;
  action: string;
  target_type: string;
  target_id: number | null;
  details: string;
  created_at: string;
};

export type AdminRevisionRow = {
  id: number;
  target_type: string;
  target_id: number;
  action: string;
  snapshot_size: number;
  created_at: string;
};

export type AdminAuditPayload = {
  audit: AdminAuditRow[];
  revisions: AdminRevisionRow[];
};

/* ------------------------------------------------------------------ treats */

export type TreatKind = "cookie" | "tea";
export type TreatOutcome = "served" | "broken";
export type TreatTotals = {
  cookieEaten: number;
  teaDrunk: number;
  cookieBroken: number;
  teaBroken: number;
};

/* ---------------------------------------------------------------- redirects */

export type SlugKind = "article" | "event";
