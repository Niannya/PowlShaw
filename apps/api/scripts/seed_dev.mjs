#!/usr/bin/env node
/**
 * Development-only seed data for the extracted frontend smoke test.
 *
 * Run it against an already-migrated SQLite database:
 *   DATABASE_PATH=data/seed.db (plus a 32+ character SESSION_SECRET)
 *     pnpm --filter @powlshaw/api dev
 *   DATABASE_PATH=data/seed.db pnpm --filter @powlshaw/api seed:dev
 *
 * The script refuses to run when NODE_ENV=production and never touches a
 * database unless DATABASE_PATH points at a file containing "seed" or "dev".
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

if (process.env.NODE_ENV === "production") {
  throw new Error("seed_dev.mjs must not run in production.");
}

const configured = process.env.DATABASE_PATH || "data/seed.db";
if (!/(seed|dev)/i.test(configured)) {
  throw new Error(
    `Refusing to overwrite ${configured}: point DATABASE_PATH at a *seed* or *dev* database.`,
  );
}

const filename = path.resolve(process.cwd(), configured);
if (!fs.existsSync(filename)) {
  throw new Error(
    `Database not found: ${filename}. Start the API once so the schema is created, then re-run.`,
  );
}

function passwordHash(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${crypto
    .scryptSync(password, salt, 64)
    .toString("base64url")}`;
}

const db = new Database(filename);
db.exec("PRAGMA foreign_keys = ON;");

const articleHtml = (title, body) =>
  `<h2>${title}</h2><p>${body}</p><ul><li>烟雾测试段落一</li><li>烟雾测试段落二</li></ul>`;

const mapImage = {
  image_url: "/assets/events/the-legends-of-countries/map-final.png",
  image_alt: "列国纪测试地图",
  image_width: 1844,
  image_height: 853,
};

const nodeA = {
  name: "北境",
  description: "测试节点甲",
  notes: "",
  x: 0.32,
  y: 0.24,
  article_ids: [3],
};
const nodeB = {
  name: "南港",
  description: "测试节点乙",
  notes: "",
  x: 0.61,
  y: 0.72,
  article_ids: [],
};
const region = {
  name: "中部平原",
  description: "测试区域",
  notes: "",
  color: "#b56d3a",
  points: [
    { x: 0.4, y: 0.4 },
    { x: 0.55, y: 0.44 },
    { x: 0.5, y: 0.58 },
  ],
};
const seedNodes = [
  { ...nodeA, id: 1, event_id: 2, user_id: 1, owner_name: "烟雾测试用户" },
  { ...nodeB, id: 2, event_id: 2, user_id: 1, owner_name: "烟雾测试用户" },
];
const seedRegions = [{ ...region, id: 1, event_id: 2, user_id: 1, owner_name: "烟雾测试用户" }];
const seedRelations = [
  {
    id: 1,
    event_id: 2,
    user_id: 1,
    source_node_id: 1,
    target_node_id: 2,
    name: "商路",
    description: "测试关系",
    notes: "",
    owner_name: "烟雾测试用户",
    source_name: "北境",
    target_name: "南港",
  },
];

db.transaction(() => {
  // Keep the seed deterministic; this is a disposable dev database.
  for (const table of [
    "notifications",
    "comments",
    "event_map_node_articles",
    "event_map_relations",
    "event_map_regions",
    "event_map_nodes",
    "event_map_snapshots",
    "event_map_settings",
    "event_documents",
    "event_sections",
    "event_articles",
    "articles",
    "events",
    "users",
    "admin_audit_log",
    "content_revisions",
    "slug_redirects",
    "site_settings",
    "treat_stats",
    "uploaded_assets",
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }

  db.prepare(
    `INSERT INTO users(id, username, display_name, password_hash, must_change_password, is_active)
     VALUES (1, 'smokeuser', '烟雾测试用户', ?, 0, 1)`,
  ).run(passwordHash("smoke-password"));

  const insertEvent = db.prepare(
    `INSERT INTO events(id, slug, title, event_group, summary, content_html, starts_at, ends_at,
                        is_featured, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertEvent.run(
    1,
    "first-poxiao",
    "第一届破晓",
    "poxiao",
    "用于前端冒烟测试的活动。",
    "<p>活动介绍正文。</p>",
    "2026-01-01 00:00:00",
    "2026-03-31 23:59:59",
    1,
    0,
  );
  insertEvent.run(
    2,
    "the-legends-of-countries",
    "列国纪",
    "other",
    "带世界地图的测试活动。",
    "<p>列国纪活动介绍。</p>",
    "2026-02-01 00:00:00",
    "2026-12-31 23:59:59",
    0,
    1,
  );

  const insertArticle = db.prepare(
    `INSERT INTO articles(id, slug, title, excerpt, content_html, content_markdown, status,
                          published_at, cover_url, is_pinned, comments_mode)
     VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, 'open')`,
  );
  insertArticle.run(
    1,
    "smoke-one",
    "烟雾测试文章一",
    "这是第一篇测试文章的摘要。",
    articleHtml("第一篇", "正文包含 <strong>加粗</strong> 与链接。"),
    "# 第一篇",
    "2026-09-01 00:00:00",
    null,
    1,
  );
  insertArticle.run(
    2,
    "smoke-two",
    "烟雾测试文章二",
    "这是第二篇测试文章的摘要。",
    articleHtml("第二篇", "用于搜索关键词：破晓与列国。"),
    "# 第二篇",
    "2026-09-02 00:00:00",
    null,
    0,
  );
  insertArticle.run(
    3,
    "smoke-three",
    "烟雾测试文章三",
    "这是第三篇测试文章的摘要。",
    articleHtml("第三篇", "关联地图节点。"),
    "# 第三篇",
    "2026-09-03 00:00:00",
    null,
    0,
  );

  const insertEventArticle = db.prepare(
    `INSERT INTO event_articles(event_id, article_id, section_path, sort_order)
     VALUES (?, ?, ?, ?)`,
  );
  insertEventArticle.run(1, 1, "甲组", 0);
  insertEventArticle.run(1, 2, "甲组", 1);
  insertEventArticle.run(2, 3, "国家", 0);

  db.prepare(
    `INSERT INTO event_sections(event_id, path_name, sort_order) VALUES (1, '甲组', 0)`,
  ).run();
  db.prepare(
    `INSERT INTO event_sections(event_id, path_name, sort_order) VALUES (2, '国家', 0)`,
  ).run();

  db.prepare(
    `INSERT INTO event_documents(event_id, source_rel_path, display_name, context_label, file_url, file_size, sort_order)
     VALUES (1, 'seed/test.txt', '测试资料.txt', '评议资料', '/uploads/events/documents/admin/1/test.txt', 128, 0)`,
  ).run();

  db.prepare(
    `INSERT INTO event_map_settings(event_id, is_enabled, map_title, map_description, image_url,
       image_alt, image_width, image_height, hero_kicker, map_eyebrow, map_section_title,
       introduction_eyebrow, introduction_title, works_eyebrow, works_title)
     VALUES (2, 1, '列国纪世界地图', '测试地图说明', ?, ?, ?, ?, 'KICKER', '地图眉题',
             '当前世界地图', '介绍眉题', '活动介绍', '作品眉题', '参与作品')`,
  ).run(mapImage.image_url, mapImage.image_alt, mapImage.image_width, mapImage.image_height);

  const insertNode = db.prepare(
    `INSERT INTO event_map_nodes(id, event_id, user_id, name, description, notes, x, y)
     VALUES (?, 2, 1, ?, ?, ?, ?, ?)`,
  );
  insertNode.run(1, nodeA.name, nodeA.description, nodeA.notes, nodeA.x, nodeA.y);
  insertNode.run(2, nodeB.name, nodeB.description, nodeB.notes, nodeB.x, nodeB.y);
  db.prepare(
    `INSERT INTO event_map_node_articles(node_id, article_id, sort_order) VALUES (1, 3, 0)`,
  ).run();
  db.prepare(
    `INSERT INTO event_map_regions(id, event_id, user_id, name, description, notes, color, points_json)
     VALUES (1, 2, 1, ?, ?, ?, ?, ?)`,
  ).run(region.name, region.description, region.notes, region.color, JSON.stringify(region.points));
  db.prepare(
    `INSERT INTO event_map_relations(id, event_id, user_id, source_node_id, target_node_id, name, description, notes)
     VALUES (1, 2, 1, 1, 2, ?, ?, ?)`,
  ).run(seedRelations[0].name, seedRelations[0].description, seedRelations[0].notes);

  const snapshotPayload = {
    version: 1,
    map: mapImage,
    nodes: seedNodes,
    regions: seedRegions,
    relations: seedRelations,
  };
  db.prepare(
    `INSERT INTO event_map_snapshots(event_id, snapshot_date, title, description, snapshot_json)
     VALUES (2, '2026-09-30', '九月世界', '测试快照', ?)`,
  ).run(JSON.stringify(snapshotPayload));

  db.prepare(
    `INSERT INTO comments(id, article_id, user_id, parent_id, content, status, is_pinned)
     VALUES (1, 1, 1, NULL, '第一条测试评论。', 'visible', 0)`,
  ).run();
  db.prepare(
    `INSERT INTO comments(id, article_id, user_id, parent_id, content, status, is_pinned)
     VALUES (2, 1, 1, 1, '测试回复。', 'visible', 0)`,
  ).run();
  db.prepare(
    `INSERT INTO notifications(user_id, actor_user_id, comment_id, type, is_read)
     VALUES (1, 1, 2, 'reply', 0)`,
  ).run();

  db.prepare(`INSERT INTO site_settings(key, value) VALUES ('visit_count', '5')`).run();
  db.prepare(
    `INSERT INTO site_settings(key, value) VALUES ('site_started_on', '2026-09-03')`,
  ).run();
  db.prepare(
    `INSERT INTO site_settings(key, value) VALUES ('announcement_body', '前端剥离后的冒烟测试公告。')`,
  ).run();
  db.prepare(
    `INSERT INTO treat_stats(id, cookie_eaten, tea_drunk, cookie_broken, tea_broken)
     VALUES (1, 3, 2, 1, 0)`,
  ).run();

  db.prepare(
    `INSERT INTO admin_audit_log(action, target_type, target_id, details)
     VALUES ('seed', 'system', NULL, 'development seed')`,
  ).run();
  db.prepare(
    `INSERT INTO content_revisions(target_type, target_id, action, snapshot_json)
     VALUES ('article', 1, 'create', '{}')`,
  ).run();

  db.prepare(
    `INSERT INTO slug_redirects(kind, old_slug, new_slug) VALUES ('article', 'old-smoke', 'smoke-one')`,
  ).run();
})();

db.close();

const documentPath = path.resolve(
  process.cwd(),
  "public/uploads/events/documents/admin/1/test.txt",
);
fs.mkdirSync(path.dirname(documentPath), { recursive: true });
fs.writeFileSync(documentPath, "PowlShaw frontend extraction smoke document.\n");

console.log(`Seeded ${filename}`);
