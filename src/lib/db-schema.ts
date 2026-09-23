import type Database from "better-sqlite3";

export function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id INTEGER UNIQUE,
      login TEXT UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 旧文章分类表仅为兼容现有数据库和历史导入保留；站点不再提供分类功能。
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id INTEGER UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id INTEGER UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      content_markdown TEXT NOT NULL DEFAULT '',
      author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      published_at TEXT,
      cover_url TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      comments_mode TEXT NOT NULL DEFAULT 'open',
      legacy_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS article_categories (
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (article_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_category_id INTEGER UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      event_group TEXT NOT NULL DEFAULT 'other' CHECK (event_group IN ('poxiao', 'other')),
      summary TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      content_markdown TEXT NOT NULL DEFAULT '',
      starts_at TEXT,
      ends_at TEXT,
      status_override TEXT CHECK (status_override IN ('upcoming', 'active', 'ended') OR status_override IS NULL),
      banner_url TEXT,
      is_featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_articles (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      group_name TEXT NOT NULL DEFAULT '',
      stage_name TEXT NOT NULL DEFAULT '',
      section_path TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (event_id, article_id)
    );

    -- 后台活动编辑器中的可视化分组。分组与文章分开保存，因此空分组也不会丢失。
    CREATE TABLE IF NOT EXISTS event_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      path_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (event_id, path_name)
    );

    -- 评议表、成绩及活动记录等可公开下载的原始资料；作品原稿不放在这里。
    CREATE TABLE IF NOT EXISTS event_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      source_rel_path TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      context_label TEXT NOT NULL DEFAULT '',
      file_url TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- 专题活动的大图地图和页面文案。当前用于“列国纪”，按活动保存以便后台维护。
    CREATE TABLE IF NOT EXISTS event_map_settings (
      event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
      map_title TEXT NOT NULL DEFAULT '',
      map_description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      image_alt TEXT NOT NULL DEFAULT '',
      image_width INTEGER NOT NULL DEFAULT 1,
      image_height INTEGER NOT NULL DEFAULT 1,
      hero_kicker TEXT NOT NULL DEFAULT '',
      map_eyebrow TEXT NOT NULL DEFAULT '',
      map_section_title TEXT NOT NULL DEFAULT '',
      introduction_eyebrow TEXT NOT NULL DEFAULT '',
      introduction_title TEXT NOT NULL DEFAULT '',
      works_eyebrow TEXT NOT NULL DEFAULT '',
      works_title TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 共创地图上的抽象节点。位置使用 0—1 的相对坐标，用户只能修改自己创建的节点。
    CREATE TABLE IF NOT EXISTS event_map_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
      y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 节点可以选择性关联多篇已公开文章；顺序按用户选择次序保存。
    CREATE TABLE IF NOT EXISTS event_map_node_articles (
      node_id INTEGER NOT NULL REFERENCES event_map_nodes(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (node_id, article_id)
    );

    -- 节点之间的抽象关系。关系是独立的用户内容，不代表地图上的真实路线。
    CREATE TABLE IF NOT EXISTS event_map_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_node_id INTEGER NOT NULL REFERENCES event_map_nodes(id) ON DELETE CASCADE,
      target_node_id INTEGER NOT NULL REFERENCES event_map_nodes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (source_node_id <> target_node_id)
    );

    -- 用户在地图上圈选的抽象区域。顶点同样使用 0—1 相对坐标，颜色只影响公开展示。
    CREATE TABLE IF NOT EXISTS event_map_regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#b56d3a',
      points_json TEXT NOT NULL,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id INTEGER UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content_html TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id INTEGER UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL,
      local_url TEXT,
      mime_type TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comments_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id INTEGER UNIQUE,
      article_legacy_id INTEGER,
      author_name TEXT,
      content TEXT,
      created_at TEXT,
      approved INTEGER NOT NULL DEFAULT 0
    );

    -- 前台账号只能由管理员创建。网站没有公开注册入口。
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      admin_note TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      session_version INTEGER NOT NULL DEFAULT 1,
      muted_until TEXT,
      mute_reason TEXT NOT NULL DEFAULT '',
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
      is_pinned INTEGER NOT NULL DEFAULT 0,
      edited_at TEXT,
      deleted_at TEXT,
      deleted_by TEXT CHECK (deleted_by IN ('user', 'admin') OR deleted_by IS NULL),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 登录失败记录只用于限流，不保存用户输入的密码或原始 IP。
    CREATE TABLE IF NOT EXISTS user_login_attempts (
      key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      window_started TEXT NOT NULL,
      blocked_until TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('mention', 'reply')),
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, comment_id, type)
    );

    -- 后台管理员密码只保存 scrypt 哈希。环境变量仅在首次初始化时作为初始密码。
    CREATE TABLE IF NOT EXISTS admin_credentials (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 文章、活动和历史分类记录在修改或删除前保存完整快照，便于误操作后恢复。
    CREATE TABLE IF NOT EXISTS content_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL CHECK (target_type IN ('article', 'event', 'category')),
      target_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'update-articles')),
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 通用接口限流。key 只保存范围、用户名/IP 等信息的哈希，不保存原始 IP。
    CREATE TABLE IF NOT EXISTS request_rate_limits (
      key TEXT PRIMARY KEY,
      request_count INTEGER NOT NULL DEFAULT 0,
      window_started TEXT NOT NULL
    );

    -- 记录后台新上传的文件，用于回收没有被文章或活动引用的临时附件。
    CREATE TABLE IF NOT EXISTS uploaded_assets (
      file_url TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      claimed_at TEXT
    );

    -- 网址别名修改后保留旧地址跳转，避免外部收藏和历史分享失效。
    CREATE TABLE IF NOT EXISTS slug_redirects (
      kind TEXT NOT NULL CHECK (kind IN ('article', 'event', 'category')),
      old_slug TEXT NOT NULL,
      new_slug TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (kind, old_slug)
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 首页点心小游戏：全站总数包含访客，用户明细只记录已登录账号。
    CREATE TABLE IF NOT EXISTS treat_stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cookie_eaten INTEGER NOT NULL DEFAULT 0,
      tea_drunk INTEGER NOT NULL DEFAULT 0,
      cookie_broken INTEGER NOT NULL DEFAULT 0,
      tea_broken INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_treat_stats (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cookie_eaten INTEGER NOT NULL DEFAULT 0,
      tea_drunk INTEGER NOT NULL DEFAULT 0,
      cookie_broken INTEGER NOT NULL DEFAULT 0,
      tea_broken INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_articles_status_date ON articles(status, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_author ON articles(author_id);
    CREATE INDEX IF NOT EXISTS idx_event_articles_event ON event_articles(event_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_event_sections_event ON event_sections(event_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_event_documents_event ON event_documents(event_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_event_map_nodes_event
      ON event_map_nodes(event_id, deleted_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_event_map_nodes_user ON event_map_nodes(user_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_event_map_node_articles_article
      ON event_map_node_articles(article_id, node_id);
    CREATE INDEX IF NOT EXISTS idx_event_map_relations_event
      ON event_map_relations(event_id, deleted_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_event_map_relations_user
      ON event_map_relations(user_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_event_map_relations_nodes
      ON event_map_relations(source_node_id, target_node_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_event_map_regions_event
      ON event_map_regions(event_id, deleted_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_event_map_regions_user
      ON event_map_regions(user_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_comments_article_status_date
      ON comments(article_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
  `);

  db.prepare("INSERT OR IGNORE INTO treat_stats(id) VALUES (1)").run();

  // 保留“列国纪”现有专题页和地图；之后的修改全部通过后台保存到这张表。
  db.prepare(
    `INSERT OR IGNORE INTO event_map_settings(
       event_id, is_enabled, map_title, map_description,
       image_url, image_alt, image_width, image_height,
       hero_kicker, map_eyebrow, map_section_title,
       introduction_eyebrow, introduction_title, works_eyebrow, works_title
     )
     SELECT id, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     FROM events WHERE slug=?`,
  ).run(
    "列国纪世界地图",
    "浏览列国纪共创世界的当前地图。",
    "/assets/events/the-legends-of-countries/map-final.png",
    "列国纪架空世界地图",
    1844,
    853,
    "A COLLABORATIVE WORLD · 共创世界活动",
    "THE WORLD AS IT STANDS",
    "当前世界地图",
    "ABOUT THE PROJECT",
    "活动介绍",
    "STORIES FROM THIS WORLD",
    "参与作品",
    "the-legends-of-countries",
  );

  // CREATE TABLE IF NOT EXISTS 不会给已有表增加新字段，因此小型增量迁移写在这里。
  ensureColumn(db, "articles", "comments_mode", "TEXT NOT NULL DEFAULT 'open'");
  ensureColumn(db, "articles", "content_markdown", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "events", "content_markdown", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "users", "admin_note", "TEXT NOT NULL DEFAULT ''");
  // 旧账号不强制改密；只有此功能上线后新建或被管理员重设密码的账号才强制修改。
  ensureColumn(db, "users", "must_change_password", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "users", "session_version", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "users", "muted_until", "TEXT");
  ensureColumn(db, "users", "mute_reason", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "users", "last_login_at", "TEXT");
  // 活动作品可以按“组别 → 轮次”分层展示；留空时仍兼容普通作品列表。
  ensureColumn(db, "event_articles", "group_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "event_articles", "stage_name", "TEXT NOT NULL DEFAULT ''");
  // 栏目路径不限定层级，例如“科幻组 / 第一轮”或只有“友谊赛”；留空即平铺。
  ensureColumn(db, "event_articles", "section_path", "TEXT NOT NULL DEFAULT ''");
  // 首次启用可视化分组时，从旧的栏目路径中建立分组；INSERT OR IGNORE 让迁移可重复执行。
  db.exec(`
    INSERT OR IGNORE INTO event_sections(event_id, path_name, sort_order)
    SELECT event_id, TRIM(section_path), MIN(sort_order)
    FROM event_articles
    WHERE TRIM(section_path) <> ''
    GROUP BY event_id, TRIM(section_path)
  `);
  const addedEventGroup = ensureColumn(
    db,
    "events",
    "event_group",
    "TEXT NOT NULL DEFAULT 'other' CHECK (event_group IN ('poxiao', 'other'))",
  );
  if (addedEventGroup) {
    // 已导入的历届破晓都有稳定的 *-poxiao 别名；只在首次迁移时设置类型，不覆盖后台修改。
    db.prepare("UPDATE events SET event_group='poxiao' WHERE slug GLOB '*-poxiao'").run();
  }
  const addedEventOrder = ensureColumn(db, "events", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  if (addedEventOrder) {
    const rows = db
      .prepare(
        `SELECT id FROM events
         ORDER BY is_featured DESC, COALESCE(starts_at, created_at) DESC, id DESC`,
      )
      .all() as { id: number }[];
    const setOrder = db.prepare("UPDATE events SET sort_order=? WHERE id=?");
    db.transaction(() => rows.forEach((row, index) => setOrder.run(index * 10, row.id)))();
  }
  ensureColumn(db, "comments", "parent_id", "INTEGER REFERENCES comments(id) ON DELETE SET NULL");
  ensureColumn(db, "comments", "is_pinned", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "comments", "edited_at", "TEXT");
  ensureColumn(db, "comments", "deleted_at", "TEXT");
  ensureColumn(
    db,
    "comments",
    "deleted_by",
    "TEXT CHECK (deleted_by IN ('user', 'admin') OR deleted_by IS NULL)",
  );
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read
      ON notifications(user_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_date ON admin_audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_revisions_target
      ON content_revisions(target_type, target_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_uploaded_assets_created
      ON uploaded_assets(created_at);
    CREATE INDEX IF NOT EXISTS idx_slug_redirects_target
      ON slug_redirects(kind, new_slug);
  `);

  const defaults = [
    ["site_name", "破晓"],
    ["site_tagline", "一个安静的写作与作品档案站"],
    ["welcome_text", "欢迎来到破晓。这里保存我们写下的故事，以及它们曾经发生的时刻。"],
    ["welcome_title", "欢迎！！！"],
    ["welcome_opening", "欢迎来到破晓！"],
    ["welcome_about_link", "想知道什么是破晓？"],
    ["welcome_random_link", "想随便看看？"],
    ["welcome_treat_prefix", "或是想"],
    ["welcome_cookie_button", "来块饼干"],
    ["welcome_tea_button", "来杯红茶"],
    ["welcome_treat_suffix", "？"],
    ["welcome_closing", "希望你能在这里享受宁静的片刻。玩得愉快！"],
    ["welcome_visit_prefix", "（顺带一提，这是第 "],
    ["welcome_visit_suffix", " 次访问。少得可怜呢……）"],
    ["announcement_enabled", "1"],
    ["announcement_title", "站内公告"],
    ["announcement_body", "第一届破晓活动资料已经整理上线。"],
    ["announcement_link_label", "查看第一届破晓"],
    ["announcement_link_url", "/events/first-poxiao"],
    ["site_started_on", "2026-09-03"],
    ["visit_count", "0"],
  ];
  const insert = db.prepare("INSERT OR IGNORE INTO site_settings(key, value) VALUES (?, ?)");
  for (const row of defaults) insert.run(...row);
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }
  return false;
}
