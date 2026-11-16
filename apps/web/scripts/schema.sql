-- =============================================================================
-- 破晓作品档案 · 云端数据库初始化脚本（Turso / libSQL，20 张表）
--
-- 用法：
--   turso db shell <db> < apps/web/scripts/schema.sql
-- 或本地：
--   turso dev --db-file local.db
--   curl ... (通过 libSQL HTTP 执行；或 `turso db shell` 指向本地实例)
--
-- 口径：旧库 30 张表 → 删 12 张（图片/分类 4 + 地图 6 + pages/comments_archive 2）
--       + 保留 18 张核心表（去掉作者头像、作品封面、活动横幅 3 个图片列，
--       文章/活动各增 1 个 visual_theme 列）+ 新增 2 张活动扩展表 = 20 张。
--
-- 说明：SQLite 的 `CURRENT_TIMESTAMP` 一律是 UTC，时间列沿用旧库的
--       `YYYY-MM-DD HH:MM:SS` 文本格式。
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- 内容主体

CREATE TABLE IF NOT EXISTS authors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_id  INTEGER UNIQUE,
  login      TEXT UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  bio        TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS articles (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_id        INTEGER UNIQUE,
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  excerpt          TEXT NOT NULL DEFAULT '',
  content_html     TEXT NOT NULL DEFAULT '',
  content_markdown TEXT NOT NULL DEFAULT '',
  author_id        INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at     TEXT,
  visual_theme     TEXT NOT NULL DEFAULT 'auto',
  is_pinned        INTEGER NOT NULL DEFAULT 0,
  comments_mode    TEXT NOT NULL DEFAULT 'open',
  legacy_url       TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_category_id INTEGER UNIQUE,
  slug               TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  event_group        TEXT NOT NULL DEFAULT 'other' CHECK (event_group IN ('poxiao', 'other')),
  summary            TEXT NOT NULL DEFAULT '',
  content_html       TEXT NOT NULL DEFAULT '',
  content_markdown   TEXT NOT NULL DEFAULT '',
  starts_at          TEXT,
  ends_at            TEXT,
  status_override    TEXT CHECK (status_override IN ('upcoming', 'active', 'ended') OR status_override IS NULL),
  visual_theme       TEXT NOT NULL DEFAULT 'auto',
  is_featured        INTEGER NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 活动 ↔ 作品；`section_path` 是“组别 / 轮次”形式的栏目路径。
CREATE TABLE IF NOT EXISTS event_articles (
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  article_id   INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  group_name   TEXT NOT NULL DEFAULT '',
  stage_name   TEXT NOT NULL DEFAULT '',
  section_path TEXT NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, article_id)
);

-- 后台活动编辑器中的可视化分组；空分组也要能保存。
CREATE TABLE IF NOT EXISTS event_sections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  path_name  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, path_name)
);

-- 评议表、成绩与活动记录等可公开下载的原始资料。
-- `file_url` 现在是 Vercel Blob 的 https 地址；`source_rel_path` 形如 `blob/<eventId>/<pathname>`。
CREATE TABLE IF NOT EXISTS event_documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_rel_path TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  context_label   TEXT NOT NULL DEFAULT '',
  file_url        TEXT NOT NULL,
  file_size       INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------ 账号

-- 前台账号只能由管理员创建，站点没有公开注册入口。
CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name         TEXT NOT NULL,
  admin_note           TEXT NOT NULL DEFAULT '',
  password_hash        TEXT NOT NULL,
  is_active            INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  session_version      INTEGER NOT NULL DEFAULT 1,
  muted_until          TEXT,
  mute_reason          TEXT NOT NULL DEFAULT '',
  last_login_at        TEXT,
  created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES comments(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  is_pinned  INTEGER NOT NULL DEFAULT 0,
  edited_at  TEXT,
  deleted_at TEXT,
  deleted_by TEXT CHECK (deleted_by IN ('user', 'admin') OR deleted_by IS NULL),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 登录失败记录只用于限流，不保存用户输入的密码或原始 IP。
CREATE TABLE IF NOT EXISTS user_login_attempts (
  key            TEXT PRIMARY KEY,
  attempts       INTEGER NOT NULL DEFAULT 0,
  window_started TEXT NOT NULL,
  blocked_until  TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  comment_id    INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('mention', 'reply')),
  is_read       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, comment_id, type)
);

