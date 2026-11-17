#!/usr/bin/env node
/**
 * 把 `migrate_sqlite_to_turso.py` 导出的 SQL 导入 Turso / libSQL。
 *
 * 用法（在 apps/web 下执行，依赖 `.env.local`）：
 *   node --env-file-if-exists=.env.local scripts/import_turso_dump.mjs \
 *     --file ../../build/powlshaw_turso.sql --reset
 *
 * `--reset` 会删除当前库中本项目的 20 张表再导入；没有该参数时，只要库里有数据
 * 就会拒绝执行。整个导入在一个事务里完成，失败会回滚，不会留下半个库。
 *
 * 为什么不用 `turso db shell`：Windows 上 Turso CLI 安装不便；`@libsql/client/web`
 * 可以走 HTTPS 直接执行。脚本会关闭 `sqlite_sequence` / `PRAGMA` 语句，
 * 并用 `defer_foreign_keys` 让 dump 的字母序 INSERT 也能通过外键检查。
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client/web";
import { splitSqlStatements } from "./sql-split.mjs";

const args = process.argv.slice(2);
function argValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const file = argValue("--file");
const reset = args.includes("--reset");
if (!file) {
  console.error("用法: node scripts/import_turso_dump.mjs --file <dump.sql> [--reset]");
  process.exit(1);
}
const url = process.env.TURSO_DATABASE_URL?.trim();
if (!url) {
  console.error("缺少 TURSO_DATABASE_URL；请确认 apps/web/.env.local 已配置。");
  process.exit(1);
}

const TABLES = [
  "event_extension_items",
  "event_extensions",
  "event_documents",
  "event_articles",
  "event_sections",
  "notifications",
  "comments",
  "user_treat_stats",
  "content_revisions",
  "admin_audit_log",
  "articles",
  "events",
  "authors",
  "users",
  "admin_credentials",
  "request_rate_limits",
  "user_login_attempts",
  "slug_redirects",
  "site_settings",
  "treat_stats",
];

const source = await readFile(file, "utf8");
const allStatements = splitSqlStatements(source);
const creates = [];
const indexes = [];
const inserts = [];
for (const statement of allStatements) {
  const head = statement.trimStart().slice(0, 40).toUpperCase();
  if (head.startsWith("PRAGMA") || head.startsWith("BEGIN") || head.startsWith("COMMIT")) continue;
  if (head.startsWith("DELETE FROM SQLITE_SEQUENCE")) continue;
  if (head.startsWith("INSERT INTO SQLITE_SEQUENCE")) continue;
  if (head.startsWith("CREATE TABLE")) creates.push(statement);
  else if (head.startsWith("CREATE INDEX") || head.startsWith("CREATE UNIQUE INDEX")) {
    indexes.push(statement);
  } else if (head.startsWith("INSERT")) inserts.push(statement);
  else {
    console.warn("跳过未知语句:", statement.slice(0, 80));
  }
}

const client = createClient({
  url,
  ...(process.env.TURSO_AUTH_TOKEN?.trim()
    ? { authToken: process.env.TURSO_AUTH_TOKEN.trim() }
    : {}),
});

function chunkBySize(statements, maxBytes = 256 * 1024, maxCount = 40) {
  const chunks = [];
  let current = [];
  let bytes = 0;
  for (const statement of statements) {
    const size = Buffer.byteLength(statement, "utf8");
    if (current.length && (bytes + size > maxBytes || current.length >= maxCount)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(statement);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

console.log(
  `准备导入: 建表 ${creates.length} / 索引 ${indexes.length} / 数据 ${inserts.length} 条语句`,
);

try {
  const existing = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const existingTables = new Set(existing.rows.map((row) => String(row.name)));
  if (existingTables.size && !reset) {
    let rows = 0;
    for (const table of TABLES) {
      if (!existingTables.has(table)) continue;
      const result = await client.execute(`SELECT COUNT(*) AS n FROM ${table}`);
      rows += Number(result.rows[0]?.n ?? 0);
    }
    if (rows > 0) {
      console.error(`目标库已有 ${rows} 行数据；如需覆盖请加 --reset（会删除本项目的 20 张表）。`);
      process.exit(1);
    }
  }

  const tx = await client.transaction("write");
  try {
    // 先删子表再删父表，避免 DROP TABLE 被外键阻塞。
    for (const table of TABLES) {
      await tx.execute(`DROP TABLE IF EXISTS ${table}`);
    }
    for (const statement of creates) await tx.execute(statement);
    for (const statement of indexes) await tx.execute(statement);
    await tx.execute("PRAGMA defer_foreign_keys=ON");
    await tx.execute("DELETE FROM sqlite_sequence").catch(() => undefined);

    let done = 0;
    for (const chunk of chunkBySize(inserts)) {
      await tx.batch(chunk);
      done += chunk.length;
      if (done % 400 === 0 || done === inserts.length) {
        console.log(`  已写入 ${done}/${inserts.length} 条`);
      }
    }
    await tx.commit();
    console.log("导入事务已提交");
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  } finally {
    tx.close();
  }

  const counts = {};
  for (const table of ["articles", "events", "users", "event_documents", "event_sections"]) {
    const result = await client.execute(`SELECT COUNT(*) AS n FROM ${table}`);
    counts[table] = Number(result.rows[0]?.n ?? 0);
  }
  console.log("导入完成:", counts);
} finally {
  client.close();
}
