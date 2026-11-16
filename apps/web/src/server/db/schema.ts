import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/**
 * 云端数据库 schema（Turso / libSQL）：30 张旧表 → 20 张表。
 *
 * 删除：`uploaded_assets`、`media`、`categories`、`article_categories`、6 张 `event_map_*`、
 * `pages`、`comments_archive`。
 * 精简：作者头像、作品封面、活动横幅三个图片列全部移除，
 * `articles` / `events` 新增 `visual_theme`。
 * 新增：`event_extensions`、`event_extension_items`。
 *
 * 说明：本文件是 Drizzle 侧的“类型化镜像”，权威 DDL 在 `scripts/schema.sql`
 * （含 `COLLATE NOCASE`、`INSERT OR IGNORE` 种子等 Drizzle 无法完整表达的部分）。
 * 运行时读取仍沿用旧实现的 SQL 字符串（经 `db/sql.ts` 异步执行），
 * 新增的扩展表则通过本 schema 用 Drizzle 查询。
 */

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`);

/** 站点视觉主题枚举；非法值在写入前一律回退 `auto`。 */
export const VISUAL_THEMES = ["auto", "astrolabe", "stele", "graticule", "manuscript"] as const;
export type VisualTheme = (typeof VISUAL_THEMES)[number];

/* ------------------------------------------------------------------ content */

export const authors = sqliteTable(
  "authors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    legacyId: integer("legacy_id").unique(),
    login: text("login").unique(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    bio: text("bio").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("idx_authors_slug").on(table.slug)],
);

export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    legacyId: integer("legacy_id").unique(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    contentHtml: text("content_html").notNull().default(""),
    contentMarkdown: text("content_markdown").notNull().default(""),
    authorId: integer("author_id").references(() => authors.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft"),
    publishedAt: text("published_at"),
    visualTheme: text("visual_theme").notNull().default("auto"),
    isPinned: integer("is_pinned").notNull().default(0),
    commentsMode: text("comments_mode").notNull().default("open"),
    legacyUrl: text("legacy_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("articles_status_check", sql`status IN ('draft', 'published')`),
    index("idx_articles_status_date").on(table.status, table.publishedAt),
    index("idx_articles_author").on(table.authorId),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    legacyCategoryId: integer("legacy_category_id").unique(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    eventGroup: text("event_group").notNull().default("other"),
    summary: text("summary").notNull().default(""),
    contentHtml: text("content_html").notNull().default(""),
    contentMarkdown: text("content_markdown").notNull().default(""),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    statusOverride: text("status_override"),
    visualTheme: text("visual_theme").notNull().default("auto"),
    isFeatured: integer("is_featured").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("events_event_group_check", sql`event_group IN ('poxiao', 'other')`),
    check(
      "events_status_override_check",
      sql`status_override IN ('upcoming', 'active', 'ended') OR status_override IS NULL`,
    ),
    index("idx_events_sort").on(table.sortOrder),
  ],
);

/** 活动 ↔ 作品的多对多关系；`section_path` 是“组别 / 轮次”形式的栏目路径。 */
export const eventArticles = sqliteTable(
  "event_articles",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    groupName: text("group_name").notNull().default(""),
    stageName: text("stage_name").notNull().default(""),
    sectionPath: text("section_path").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.articleId] }),
    index("idx_event_articles_event").on(table.eventId, table.sortOrder),
  ],
);

/** 后台活动编辑器中的可视化分组；空分组也要能保存。 */
export const eventSections = sqliteTable(
  "event_sections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    pathName: text("path_name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    unique("event_sections_event_path_unique").on(table.eventId, table.pathName),
    index("idx_event_sections_event").on(table.eventId, table.sortOrder),
  ],
);

/** 评议表、成绩与活动记录等可公开下载的原始资料；文件本体存放在 Vercel Blob。 */
export const eventDocuments = sqliteTable(
  "event_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sourceRelPath: text("source_rel_path").notNull().unique(),
    displayName: text("display_name").notNull(),
    contextLabel: text("context_label").notNull().default(""),
    fileUrl: text("file_url").notNull(),
    fileSize: integer("file_size").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("idx_event_documents_event").on(table.eventId, table.sortOrder)],
);

/* ------------------------------------------------------------------- people */

/** 前台账号只能由管理员创建，站点没有公开注册入口。 */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    adminNote: text("admin_note").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    isActive: integer("is_active").notNull().default(1),
    mustChangePassword: integer("must_change_password").notNull().default(1),
    sessionVersion: integer("session_version").notNull().default(1),
    mutedUntil: text("muted_until"),
    muteReason: text("mute_reason").notNull().default(""),
    lastLoginAt: text("last_login_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("idx_users_username").on(table.username)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references((): AnySQLiteColumn => comments.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    status: text("status").notNull().default("visible"),
    isPinned: integer("is_pinned").notNull().default(0),
    editedAt: text("edited_at"),
    deletedAt: text("deleted_at"),
    deletedBy: text("deleted_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("comments_status_check", sql`status IN ('visible', 'hidden')`),
    check("comments_deleted_by_check", sql`deleted_by IN ('user', 'admin') OR deleted_by IS NULL`),
    index("idx_comments_article_status_date").on(table.articleId, table.status, table.createdAt),
    index("idx_comments_user").on(table.userId),
    index("idx_comments_parent").on(table.parentId, table.createdAt),
  ],
);

/** 登录失败记录只用于限流，不保存用户输入的密码或原始 IP。 */
export const userLoginAttempts = sqliteTable("user_login_attempts", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStarted: text("window_started").notNull(),
  blockedUntil: text("blocked_until"),
});

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    commentId: integer("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    isRead: integer("is_read").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    check("notifications_type_check", sql`type IN ('mention', 'reply')`),
    unique("notifications_user_comment_type_unique").on(table.userId, table.commentId, table.type),
    index("idx_notifications_user_read").on(table.userId, table.isRead, table.createdAt),
  ],
);

/** 管理员密码只保存 scrypt 哈希；环境变量仅用于首次初始化。 */
export const adminCredentials = sqliteTable(
  "admin_credentials",
  {
    id: integer("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    sessionVersion: integer("session_version").notNull().default(1),
    updatedAt: updatedAt(),
  },
  () => [check("admin_credentials_singleton_check", sql`id = 1`)],
);

/* ------------------------------------------------------------- ops / history */

export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: integer("target_id"),
    details: text("details").notNull().default(""),
    createdAt: createdAt(),
  },
  (table) => [index("idx_audit_date").on(table.createdAt)],
);

/** 文章、活动与活动扩展在修改或删除前保存完整快照，便于误操作后恢复。 */
export const contentRevisions = sqliteTable(
  "content_revisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    targetType: text("target_type").notNull(),
    targetId: integer("target_id").notNull(),
    action: text("action").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      "content_revisions_target_type_check",
      sql`target_type IN ('article', 'event', 'category', 'event_extension')`,
    ),
    check(
      "content_revisions_action_check",
      sql`action IN ('create', 'update', 'delete', 'update-articles')`,
    ),
    index("idx_content_revisions_target").on(table.targetType, table.targetId, table.createdAt),
  ],
);

/** 通用接口限流。key 只保存范围、用户名/IP 等信息哈希，不保存原始 IP。 */
export const requestRateLimits = sqliteTable("request_rate_limits", {
  key: text("key").primaryKey(),
  requestCount: integer("request_count").notNull().default(0),
  windowStarted: text("window_started").notNull(),
});

/** 网址别名修改后保留旧地址跳转，避免外部收藏与历史分享失效。 */
export const slugRedirects = sqliteTable(
  "slug_redirects",
  {
    kind: text("kind").notNull(),
    oldSlug: text("old_slug").notNull(),
    newSlug: text("new_slug").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.oldSlug] }),
    check("slug_redirects_kind_check", sql`kind IN ('article', 'event', 'category')`),
    index("idx_slug_redirects_target").on(table.kind, table.newSlug),
  ],
);

export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** 首页点心小游戏：全站总数包含访客，用户明细只记录已登录账号。 */
export const treatStats = sqliteTable(
  "treat_stats",
  {
    id: integer("id").primaryKey(),
    cookieEaten: integer("cookie_eaten").notNull().default(0),
    teaDrunk: integer("tea_drunk").notNull().default(0),
    cookieBroken: integer("cookie_broken").notNull().default(0),
    teaBroken: integer("tea_broken").notNull().default(0),
    updatedAt: updatedAt(),
  },
  () => [check("treat_stats_singleton_check", sql`id = 1`)],
);

export const userTreatStats = sqliteTable("user_treat_stats", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  cookieEaten: integer("cookie_eaten").notNull().default(0),
  teaDrunk: integer("tea_drunk").notNull().default(0),
  cookieBroken: integer("cookie_broken").notNull().default(0),
  teaBroken: integer("tea_broken").notNull().default(0),
  updatedAt: updatedAt(),
});

/* --------------------------------------------------------- event extensions */

/**
 * 活动扩展主表：主键与外键统一为 INTEGER（与 `events.id` 一致）。
 * `UNIQUE (event_id, kind)` 让“同一活动同一模块”只有一份当前配置，
 * 历史配置由 `content_revisions`（target_type = 'event_extension'）保留。
 */
export const eventExtensions = sqliteTable(
  "event_extensions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    version: integer("version").notNull().default(1),
    enabled: integer("enabled").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    visibility: text("visibility").notNull().default("public"),
    allowUserItems: integer("allow_user_items").notNull().default(0),
    configJson: text("config_json").notNull().default("{}"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("event_extensions_event_kind_unique").on(table.eventId, table.kind),
    check("event_extensions_enabled_check", sql`enabled IN (0, 1)`),
    check("event_extensions_visibility_check", sql`visibility IN ('public', 'member')`),
    check("event_extensions_allow_user_items_check", sql`allow_user_items IN (0, 1)`),
    index("idx_event_ext").on(table.eventId, table.enabled, table.sortOrder),
  ],
);

/** 扩展条目：晋级名单、时间线节点，以及受邀登录用户提交的互动内容。 */
export const eventExtensionItems = sqliteTable(
  "event_extension_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    extensionId: integer("extension_id")
      .notNull()
      .references(() => eventExtensions.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    itemKey: text("item_key").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("event_extension_items_extension_key_unique").on(table.extensionId, table.itemKey),
    index("idx_event_ext_items").on(table.extensionId, table.createdAt),
  ],
);

/** 20 张表的完整清单，供脚本与测试核对数量。 */
export const schemaTables = {
  authors,
  articles,
  events,
  eventArticles,
  eventSections,
  eventDocuments,
  users,
  comments,
  userLoginAttempts,
  notifications,
  adminCredentials,
  adminAuditLog,
  contentRevisions,
  requestRateLimits,
  slugRedirects,
  siteSettings,
  treatStats,
  userTreatStats,
  eventExtensions,
  eventExtensionItems,
} as const;
