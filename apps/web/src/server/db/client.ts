import { createClient, type Client, type InStatement, type ResultSet } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema";

/**
 * 云端数据库单例（惰性初始化）+ 事务感知连接。
 *
 * 三条硬性约束：
 * 1. `@libsql/client/web` 只支持 `libsql:` / `http(s):` / `ws(s):`，不支持 `file:`；
 *    本地开发请先用 `turso dev --db-file local.db` 启动兼容服务，并把
 *    `TURSO_DATABASE_URL` 指向 `http://127.0.0.1:8080`。
 * 2. 模块顶层绝不能连接数据库或抛错：`next build` 时没有任何凭据也必须能构建，
 *    因此所有 `process.env` 读取与错误抛出都发生在第一次真正发请求时。
 * 3. 事务内的所有查询（含 Drizzle）必须落在同一个 libSQL 写事务连接上，
 *    否则另开连接会撞上 SQLite 写锁。这里用 `AsyncLocalStorage` 保存“当前事务连接”，
 *    原始 SQL（`db/sql.ts`）与 Drizzle 查询都通过同一个入口取连接。
 */

export type SqlConnection = {
  execute(statement: InStatement): Promise<ResultSet>;
  batch(statements: InStatement[]): Promise<ResultSet[]>;
};

const connectionStorage = new AsyncLocalStorage<SqlConnection>();

export function hasActiveTransaction() {
  return connectionStorage.getStore() !== undefined;
}

export function runInConnection<T>(connection: SqlConnection, callback: () => Promise<T>) {
  return connectionStorage.run(connection, callback);
}

const globalForDatabase = globalThis as unknown as {
  __powlshawLibsql?: Client;
  __powlshawDrizzle?: LibSQLDatabase<typeof schema>;
};

/** 缺少连接串时抛出的可读错误（只在请求期触发）。 */
export function databaseNotConfiguredError() {
  return new Error(
    "数据库尚未配置：缺少环境变量 TURSO_DATABASE_URL。" +
      "本地开发请运行 `turso dev --db-file local.db` 并设置 TURSO_DATABASE_URL=http://127.0.0.1:8080。",
  );
}

/** 用于把“尚未配置数据库”与真正的 500 区分开（返回 503 和可读提示）。 */
export function isDatabaseNotConfiguredError(error: unknown) {
  return error instanceof Error && error.message.startsWith("数据库尚未配置");
}

export function getLibsqlClient(): Client {
  if (globalForDatabase.__powlshawLibsql) return globalForDatabase.__powlshawLibsql;

  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (!url) throw databaseNotConfiguredError();
  if (url.startsWith("file:")) {
    throw new Error(
      "`@libsql/client/web` 不支持本地 `file:` 数据库；请改用 `turso dev`（HTTP）或 Turso 云端地址。",
    );
  }

  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  const client = createClient({
    url,
    ...(authToken ? { authToken } : {}),
    // 旧表用 INTEGER 存 0/1 与计数；number 模式让 JSON 序列化保持旧行为。
    intMode: "number",
  });
  globalForDatabase.__powlshawLibsql = client;
  return client;
}

/** 当前请求/事务应使用的连接。 */
export function activeConnection(): SqlConnection {
  const store = connectionStorage.getStore();
  if (store) return store;
  const client = getLibsqlClient();
  return {
    execute: (statement) => client.execute(statement),
    batch: (statements) => client.batch(statements),
  };
}

/**
 * 交给 Drizzle 的“代理 Client”：每个查询都会重新解析当前事务连接，
 * 因此 `await transaction(async () => { await db.select(...) })` 也在同一事务内。
 */
function drizzleClient(): Client {
  const target = () => getLibsqlClient();
  const proxy = {
    execute: (statement: InStatement) => activeConnection().execute(statement),
    batch: (statements: InStatement[]) => activeConnection().batch(statements),
    migrate: (statements: InStatement[]) => target().migrate(statements),
    transaction: (mode?: "write" | "read" | "deferred") => target().transaction(mode),
    executeMultiple: (sql: string) => target().executeMultiple(sql),
    sync: () => target().sync(),
    close: () => target().close(),
    reconnect: () => target().reconnect(),
    get closed() {
      return globalForDatabase.__powlshawLibsql?.closed ?? true;
    },
    protocol: "http",
  };
  return proxy as unknown as Client;
}

/** Drizzle 实例（新增的扩展表等新代码使用；旧 SQL 语义仍走 `db/sql.ts`）。 */
export function getDrizzle(): LibSQLDatabase<typeof schema> {
  if (globalForDatabase.__powlshawDrizzle) return globalForDatabase.__powlshawDrizzle;
  const db = drizzle(drizzleClient(), { schema });
  globalForDatabase.__powlshawDrizzle = db;
  return db;
}
