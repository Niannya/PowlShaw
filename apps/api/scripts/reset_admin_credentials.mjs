#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import Database from "better-sqlite3";

const root = process.cwd();
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);

const username = String(process.env.ADMIN_USERNAME || "admin").trim();
const password = String(process.env.ADMIN_PASSWORD || "");
const placeholders = new Set(["replace-with-a-strong-password", "ci-only-password"]);

if (!username || username.length > 64) {
  throw new Error("ADMIN_USERNAME must contain 1-64 characters.");
}
if (password.length < 8 || password.length > 200 || placeholders.has(password)) {
  throw new Error(
    "Set ADMIN_PASSWORD in .env.local to a new 8-200 character password before running this command.",
  );
}

const configuredPath = process.env.DATABASE_PATH || path.join("data", "poxiao.db");
const databasePath = path.resolve(root, configuredPath);
if (!fs.existsSync(databasePath)) {
  throw new Error(`Database does not exist: ${databasePath}`);
}

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

const table = database
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_credentials'")
  .get();
if (!table) {
  database.close();
  throw new Error(
    "admin_credentials table is missing; start the application once to migrate the database.",
  );
}

const backupDirectory = path.join(path.dirname(databasePath), "backups");
fs.mkdirSync(backupDirectory, { recursive: true });
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const backupPath = path.join(backupDirectory, `poxiao-before-admin-reset-${stamp}.db`);
await database.backup(backupPath);

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
const passwordHash = `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;

database
  .prepare(
    `INSERT INTO admin_credentials(id, username, password_hash, session_version, updated_at)
     VALUES (1, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       username=excluded.username,
       password_hash=excluded.password_hash,
       session_version=admin_credentials.session_version+1,
       updated_at=CURRENT_TIMESTAMP`,
  )
  .run(username, passwordHash);
database.close();

console.log(`Administrator credentials reset for: ${username}`);
console.log(`Database backup created: ${backupPath}`);
console.log("The password was not printed. Restart the application before logging in.");
