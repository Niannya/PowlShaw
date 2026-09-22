import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/user-auth";
import { requestIsHttps } from "@/lib/request-security";

const COOKIE_NAME = "poxiao_admin";
const SESSION_SECONDS = 60 * 60 * 12;

type AdminCredentials = {
  username: string;
  password_hash: string;
  session_version: number;
};

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return value;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function readAdminCredentials() {
  const db = getDb();
  let credentials = db
    .prepare(
      `SELECT username, password_hash, session_version
       FROM admin_credentials WHERE id = 1`,
    )
    .get() as AdminCredentials | undefined;

  if (!credentials) {
    const initialPassword = process.env.ADMIN_PASSWORD || "";
    if (!initialPassword) return undefined;
    const initialUsername = process.env.ADMIN_USERNAME || "admin";
    db.prepare(
      `INSERT OR IGNORE INTO admin_credentials(id, username, password_hash)
       VALUES (1, ?, ?)`,
    ).run(initialUsername, hashPassword(initialPassword));
    credentials = db
      .prepare(
        `SELECT username, password_hash, session_version
         FROM admin_credentials WHERE id = 1`,
      )
      .get() as AdminCredentials | undefined;
  }

  return credentials;
}

function safeTextEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  const length = Math.max(leftBuffer.length, rightBuffer.length);
  const paddedLeft = Buffer.alloc(length);
  const paddedRight = Buffer.alloc(length);
  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);
  return (
    crypto.timingSafeEqual(paddedLeft, paddedRight) && leftBuffer.length === rightBuffer.length
  );
}

export function credentialsAreValid(username: string, password: string) {
  const credentials = readAdminCredentials();
  if (!credentials || !password || password.length > 200) return false;
  return (
    safeTextEqual(username, credentials.username) &&
    verifyPassword(password, credentials.password_hash)
  );
}

export function createSessionToken(sessionVersion?: number) {
  const version = sessionVersion || readAdminCredentials()?.session_version;
  if (!version) throw new Error("Admin credentials have not been configured.");
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${version}.${expires}.${crypto.randomBytes(16).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const payload = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const expected = sign(payload);
  const actual = parts[3];
  if (actual.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return false;
  const version = Number(parts[0]);
  const expires = Number(parts[1]);
  const credentials = readAdminCredentials();
  return (
    Number.isSafeInteger(version) &&
    Number.isSafeInteger(expires) &&
    expires > Math.floor(Date.now() / 1000) &&
    credentials?.session_version === version
  );
}

export async function setSessionCookie(request: Request, sessionVersion?: number) {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(sessionVersion), {
    httpOnly: true,
    sameSite: "strict",
    // 本机和局域网的 HTTP 预览也必须能登录；经 HTTPS 代理时仍使用 Secure。
    secure: requestIsHttps(request),
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function isAdmin() {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

export function isAdminRequest(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  return verifySessionToken(token);
}

export function getAdminUsername() {
  return readAdminCredentials()?.username || process.env.ADMIN_USERNAME || "admin";
}

export function updateAdminPassword(currentPassword: string, newPassword: string) {
  const credentials = readAdminCredentials();
  if (!credentials || !verifyPassword(currentPassword, credentials.password_hash)) {
    return { ok: false, error: "当前密码不正确。" } as const;
  }
  if (verifyPassword(newPassword, credentials.password_hash)) {
    return { ok: false, error: "新密码不能和当前密码相同。" } as const;
  }

  const nextVersion = credentials.session_version + 1;
  const result = getDb()
    .prepare(
      `UPDATE admin_credentials
       SET password_hash = ?, session_version = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1 AND session_version = ?`,
    )
    .run(hashPassword(newPassword), nextVersion, credentials.session_version);
  if (result.changes !== 1) {
    return { ok: false, error: "密码已在其他页面中被修改，请重新登录后再试。" } as const;
  }
  return { ok: true, sessionVersion: nextVersion } as const;
}
