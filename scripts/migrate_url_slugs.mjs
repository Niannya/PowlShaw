import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const execute = process.argv.includes("--execute");
const root = process.cwd();

function readLocalEnv() {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

const env = readLocalEnv();
const databaseFile = path.resolve(
  root,
  process.env.DATABASE_PATH || env.DATABASE_PATH || "data/poxiao.db",
);
const db = new Database(databaseFile);
db.pragma("foreign_keys = ON");

const poxiaoNumbers = new Map([
  ["第一届", "01"],
  ["第二届", "02"],
  ["第三届", "03"],
  ["第四届", "04"],
  ["第五届", "05"],
  ["第六届", "06"],
  ["第七届", "07"],
  ["第八届", "08"],
  ["第九届", "09"],
]);

function standardizedEventSlug(event) {
  if (event.event_group === "poxiao") {
    const matched = [...poxiaoNumbers].find(([label]) => event.title.includes(label));
    if (!matched) throw new Error(`无法识别破晓届数：${event.title}`);
    return `poxiao-${matched[1]}`;
  }
  const year = event.title.match(/(?:19|20)\d{2}/)?.[0];
  if (year && event.title.includes("夏")) return `summer-${year}`;
  if (year && event.title.includes("冬")) return `winter-${year}`;
  return event.slug;
}

const events = db
  .prepare("SELECT id, title, slug, event_group FROM events ORDER BY sort_order, id")
  .all();
const eventPlans = events.map((event) => ({ ...event, new_slug: standardizedEventSlug(event) }));
const articlePlans = [];

for (const event of eventPlans) {
  const articles = db
    .prepare(
      `SELECT a.id, a.title, a.slug
       FROM event_articles ea
       JOIN articles a ON a.id=ea.article_id
       WHERE ea.event_id=?
       ORDER BY ea.sort_order, a.published_at DESC, a.id DESC`,
    )
    .all(event.id);
  articles.forEach((article, index) => {
    articlePlans.push({
      ...article,
      event_id: event.id,
      event_title: event.title,
      new_slug: `${event.new_slug}-${String(index + 1).padStart(2, "0")}`,
    });
  });
}

const articleCount = db.prepare("SELECT COUNT(*) AS count FROM articles").get().count;
if (articlePlans.length !== articleCount) {
  throw new Error(
    `文章关联不完整：数据库 ${articleCount} 篇，活动目录中 ${articlePlans.length} 篇。`,
  );
}
if (new Set(articlePlans.map((item) => item.id)).size !== articleCount) {
  throw new Error("存在未归入活动或同时归入多个活动的文章，不能安全编号。");
}
for (const [label, values] of [
  ["活动", eventPlans.map((item) => item.new_slug)],
  ["文章", articlePlans.map((item) => item.new_slug)],
]) {
  if (new Set(values).size !== values.length) throw new Error(`${label}新网址发生重复。`);
  if (values.some((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) {
    throw new Error(`${label}新网址包含不符合规范的字符。`);
  }
}

const changedEvents = eventPlans.filter((item) => item.slug !== item.new_slug);
const changedArticles = articlePlans.filter((item) => item.slug !== item.new_slug);
const report = {
  generated_at: new Date().toISOString(),
  rule: "活动别名 + 两位文章编号",
  event_changes: changedEvents.map(({ id, title, slug, new_slug }) => ({
    id,
    title,
    old_slug: slug,
    new_slug,
  })),
  article_changes: changedArticles.map(({ id, title, event_title, slug, new_slug }) => ({
    id,
    title,
    event_title,
    old_slug: slug,
    new_slug,
  })),
};

console.log(`活动：${events.length} 个，其中 ${changedEvents.length} 个需要改名。`);
console.log(`文章：${articlePlans.length} 篇，其中 ${changedArticles.length} 篇需要改名。`);
for (const event of eventPlans) {
  const count = articlePlans.filter((article) => article.event_id === event.id).length;
  console.log(`${event.slug} -> ${event.new_slug}（${count} 篇）`);
}

if (!execute) {
  console.log("当前仅预览；确认后添加 --execute 执行。 ");
  db.close();
  process.exit(0);
}

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "")
  .replace("T", "-");
const backupDirectory = path.join(path.dirname(databaseFile), "backups");
fs.mkdirSync(backupDirectory, { recursive: true });
const backupFile = path.join(backupDirectory, `poxiao-before-slug-migration-${timestamp}.db`);
await db.backup(backupFile);

db.exec(`
  CREATE TABLE IF NOT EXISTS slug_redirects (
    kind TEXT NOT NULL CHECK (kind IN ('article', 'event', 'category')),
    old_slug TEXT NOT NULL,
    new_slug TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (kind, old_slug)
  );
`);

const insertRedirect = db.prepare(
  `INSERT INTO slug_redirects(kind, old_slug, new_slug)
   VALUES (?, ?, ?)
   ON CONFLICT(kind, old_slug) DO UPDATE SET new_slug=excluded.new_slug`,
);
const updateEvent = db.prepare("UPDATE events SET slug=?, updated_at=CURRENT_TIMESTAMP WHERE id=?");
const updateArticle = db.prepare(
  "UPDATE articles SET slug=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
);
const insertRevision = db.prepare(
  `INSERT INTO content_revisions(target_type, target_id, action, snapshot_json)
   VALUES (?, ?, 'update', ?)`,
);

function replaceKnownPaths(text) {
  let result = String(text || "");
  for (const item of [...changedArticles].sort(
    (left, right) => right.slug.length - left.slug.length,
  )) {
    result = result.replaceAll(`/articles/${item.slug}`, `/articles/${item.new_slug}`);
  }
  for (const item of [...changedEvents].sort(
    (left, right) => right.slug.length - left.slug.length,
  )) {
    result = result.replaceAll(`/events/${item.slug}`, `/events/${item.new_slug}`);
  }
  return result;
}

db.transaction(() => {
  changedEvents.forEach((item) => updateEvent.run(`slug-migration-event-${item.id}`, item.id));
  changedArticles.forEach((item) =>
    updateArticle.run(`slug-migration-article-${item.id}`, item.id),
  );

  changedEvents.forEach((item) => {
    updateEvent.run(item.new_slug, item.id);
    insertRedirect.run("event", item.slug, item.new_slug);
    insertRevision.run("event", item.id, JSON.stringify({ slug: item.slug }));
  });
  changedArticles.forEach((item) => {
    updateArticle.run(item.new_slug, item.id);
    insertRedirect.run("article", item.slug, item.new_slug);
    insertRevision.run("article", item.id, JSON.stringify({ slug: item.slug }));
  });

  const contentRows = db
    .prepare(
      `SELECT id, content_html, content_markdown FROM articles
       WHERE instr(content_html, '/articles/')>0 OR instr(content_html, '/events/')>0
          OR instr(content_markdown, '/articles/')>0 OR instr(content_markdown, '/events/')>0`,
    )
    .all();
  const saveContent = db.prepare(
    "UPDATE articles SET content_html=?, content_markdown=? WHERE id=?",
  );
  contentRows.forEach((row) =>
    saveContent.run(
      replaceKnownPaths(row.content_html),
      replaceKnownPaths(row.content_markdown),
      row.id,
    ),
  );

  const eventContentRows = db
    .prepare(
      `SELECT id, content_html, content_markdown FROM events
       WHERE instr(content_html, '/articles/')>0 OR instr(content_html, '/events/')>0
          OR instr(content_markdown, '/articles/')>0 OR instr(content_markdown, '/events/')>0`,
    )
    .all();
  const saveEventContent = db.prepare(
    "UPDATE events SET content_html=?, content_markdown=? WHERE id=?",
  );
  eventContentRows.forEach((row) =>
    saveEventContent.run(
      replaceKnownPaths(row.content_html),
      replaceKnownPaths(row.content_markdown),
      row.id,
    ),
  );

  const settings = db.prepare("SELECT key, value FROM site_settings").all();
  const saveSetting = db.prepare("UPDATE site_settings SET value=? WHERE key=?");
  settings.forEach((setting) => {
    const value = replaceKnownPaths(setting.value);
    if (value !== setting.value) saveSetting.run(value, setting.key);
  });

  db.prepare(
    `INSERT INTO admin_audit_log(action, target_type, details)
     VALUES ('bulk-slug-migration', 'site', ?)`,
  ).run(
    JSON.stringify({
      event_changes: changedEvents.length,
      article_changes: changedArticles.length,
      backup: path.basename(backupFile),
    }),
  );
})();

const reportFile = path.join(path.dirname(databaseFile), "slug-migration-report.json");
fs.writeFileSync(
  reportFile,
  `${JSON.stringify({ ...report, backup_file: backupFile }, null, 2)}\n`,
);
console.log(`完成。备份：${backupFile}`);
console.log(`报告：${reportFile}`);
db.close();
