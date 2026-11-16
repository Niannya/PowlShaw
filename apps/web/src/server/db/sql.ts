import type { InArgs, InStatement, Row } from "@libsql/client/web";
import {
  activeConnection,
  getLibsqlClient,
  hasActiveTransaction,
  runInConnection,
  type SqlConnection,
} from "./client";

/**
 * 异步 SQL 门面：把旧 `better-sqlite3` 的同步调用逐句替换为 `await all/get/run`。
 *
 * - `all<T>` / `get<T>` / `run` 三个函数的 SQL 与参数语义不变；
 * - `transaction(fn)` 使用 libSQL 的写事务（`BEGIN IMMEDIATE`），异常自动回滚；
 * - 事务内调用的 `all/get/run`（以及 Drizzle 查询）会自动落到同一个事务连接，
 *   这样旧代码里“在事务中调用 audit / recordContentRevision 等工具函数”的写法不必改签名；
 * - libSQL 返回的行是“数组 + 列名”混合对象，这里统一转成普通对象，
 *   避免 JSON 序列化时出现重复的索引键。
 */

export type SqlValue = string | number | bigint | boolean | null | undefined | Date | Uint8Array;
/** 旧路由里 SQL 参数常来自 `unknown` 的请求体，这里放宽为 `unknown` 以便逐句移植。 */
export type SqlArgs = readonly unknown[] | Record<string, unknown>;
export type SqlRow = Record<string, unknown>;

export type RunResult = { changes: number; lastInsertRowid: number };

export type SqlStatement = { sql: string; args?: SqlArgs };

export type SqlExecutor = {
  all<T = SqlRow>(sql: string, args?: SqlArgs): Promise<T[]>;
  get<T = SqlRow>(sql: string, args?: SqlArgs): Promise<T | undefined>;
  run(sql: string, args?: SqlArgs): Promise<RunResult>;
};

export type SqlTransaction = SqlExecutor;

type NormalizedValue = string | number | bigint | Uint8Array | null;

function normalizeValue(value: unknown): NormalizedValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  if (value instanceof Uint8Array) return value;
  return String(value);
}

function normalizeArgs(args?: SqlArgs): InArgs | undefined {
  if (!args) return undefined;
  if (Array.isArray(args)) return args.map(normalizeValue) as InArgs;
  const named: Record<string, NormalizedValue> = {};
  for (const [key, value] of Object.entries(args)) named[key] = normalizeValue(value);
  return named as InArgs;
}

function rowToObject(columns: string[], row: Row): SqlRow {
  const record: SqlRow = {};
  for (let index = 0; index < columns.length; index += 1) {
    record[columns[index]] = row[index] ?? null;
  }
  return record;
}

export async function all<T = SqlRow>(sql: string, args?: SqlArgs): Promise<T[]> {
  const result = await activeConnection().execute({
    sql,
    args: normalizeArgs(args),
  } as InStatement);
  return result.rows.map((row) => rowToObject(result.columns, row)) as T[];
}

export async function get<T = SqlRow>(sql: string, args?: SqlArgs): Promise<T | undefined> {
  const rows = await all<T>(sql, args);
  return rows[0];
}

export async function run(sql: string, args?: SqlArgs): Promise<RunResult> {
  const result = await activeConnection().execute({
    sql,
    args: normalizeArgs(args),
  } as InStatement);
  return {
    changes: Number(result.rowsAffected ?? 0),
    lastInsertRowid: Number(result.lastInsertRowid ?? 0),
  };
}

/** 一次性提交多条语句；任意一条失败时整批回滚。 */
export async function batch(statements: SqlStatement[]): Promise<RunResult[]> {
  const results = await activeConnection().batch(
    statements.map((statement) => ({
      sql: statement.sql,
      args: normalizeArgs(statement.args),
    })) as InStatement[],
  );
  return results.map((result) => ({
    changes: Number(result.rowsAffected ?? 0),
    lastInsertRowid: Number(result.lastInsertRowid ?? 0),
  }));
}

export const sqlExecutor: SqlExecutor = { all, get, run };

/**
 * 写事务。回调内所有 `all/get/run` 与 Drizzle 查询自动复用该事务连接，
 * 因此不需要给 `auditAdmin`、`recordContentRevision` 之类的工具改签名。
 */
export async function transaction<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
  // 嵌套事务直接复用外层事务，避免 libSQL 在同一逻辑连接上重复 BEGIN。
  if (hasActiveTransaction()) return callback(sqlExecutor);

  const tx = await getLibsqlClient().transaction("write");
  const connection: SqlConnection = {
    execute: (statement) => tx.execute(statement),
    batch: (statements) => tx.batch(statements),
  };
  try {
    const result = await runInConnection(connection, () => callback(sqlExecutor));
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  } finally {
    tx.close();
  }
}