-- 管理员密码只保存 scrypt 哈希；环境变量仅用于首次初始化。
CREATE TABLE IF NOT EXISTS admin_credentials (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  username        TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------- 审计 / 历史 / 限流

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   INTEGER,
  details     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 文章、活动与活动扩展在修改或删除前保存完整快照。
-- `target_type` 在旧库基础上扩充 `'event_extension'`（`'category'` 保留以兼容旧数据）。
CREATE TABLE IF NOT EXISTS content_revisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type   TEXT NOT NULL CHECK (target_type IN ('article', 'event', 'category', 'event_extension')),
  target_id     INTEGER NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'update-articles')),
  snapshot_json TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 通用接口限流。key 只保存范围、用户名/IP 等信息哈希，不保存原始 IP。
CREATE TABLE IF NOT EXISTS request_rate_limits (
  key            TEXT PRIMARY KEY,
  request_count  INTEGER NOT NULL DEFAULT 0,
  window_started TEXT NOT NULL
);

-- 网址别名修改后保留旧地址跳转，避免外部收藏与历史分享失效。
CREATE TABLE IF NOT EXISTS slug_redirects (
  kind       TEXT NOT NULL CHECK (kind IN ('article', 'event', 'category')),
  old_slug   TEXT NOT NULL,
  new_slug   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, old_slug)
);

CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 首页点心小游戏：全站总数包含访客，用户明细只记录已登录账号。
CREATE TABLE IF NOT EXISTS treat_stats (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  cookie_eaten  INTEGER NOT NULL DEFAULT 0,
  tea_drunk     INTEGER NOT NULL DEFAULT 0,
  cookie_broken INTEGER NOT NULL DEFAULT 0,
  tea_broken    INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_treat_stats (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cookie_eaten  INTEGER NOT NULL DEFAULT 0,
  tea_drunk     INTEGER NOT NULL DEFAULT 0,
  cookie_broken INTEGER NOT NULL DEFAULT 0,
  tea_broken    INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------- 活动扩展插槽

-- 一个 `kind`（ranking / timeline / gallery / ballot …）对应一个可注册模块。
-- 主键与外键统一为 INTEGER（与 events.id 一致）；`UNIQUE (event_id, kind)`
-- 只保留当前配置，历史配置由 content_revisions 快照保护。
CREATE TABLE IF NOT EXISTS event_extensions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1,
  enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  visibility       TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'member')),
  allow_user_items INTEGER NOT NULL DEFAULT 0 CHECK (allow_user_items IN (0, 1)),
  config_json      TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, kind)
);

-- 扩展条目：晋级名单、时间线节点，以及受邀登录用户提交的互动内容。
-- 用户条目的 `item_key` 固定为 `u<userId>`，`user_id` 记录作者。
CREATE TABLE IF NOT EXISTS event_extension_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  extension_id INTEGER NOT NULL REFERENCES event_extensions(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  item_key     TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (extension_id, item_key)
);

-- ------------------------------------------------------------------ 索引

CREATE INDEX IF NOT EXISTS idx_articles_status_date ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_author ON articles(author_id);
CREATE INDEX IF NOT EXISTS idx_events_sort ON events(sort_order);
CREATE INDEX IF NOT EXISTS idx_event_articles_event ON event_articles(event_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_event_sections_event ON event_sections(event_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_event_documents_event ON event_documents(event_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_comments_article_status_date ON comments(article_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_date ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_revisions_target ON content_revisions(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_slug_redirects_target ON slug_redirects(kind, new_slug);
CREATE INDEX IF NOT EXISTS idx_event_ext ON event_extensions (event_id, enabled, sort_order);
CREATE INDEX IF NOT EXISTS idx_event_ext_items ON event_extension_items (extension_id, created_at);

-- ------------------------------------------------------------------ 种子

INSERT OR IGNORE INTO treat_stats (id) VALUES (1);

-- 与 `src/server/lib/site-settings.ts` 的 `siteSettingDefaults` 完全一致。
INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('welcome_title', '欢迎！！！'),
  ('welcome_opening', '欢迎来到破晓！'),
  ('welcome_about_link', '想知道什么是破晓？'),
  ('welcome_random_link', '想随便看看？'),
  ('welcome_treat_prefix', '或是想'),
  ('welcome_cookie_button', '来块饼干'),
  ('welcome_tea_button', '来杯红茶'),
  ('welcome_treat_suffix', '？'),
  ('welcome_closing', '希望你能在这里享受宁静的片刻。玩得愉快！'),
  ('welcome_visit_prefix', '（顺带一提，这是第 '),
  ('welcome_visit_suffix', ' 次访问。少得可怜呢……）'),
  ('announcement_enabled', '1'),
  ('announcement_title', '站内公告'),
  ('announcement_body', '第一届破晓活动资料已经整理上线。'),
  ('announcement_link_label', '查看第一届破晓'),
  ('announcement_link_url', '/events/first-poxiao'),
  ('site_started_on', '2026-09-03'),
  ('visit_count', '0');
