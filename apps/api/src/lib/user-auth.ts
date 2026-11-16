import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { requestFingerprint, requestIsHttps } from "@/lib/request-security";

const COOKIE_NAME = "poxiao_user";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const DUMMY_PASSWORD_HASH =
  "scrypt$4Vi_hdYgHyAO3Do_MsdktQ$6fjcXdKsD_NrwzNrkusa2RAF6TNCDk5D6z2duZrbrENDnWNRs21n6Q7xUB2wdFRjilNKgRPDnMNayH_Q6tHgQA";

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

type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return value;
}

function signUserSession(payload: string) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(`user-session:${payload}`)
    .digest("base64url");
}

function readCookie(header: string, name: string) {
  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function createUserSessionToken(userId: number, sessionVersion: number) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${userId}.${sessionVersion}.${expires}.${crypto.randomBytes(16).toString("base64url")}`;
  return `${payload}.${signUserSession(payload)}`;
}

export function verifyUserSessionToken(token?: string) {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length !== 5) return undefined;

  const payload = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}`;
  const expected = signUserSession(payload);
  const actual = parts[4];
  if (actual.length !== expected.length) return undefined;
  if (!crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return undefined;

  const userId = Number(parts[0]);
  const sessionVersion = Number(parts[1]);
  const expires = Number(parts[2]);
  if (!Number.isSafeInteger(userId) || userId < 1) return undefined;
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 1) return undefined;
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return undefined;
  return { userId, sessionVersion };
}

function findActiveUser(session?: { userId: number; sessionVersion: number }) {
  if (!session) return undefined;
  return getDb()
    .prepare(
      `SELECT id, username, display_name, is_active, must_change_password,
              session_version, muted_until, mute_reason
       FROM users
       WHERE id = ? AND session_version = ? AND is_active = 1`,
    )
    .get(session.userId, session.sessionVersion) as PublicUser | undefined;
}

export async function getCurrentUser() {
  const store = await cookies();
  return findActiveUser(verifyUserSessionToken(store.get(COOKIE_NAME)?.value));
}

export function getUserFromRequest(request: Request) {
  const token = readCookie(request.headers.get("cookie") || "", COOKIE_NAME);
  return findActiveUser(verifyUserSessionToken(token));
}

export function userCanPublishContent(user: PublicUser) {
  if (user.must_change_password) return false;
  if (!user.muted_until) return true;
  const mutedUntil = Date.parse(`${user.muted_until.replace(" ", "T")}+08:00`);
  return !Number.isFinite(mutedUntil) || mutedUntil <= Date.now();
}

export async function setUserSessionCookie(
  request: Request,
  userId: number,
  sessionVersion: number,
) {
  const store = await cookies();
  store.set(COOKIE_NAME, createUserSessionToken(userId, sessionVersion), {
    httpOnly: true,
    sameSite: "strict",
    secure: requestIsHttps(request),
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearUserSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

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

export function verifyLoginPassword(password: string, storedHash?: string) {
  if (!password || password.length > 200) return false;
  return verifyPassword(password, storedHash || DUMMY_PASSWORD_HASH);
}

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

export function checkLoginLimit(username: string, request: Request, scope = "user-login") {
  const key = requestFingerprint(scope, request, username);
  const row = getDb()
    .prepare("SELECT attempts, window_started, blocked_until FROM user_login_attempts WHERE key=?")
    .get(key) as
    { attempts: number; window_started: string; blocked_until: string | null } | undefined;

  if (!row?.blocked_until) return { allowed: true, key } as const;
  const blockedUntil = Date.parse(row.blocked_until);
  if (Number.isFinite(blockedUntil) && blockedUntil > Date.now()) {
    return {
      allowed: false,
      key,
      retryAfter: Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000)),
    } as const;
  }
  return { allowed: true, key } as const;
}

export function recordLoginFailure(key: string) {
  const db = getDb();
  const now = new Date();
  const row = db
    .prepare("SELECT attempts, window_started FROM user_login_attempts WHERE key=?")
    .get(key) as { attempts: number; window_started: string } | undefined;
  const inWindow = row && Date.parse(row.window_started) > now.getTime() - LOGIN_WINDOW_MS;
  const attempts = inWindow ? row.attempts + 1 : 1;
  const windowStarted = inWindow ? row.window_started : now.toISOString();
  const blockedUntil =
    attempts >= MAX_LOGIN_FAILURES ? new Date(now.getTime() + LOGIN_BLOCK_MS).toISOString() : null;

  db.prepare(
    `INSERT INTO user_login_attempts(key, attempts, window_started, blocked_until)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       attempts=excluded.attempts,
       window_started=excluded.window_started,
       blocked_until=excluded.blocked_until`,
  ).run(key, attempts, windowStarted, blockedUntil);
}

export function clearLoginFailures(key: string) {
  getDb().prepare("DELETE FROM user_login_attempts WHERE key=?").run(key);
}
