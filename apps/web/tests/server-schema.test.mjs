import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const schemaSql = fs.readFileSync(path.join(appRoot, "scripts", "schema.sql"), "utf8");
const { schemaTables } = await import("../src/server/db/schema.ts");

const EXPECTED_TABLES = [
  "admin_audit_log",
  "admin_credentials",
  "articles",
  "authors",
  "comments",
  "content_revisions",
  "event_articles",
  "event_documents",
  "event_extension_items",
  "event_extensions",
  "event_sections",
  "events",
  "notifications",
  "request_rate_limits",
  "site_settings",
  "slug_redirects",
  "treat_stats",
  "user_login_attempts",
  "user_treat_stats",
  "users",
];

test("Drizzle schema declares exactly the 20 target tables", () => {
  const names = Object.values(schemaTables).map((table) => table[Symbol.for("drizzle:Name")]);
  assert.equal(names.length, 20);
  assert.deepEqual([...names].sort(), EXPECTED_TABLES);
});

test("schema.sql creates the same 20 tables and no obsolete ones", () => {
  const created = [...schemaSql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(
    (match) => match[1],
  );
  assert.equal(created.length, 20);
  assert.deepEqual([...created].sort(), EXPECTED_TABLES);

  for (const dropped of [
    "uploaded_assets",
    "media",
    "categories",
    "article_categories",
    "event_map_settings",
    "event_map_nodes",
    "event_map_node_articles",
    "event_map_relations",
    "event_map_regions",
    "event_map_snapshots",
    "pages",
    "comments_archive",
  ]) {
    assert.doesNotMatch(schemaSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${dropped}\\b`));
  }
});

test("image columns are gone and visual_theme took their place", () => {
  assert.doesNotMatch(schemaSql, /cover_url|banner_url|avatar_url/);
  const visualThemeColumns = schemaSql.match(/visual_theme\s+TEXT NOT NULL DEFAULT 'auto'/g) || [];
  assert.equal(visualThemeColumns.length, 2);
});

test("event extension tables keep INTEGER foreign keys and the required uniqueness", () => {
  const extensionTable = /CREATE TABLE IF NOT EXISTS event_extensions \(([\s\S]*?)\n\);/.exec(
    schemaSql,
  );
  assert.ok(extensionTable, "event_extensions DDL 应存在");
  const body = extensionTable[1];
  assert.match(body, /event_id\s+INTEGER NOT NULL REFERENCES events\(id\) ON DELETE CASCADE/);
  assert.match(body, /UNIQUE \(event_id, kind\)/);
  assert.match(
    body,
    /visibility\s+TEXT NOT NULL DEFAULT 'public' CHECK \(visibility IN \('public', 'member'\)\)/,
  );

  const itemTable = /CREATE TABLE IF NOT EXISTS event_extension_items \(([\s\S]*?)\n\);/.exec(
    schemaSql,
  );
  assert.ok(itemTable, "event_extension_items DDL 应存在");
  assert.match(itemTable[1], /UNIQUE \(extension_id, item_key\)/);
  assert.match(
    schemaSql,
    /content_revisions_target_type_check|target_type IN \('article', 'event', 'category', 'event_extension'\)/,
  );
});

test("schema.sql seeds the singleton treat row and every site setting default", () => {
  assert.match(schemaSql, /INSERT OR IGNORE INTO treat_stats \(id\) VALUES \(1\)/);
  for (const key of [
    "welcome_title",
    "welcome_opening",
    "welcome_about_link",
    "welcome_random_link",
    "welcome_treat_prefix",
    "welcome_cookie_button",
    "welcome_tea_button",
    "welcome_treat_suffix",
    "welcome_closing",
    "welcome_visit_prefix",
    "welcome_visit_suffix",
    "announcement_enabled",
    "announcement_title",
    "announcement_body",
    "announcement_link_label",
    "announcement_link_url",
    "site_started_on",
    "visit_count",
  ]) {
    assert.match(schemaSql, new RegExp(`\\('${key}', '`), `缺少 site_settings 默认值：${key}`);
  }
});
