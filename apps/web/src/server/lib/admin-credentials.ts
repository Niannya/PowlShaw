import { get, run } from "../db/sql";
import { hashPassword, safeTextEqual, verifyPassword } from "./session-tokens";

/**
 * 后台账号存储。
 *
 * 管理员密码只保存 scrypt 哈希；环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD`
 * 仅在数据库里还没有记录时用于首次初始化（落入数据库后即不再读取）。
 */

const ADMIN_PASSWORD_PLACEHOLDERS = new Set(["replace-with-a-strong-password", "ci-only-password"]);

export type AdminCredentials = {
  username: string;
  password_hash: string;
  session_version: number;
};

export async function readAdminCredentials(): Promise<AdminCredentials | undefined> {
  const select = `SELECT username, password_hash, session_version FROM admin_credentials WHERE id = 1`;
  let credentials = await get<AdminCredentials>(select);

  if (!credentials) {
    const initialPassword = process.env.ADMIN_PASSWORD || "";
    const initialUsername = (process.env.ADMIN_USERNAME || "admin").trim();
    if (
      !initialUsername ||
      initialUsername.length > 64 ||
      initialPassword.length < 8 ||
      initialPassword.length > 200 ||
      ADMIN_PASSWORD_PLACEHOLDERS.has(initialPassword)
    ) {
      return undefined;
    }
    await run(
      `INSERT OR IGNORE INTO admin_credentials(id, username, password_hash)
       VALUES (1, ?, ?)`,
      [initialUsername, hashPassword(initialPassword)],
    );
    credentials = await get<AdminCredentials>(select);
  }

  return credentials;
}

export async function adminCredentialsAreConfigured() {
  return Boolean(await readAdminCredentials());
}

export async function credentialsAreValid(username: string, password: string) {
  const credentials = await readAdminCredentials();
  if (!credentials || !password || password.length > 200) return false;
  return (
    safeTextEqual(username, credentials.username) &&
    verifyPassword(password, credentials.password_hash)
  );
}

export async function getAdminUsername() {
  const credentials = await readAdminCredentials();
  return credentials?.username || process.env.ADMIN_USERNAME || "admin";
}

export type AdminPasswordUpdate =
  { ok: true; sessionVersion: number } | { ok: false; error: string };

export async function updateAdminPassword(
  currentPassword: string,
  newPassword: string,
): Promise<AdminPasswordUpdate> {
  const credentials = await readAdminCredentials();
  if (!credentials || !verifyPassword(currentPassword, credentials.password_hash)) {
    return { ok: false, error: "当前密码不正确。" };
  }
  if (verifyPassword(newPassword, credentials.password_hash)) {
    return { ok: false, error: "新密码不能和当前密码相同。" };
  }

  const nextVersion = credentials.session_version + 1;
  const result = await run(
    `UPDATE admin_credentials
     SET password_hash = ?, session_version = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1 AND session_version = ?`,
    [hashPassword(newPassword), nextVersion, credentials.session_version],
  );
  if (result.changes !== 1) {
    return { ok: false, error: "密码已在其他页面中被修改，请重新登录后再试。" };
  }
  return { ok: true, sessionVersion: nextVersion };
}
