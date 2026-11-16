import crypto from "node:crypto";
import { get, run } from "../db/sql";

/**
 * 请求来源判定与限流。
 *
 * 与旧实现的差别只有一处：SQLite 从同步 `better-sqlite3` 换成异步 libSQL，
 * 因此限流读写全部变成 `await`，窗口与阈值保持完全一致。
 */

/**
 * 是否采信代理写入的客户端地址 / 协议。
 *
 * - Cloudflare：请求一定经过其边缘，`cf-connecting-ip` 可信；
 * - Vercel：Serverless / Edge 入口必然经过平台代理（`x-forwarded-for` / `x-forwarded-proto`）；
 * - 其它自建反代：只有部署方显式设置 `TRUST_PROXY_HEADERS=1` 时才采信。
 *
 * 若这里判断失败，Vercel 上所有请求都会落到 `unknown`，
 * 导致全站共用一个登录失败桶与限流桶（5 次失败即锁所有人）。
 */
function trustsProxyHeaders(request: Request) {
  return (
    Boolean(request.headers.get("cf-connecting-ip")?.trim()) ||
    process.env.TRUST_PROXY_HEADERS === "1" ||
    Boolean(process.env.VERCEL)
  );
}

function requestAddress(request: Request) {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  if (trustsProxyHeaders(request)) {
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

export function requestIsHttps(request: Request) {
  const forwardedProtocol = trustsProxyHeaders(request)
    ? request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
    : undefined;
  if (forwardedProtocol) return forwardedProtocol === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function requestFingerprint(scope: string, request: Request, subject = "") {
  return crypto
    .createHash("sha256")
    .update(`${scope}|${subject.toLocaleLowerCase()}|${requestAddress(request)}`)
    .digest("hex");
}

/** 固定窗口限流，落库保存，进程重启不会清空。 */
export async function consumeRateLimit(
  scope: string,
  request: Request,
  limit: number,
  windowSeconds: number,
) {
  const key = requestFingerprint(scope, request);
  const now = Date.now();
  const row = await get<{ request_count: number; window_started: string }>(
    "SELECT request_count, window_started FROM request_rate_limits WHERE key=?",
    [key],
  );
  const startedAt = row ? Date.parse(row.window_started) : Number.NaN;
  const inWindow = Number.isFinite(startedAt) && now - startedAt < windowSeconds * 1000;
  const count = inWindow ? row!.request_count + 1 : 1;
  const windowStarted = inWindow ? row!.window_started : new Date(now).toISOString();

  await run(
    `INSERT INTO request_rate_limits(key, request_count, window_started)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       request_count=excluded.request_count,
       window_started=excluded.window_started`,
    [key, count, windowStarted],
  );

  // 顺手清理，避免表无限增长，也不需要额外的定时任务。
  if (Math.random() < 0.01) {
    await run("DELETE FROM request_rate_limits WHERE window_started < ?", [
      new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    ]);
  }

  const retryAfter = Math.max(1, Math.ceil((startedAt + windowSeconds * 1000 - now) / 1000));
  return { allowed: count <= limit, retryAfter: inWindow ? retryAfter : windowSeconds, count };
}

/* --------------------------------------------------------------- 登录限流 */

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;

export type LoginLimit =
  { allowed: true; key: string } | { allowed: false; key: string; retryAfter: number };

export async function checkLoginLimit(
  username: string,
  request: Request,
  scope = "user-login",
): Promise<LoginLimit> {
  const key = requestFingerprint(scope, request, username);
  const row = await get<{ attempts: number; window_started: string; blocked_until: string | null }>(
    "SELECT attempts, window_started, blocked_until FROM user_login_attempts WHERE key=?",
    [key],
  );

  if (!row?.blocked_until) return { allowed: true, key };
  const blockedUntil = Date.parse(row.blocked_until);
  if (Number.isFinite(blockedUntil) && blockedUntil > Date.now()) {
    return {
      allowed: false,
      key,
      retryAfter: Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000)),
    };
  }
  return { allowed: true, key };
}

export async function recordLoginFailure(key: string) {
  const now = new Date();
  const row = await get<{ attempts: number; window_started: string }>(
    "SELECT attempts, window_started FROM user_login_attempts WHERE key=?",
    [key],
  );
  const inWindow =
    Boolean(row) && Date.parse(row!.window_started) > now.getTime() - LOGIN_WINDOW_MS;
  const attempts = inWindow ? row!.attempts + 1 : 1;
  const windowStarted = inWindow ? row!.window_started : now.toISOString();
  const blockedUntil =
    attempts >= MAX_LOGIN_FAILURES ? new Date(now.getTime() + LOGIN_BLOCK_MS).toISOString() : null;

  await run(
    `INSERT INTO user_login_attempts(key, attempts, window_started, blocked_until)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       attempts=excluded.attempts,
       window_started=excluded.window_started,
       blocked_until=excluded.blocked_until`,
    [key, attempts, windowStarted, blockedUntil],
  );
}

export async function clearLoginFailures(key: string) {
  await run("DELETE FROM user_login_attempts WHERE key=?", [key]);
}
