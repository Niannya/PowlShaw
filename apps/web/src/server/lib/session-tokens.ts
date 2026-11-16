import crypto from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

/**
 * 双轨会话（受邀用户 + 管理员）的无状态实现。
 *
 * Token 格式与旧实现逐字节一致：
 * - 用户：`userId.sessionVersion.expires.nonce.hmac`（HMAC 覆盖 `user-session:<payload>`）
 * - 管理员：`sessionVersion.expires.nonce.hmac`（HMAC 覆盖 payload 本身）
 *
 * 改密 / 禁言 / 强制下线通过 `session_version` 递增实现秒级生效：
 * 本文件只负责“签名正确 + 未过期”，数据库里的 `session_version` 比对交给中间件。
 */

export const USER_COOKIE_NAME = "poxiao_user";
export const ADMIN_COOKIE_NAME = "poxiao_admin";
export const USER_SESSION_SECONDS = 60 * 60 * 24 * 7;
export const ADMIN_SESSION_SECONDS = 60 * 60 * 12;

export type PublicUser = {
  id: number;
  username: string;
  display_name: string;
  is_active: number;
  must_change_password: number;
  session_version: number;
  muted_until: string | null;
  mute_reason: string;
};

export type AdminIdentity = {
  username: string;
  sessionVersion: number;
};

export type UserSession = { userId: number; sessionVersion: number };

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

const DUMMY_PASSWORD_HASH =
  "scrypt$4Vi_hdYgHyAO3Do_MsdktQ$6fjcXdKsD_NrwzNrkusa2RAF6TNCDk5D6z2duZrbrENDnWNRs21n6Q7xUB2wdFRjilNKgRPDnMNayH_Q6tHgQA";

export function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return value;
}

function signUserPayload(payload: string) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(`user-session:${payload}`)
    .digest("base64url");
}

function signAdminPayload(payload: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function timingSafeTextEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

/* -------------------------------------------------------------------- user */

export function createUserSessionToken(userId: number, sessionVersion: number) {
  const expires = Math.floor(Date.now() / 1000) + USER_SESSION_SECONDS;
  const payload = `${userId}.${sessionVersion}.${expires}.${crypto.randomBytes(16).toString("base64url")}`;
  return `${payload}.${signUserPayload(payload)}`;
}

export function verifyUserSessionToken(token?: string): UserSession | undefined {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length !== 5) return undefined;

  const payload = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}`;
  const expected = signUserPayload(payload);
  if (!timingSafeTextEqual(parts[4], expected)) return undefined;

  const userId = Number(parts[0]);
  const sessionVersion = Number(parts[1]);
  const expires = Number(parts[2]);
  if (!Number.isSafeInteger(userId) || userId < 1) return undefined;
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 1) return undefined;
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return undefined;
  return { userId, sessionVersion };
}

export function verifyUserTokenSignature(payload: string, signature: string) {
  return timingSafeTextEqual(signature, signUserPayload(payload));
}

/* ------------------------------------------------------------------- admin */

export function createAdminSessionToken(sessionVersion: number) {
  const expires = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS;
  const payload = `${sessionVersion}.${expires}.${crypto.randomBytes(16).toString("base64url")}`;
  return `${payload}.${signAdminPayload(payload)}`;
}

/** 只校验签名与过期时间，返回 token 里携带的 `session_version`。 */
export function verifyAdminSessionToken(token?: string): number | undefined {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length !== 4) return undefined;

  const payload = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const expected = signAdminPayload(payload);
  if (!timingSafeTextEqual(parts[3], expected)) return undefined;

  const version = Number(parts[0]);
  const expires = Number(parts[1]);
  if (!Number.isSafeInteger(version) || !Number.isSafeInteger(expires)) return undefined;
  if (expires <= Math.floor(Date.now() / 1000)) return undefined;
  return version;
}

/* ------------------------------------------------------------------ crypto */

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltText, hashText] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    const actual = crypto.scryptSync(password, salt, expected.length);
    return expected.length > 0 && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** 用户不存在时也走一次 scrypt，避免用响应时间判断用户名是否存在。 */
export function verifyLoginPassword(password: string, storedHash?: string) {
  if (!password || password.length > 200) return false;
  return verifyPassword(password, storedHash || DUMMY_PASSWORD_HASH);
}

export function safeTextEqual(left: string, right: string) {
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

/* -------------------------------------------------------------- validation */

export function validateUsername(value: unknown): ValidationResult {
  const username = String(value || "").trim();
  if (!/^[\p{L}\p{N}_-]{3,32}$/u.test(username)) {
    return { ok: false, error: "用户名须为 3—32 位文字、数字、下划线或短横线。" };
  }
  return { ok: true, value: username };
}

export function validateDisplayName(value: unknown): ValidationResult {
  const displayName = String(value || "").trim();
  if (displayName.length < 1 || displayName.length > 40) {
    return { ok: false, error: "显示名称须为 1—40 个字符。" };
  }
  return { ok: true, value: displayName };
}

export function validateAdminNote(value: unknown): ValidationResult {
  const note = String(value || "").trim();
  if (note.length > 500) {
    return { ok: false, error: "管理员备注不能超过 500 个字符。" };
  }
  return { ok: true, value: note };
}

export function validatePassword(value: unknown, required = true): ValidationResult {
  const password = String(value || "");
  if (!password && !required) return { ok: true, value: "" };
  if (password.length < 8 || password.length > 200) {
    return { ok: false, error: "密码须为 8—200 个字符。" };
  }
  return { ok: true, value: password };
}

/** 与旧 `userCanPublishContent` 完全一致：强制改密或禁言未到期时禁止写入。 */
export function userCanPublishContent(user: PublicUser) {
  if (user.must_change_password) return false;
  if (!user.muted_until) return true;
  const mutedUntil = Date.parse(`${user.muted_until.replace(" ", "T")}+08:00`);
  return !Number.isFinite(mutedUntil) || mutedUntil <= Date.now();
}

/* ------------------------------------------------------------------ cookie */

type CookieContext = Context;

function baseCookieOptions(secure: boolean, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    // 本机与局域网 HTTP 预览也能登录；经 HTTPS 代理（含 Vercel）时仍加 Secure。
    secure,
    path: "/",
    maxAge,
  };
}

export function setUserSessionCookie(
  c: CookieContext,
  userId: number,
  sessionVersion: number,
  secure: boolean,
) {
  setCookie(
    c,
    USER_COOKIE_NAME,
    createUserSessionToken(userId, sessionVersion),
    baseCookieOptions(secure, USER_SESSION_SECONDS),
  );
}

export function clearUserSessionCookie(c: CookieContext) {
  deleteCookie(c, USER_COOKIE_NAME, { path: "/" });
}

export function setAdminSessionCookie(c: CookieContext, sessionVersion: number, secure: boolean) {
  setCookie(
    c,
    ADMIN_COOKIE_NAME,
    createAdminSessionToken(sessionVersion),
    baseCookieOptions(secure, ADMIN_SESSION_SECONDS),
  );
}

export function clearAdminSessionCookie(c: CookieContext) {
  deleteCookie(c, ADMIN_COOKIE_NAME, { path: "/" });
}

export function readUserCookie(c: CookieContext) {
  return getCookie(c, USER_COOKIE_NAME);
}

export function readAdminCookie(c: CookieContext) {
  return getCookie(c, ADMIN_COOKIE_NAME);
}
