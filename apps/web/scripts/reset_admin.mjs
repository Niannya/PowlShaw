#!/usr/bin/env node
/**
 * 重置管理员账号密码。
 *
 * 背景：`.env.local` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 只在
 * `admin_credentials` 表为空时用于首次初始化；数据库已有记录后，改环境变量
 * 不会自动更新账号。忘记密码或改了用户名时运行本脚本。
 *
 * 用法：
 *   1. 在 apps/web/.env.local 设置新的 ADMIN_USERNAME / ADMIN_PASSWORD；
 *   2. pnpm --filter @powlshaw/web reset:admin
 *
 * 脚本会：写入新的 scrypt 哈希、递增 session_version（旧会话立即失效）、
 * 清空 user_login_attempts（解除 15 分钟登录锁定）。
 */
import crypto from "node:crypto";
import { createClient } from "@libsql/client/web";

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

const username = String(process.env.ADMIN_USERNAME || "").trim();
const password = String(process.env.ADMIN_PASSWORD || "");
const url = process.env.TURSO_DATABASE_URL?.trim();

if (!url) {
  console.error("缺少 TURSO_DATABASE_URL；请确认 apps/web/.env.local 已配置。");
  process.exit(1);
}
if (!username || username.length > 64) {
  console.error("ADMIN_USERNAME 不能为空，且不能超过 64 个字符。");
  process.exit(1);
}
if (password.length < 8 || password.length > 200) {
  console.error("ADMIN_PASSWORD 须为 8—200 个字符。");
  process.exit(1);
}

const client = createClient({
  url,
  ...(process.env.TURSO_AUTH_TOKEN?.trim()
    ? { authToken: process.env.TURSO_AUTH_TOKEN.trim() }
    : {}),
});

try {
  const existing = await client.execute(
    "SELECT username, session_version FROM admin_credentials WHERE id = 1",
  );
  if (!existing.rows.length) {
    await client.execute({
      sql: `INSERT INTO admin_credentials(id, username, password_hash, session_version)
            VALUES (1, ?, ?, 1)`,
      args: [username, hashPassword(password)],
    });
    console.log(`已初始化管理员账号：${username}`);
  } else {
    await client.execute({
      sql: `UPDATE admin_credentials
            SET username = ?, password_hash = ?, session_version = session_version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1`,
      args: [username, hashPassword(password)],
    });
    console.log(`已重置管理员账号：${username}（旧会话已失效）`);
  }

  const cleared = await client.execute("DELETE FROM user_login_attempts");
  console.log(`已清空登录失败记录：${Number(cleared.rowsAffected ?? 0)} 条`);
} finally {
  client.close();
}
