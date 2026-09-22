import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "@/lib/db-schema";

const globalForDatabase = globalThis as unknown as {
  poxiaoDatabase?: Database.Database;
};

function databasePath() {
  const configured = process.env.DATABASE_PATH;
  if (!configured) return path.join(process.cwd(), "data", "poxiao.db");
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
}

function openDatabase() {
  const filename = databasePath();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const database = new Database(filename);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(database);
  return database;
}

export function getDb() {
  if (!globalForDatabase.poxiaoDatabase) {
    globalForDatabase.poxiaoDatabase = openDatabase();
  }
  return globalForDatabase.poxiaoDatabase;
}

export type SqlRow = Record<string, unknown>;
