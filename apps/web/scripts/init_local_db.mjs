#!/usr/bin/env node
/**
 * 在空的 libSQL 数据库上执行 `scripts/schema.sql`，创建 20 张表与种子数据。
 *
 * 用途：
 * - 本地 `turso dev --db-file local.db` 启动的 HTTP 实例；
 * - 已创建但为空的 Turso 云端数据库（也可直接用 `turso db shell <db> < schema.sql`）。
 *
 * 用法：
 *   TURSO_DATABASE_URL=http://127.0.0.1:8080 node apps/web/scripts/init_local_db.mjs
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node apps/web/scripts/init_local_db.mjs
 *
 * 脚本可重复执行：schema.sql 全部使用 `CREATE TABLE IF NOT EXISTS` 与
 * `INSERT OR IGNORE`，不会覆盖已有数据。
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client/web";
import { splitSqlStatements } from "./sql-split.mjs";

const here = new URL(".", import.meta.url);
const schemaPath = new URL("schema.sql", here);

const url = process.env.TURSO_DATABASE_URL?.trim();
if (!url) {
  console.error(
    "缺少 TURSO_DATABASE_URL。本地可先运行 `turso dev --db-file local.db`，" +
      "再设置 TURSO_DATABASE_URL=http://127.0.0.1:8080。",
  );
  process.exit(1);
}

const source = await readFile(fileURLToPath(schemaPath), "utf8");
const statements = splitSqlStatements(source);
const client = createClient({
  url,
  ...(process.env.TURSO_AUTH_TOKEN?.trim()
    ? { authToken: process.env.TURSO_AUTH_TOKEN.trim() }
    : {}),
});

let applied = 0;
try {
  for (const statement of statements) {
    await client.execute(statement);
    applied += 1;
  }
  const tables = await client.execute(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  console.log(`已执行 ${applied} 条语句；当前业务表数量：${tables.rows[0]?.count ?? "?"}`);
} finally {
  client.close();
}
