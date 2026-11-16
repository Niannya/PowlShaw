import assert from "node:assert/strict";
import test from "node:test";
import { splitSqlStatements } from "../scripts/sql-split.mjs";

test("schema.sql splits into executable statements", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../scripts/schema.sql", import.meta.url), "utf8");
  const statements = splitSqlStatements(source);

  assert.ok(statements.length >= 25, "应包含建表、索引与种子语句");
  assert.equal(
    statements.filter((statement) => /^CREATE TABLE IF NOT EXISTS/.test(statement)).length,
    20,
  );
  assert.ok(statements.every((statement) => !statement.startsWith("--")));
});

test("splitter ignores comments and semicolons inside string literals", () => {
  const statements = splitSqlStatements(`
    -- 这是注释；不应切分
    CREATE TABLE demo (value TEXT DEFAULT 'a;b');
    /* 块注释；也忽略 */
    INSERT INTO demo(value) VALUES ('c;d');
  `);

  assert.deepEqual(statements, [
    "CREATE TABLE demo (value TEXT DEFAULT 'a;b')",
    "INSERT INTO demo(value) VALUES ('c;d')",
  ]);
});
