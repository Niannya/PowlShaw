import crypto from "node:crypto";
import { getDb } from "@/lib/db";

/**
 * Only trust proxy-provided addresses when they come from Cloudflare, or when the
 * deployment explicitly opts into trusting its reverse proxy.
 */
function requestAddress(request: Request) {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  if (process.env.TRUST_PROXY_HEADERS === "1") {
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

export function requestIsHttps(request: Request) {
  const trustsProxy =
    Boolean(request.headers.get("cf-connecting-ip")?.trim()) ||
    process.env.TRUST_PROXY_HEADERS === "1";
  const forwardedProtocol = trustsProxy
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

/** Fixed-window limiter persisted in SQLite so a process restart cannot clear it. */
export function consumeRateLimit(
  scope: string,
  request: Request,
  limit: number,
  windowSeconds: number,
) {
  const db = getDb();
  const key = requestFingerprint(scope, request);
  const now = Date.now();
  const row = db
    .prepare("SELECT request_count, window_started FROM request_rate_limits WHERE key=?")
    .get(key) as { request_count: number; window_started: string } | undefined;
  const startedAt = row ? Date.parse(row.window_started) : Number.NaN;
  const inWindow = Number.isFinite(startedAt) && now - startedAt < windowSeconds * 1000;
  const count = inWindow ? row!.request_count + 1 : 1;
  const windowStarted = inWindow ? row!.window_started : new Date(now).toISOString();

  db.prepare(
    `INSERT INTO request_rate_limits(key, request_count, window_started)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       request_count=excluded.request_count,
       window_started=excluded.window_started`,
  ).run(key, count, windowStarted);

  // Opportunistic cleanup keeps this small without requiring a scheduled job.
  if (Math.random() < 0.01) {
    db.prepare("DELETE FROM request_rate_limits WHERE window_started < ?").run(
      new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
  }

  const retryAfter = Math.max(1, Math.ceil((startedAt + windowSeconds * 1000 - now) / 1000));
  return { allowed: count <= limit, retryAfter: inWindow ? retryAfter : windowSeconds, count };
}
