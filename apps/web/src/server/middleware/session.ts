import type { MiddlewareHandler } from "hono";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { get } from "../db/sql";
import { apiError, apiUnauthorized, jsonError } from "../lib/api-response";
import {
  ADMIN_COOKIE_NAME,
  USER_COOKIE_NAME,
  verifyAdminSessionToken,
  verifyUserSessionToken,
  type AdminIdentity,
  type PublicUser,
} from "../lib/session-tokens";

/**
 * 会话中间件：解析 `poxiao_user` / `poxiao_admin` 两个 Cookie，
 * 校验 HMAC 与过期时间后回查数据库里的 `session_version`，
 * 把结果挂到 `c.set("user")` / `c.set("admin")`。
 */

export type AuthVariables = {
  user: PublicUser | null;
  admin: AdminIdentity | null;
};

export type AppEnv = { Variables: AuthVariables };

export type AppContext = Context<AppEnv>;

export const PUBLIC_USER_COLUMNS = `id, username, display_name, is_active, must_change_password,
  session_version, muted_until, mute_reason`;

export async function loadSessionUser(token?: string): Promise<PublicUser | null> {
  const session = verifyUserSessionToken(token);
  if (!session) return null;
  const row = await get<PublicUser>(
    `SELECT ${PUBLIC_USER_COLUMNS}
     FROM users
     WHERE id = ? AND session_version = ? AND is_active = 1`,
    [session.userId, session.sessionVersion],
  );
  return row ?? null;
}

export async function loadSessionAdmin(token?: string): Promise<AdminIdentity | null> {
  const sessionVersion = verifyAdminSessionToken(token);
  if (sessionVersion === undefined) return null;
  const credentials = await get<{ username: string; session_version: number }>(
    "SELECT username, session_version FROM admin_credentials WHERE id = 1",
  );
  if (!credentials || credentials.session_version !== sessionVersion) return null;
  return { username: credentials.username, sessionVersion: credentials.session_version };
}

export const attachAuthContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userToken = getCookie(c, USER_COOKIE_NAME);
  const adminToken = getCookie(c, ADMIN_COOKIE_NAME);
  const [user, admin] = await Promise.all([
    userToken ? loadSessionUser(userToken) : Promise.resolve(null),
    adminToken ? loadSessionAdmin(adminToken) : Promise.resolve(null),
  ]);
  c.set("user", user);
  c.set("admin", admin);
  await next();
};

/* ------------------------------------------------------------------- gates */

/** 后台读取端点：旧实现返回 `{ error: { code, message } }` 结构。 */
export const requireAdminSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("admin")) return apiUnauthorized("请先登录后台。");
  await next();
};

/** 后台写操作：旧实现返回 `{ error: "中文提示" }` 结构。 */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("admin")) return jsonError("请先登录。", 401);
  await next();
};

/** 新增扩展端点的后台写操作：使用 `{ error: { code, message } }` 错误体。 */
export const requireAdminApi: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("admin")) return apiError("UNAUTHORIZED", "请先登录后台。", 401);
  await next();
};

/** 受邀用户写操作（评论、扩展互动条目）。 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")) return jsonError("请先登录。", 401);
  await next();
};
