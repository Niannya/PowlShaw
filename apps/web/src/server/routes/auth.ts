import { Hono } from "hono";
import type { AppEnv } from "../middleware/session";
import { formRedirect, jsonError } from "../lib/api-response";
import { run, get } from "../db/sql";
import {
  checkLoginLimit,
  clearLoginFailures,
  recordLoginFailure,
  requestIsHttps,
} from "../lib/request-security";
import { safeInternalPath } from "@/lib/safe-path";
import {
  clearUserSessionCookie,
  hashPassword,
  setUserSessionCookie,
  validatePassword,
  validateUsername,
  verifyLoginPassword,
  verifyPassword,
} from "../lib/session-tokens";

/**
 * 受邀账号路由（挂在 `/api/v1/account`）。
 * 登录同时支持 JSON（浏览器 fetch）与表单提交（303 相对跳转）。
 */
export const authRoutes = new Hono<AppEnv>();

type LoginUser = {
  id: number;
  password_hash: string;
  is_active: number;
  must_change_password: number;
  session_version: number;
};

authRoutes.post("/login", async (c) => {
  const isFormSubmission =
    c.req.header("content-type")?.includes("application/x-www-form-urlencoded") ?? false;
  const body = isFormSubmission
    ? (Object.fromEntries(await c.req.formData()) as Record<string, unknown>)
    : ((await c.req.json().catch(() => ({}))) as Record<string, unknown>);

  const usernameResult = validateUsername(body.username);
  const username = usernameResult.ok
    ? usernameResult.value
    : String(body.username || "").slice(0, 64);
  const limit = await checkLoginLimit(username, c.req.raw);

  if (!limit.allowed) {
    if (isFormSubmission) return formRedirect(c, "/login?error=rate-limit");
    return Response.json(
      { error: "尝试次数过多，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const password = String(body.password || "");
  const user = usernameResult.ok
    ? await get<LoginUser>(
        `SELECT id, password_hash, is_active, must_change_password, session_version
         FROM users WHERE username = ?`,
        [username],
      )
    : undefined;
  const passwordIsValid = verifyLoginPassword(password, user?.password_hash);
  if (!user || !user.is_active || !passwordIsValid) {
    await recordLoginFailure(limit.key);
    if (isFormSubmission) return formRedirect(c, "/login?error=credentials");
    return Response.json({ error: "用户名或密码不正确。" }, { status: 401 });
  }

  await clearLoginFailures(limit.key);
  await run("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?", [user.id]);
  setUserSessionCookie(c, user.id, user.session_version, requestIsHttps(c.req.raw));

  if (isFormSubmission) {
    const requestedPath = safeInternalPath(body.next);
    const nextPath = user.must_change_password
      ? `/account?first=1&next=${encodeURIComponent(requestedPath)}`
      : requestedPath;
    return formRedirect(c, nextPath);
  }
  return c.json({ ok: true, must_change_password: Boolean(user.must_change_password) });
});

authRoutes.post("/logout", (c) => {
  clearUserSessionCookie(c);
  // 必须用 c.json 返回，否则 Set-Cookie 不会进入响应头。
  return c.json({ ok: true });
});

authRoutes.post("/password", async (c) => {
  const user = c.get("user");
  if (!user) return jsonError("请先登录。", 401);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("请求格式不正确。");
  const currentPassword = String(body.current_password || "");
  const nextPassword = validatePassword(body.new_password);
  if (!nextPassword.ok) return jsonError(nextPassword.error);
  if (String(body.confirm_password || "") !== nextPassword.value) {
    return jsonError("两次输入的新密码不一致。");
  }

  const row = await get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=?", [
    user.id,
  ]);
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    return jsonError("当前密码不正确。", 401);
  }
  if (verifyPassword(nextPassword.value, row.password_hash)) {
    return jsonError("新密码不能与当前密码相同。");
  }

  await run(
    `UPDATE users
     SET password_hash=?, must_change_password=0,
         session_version=session_version+1, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
    [hashPassword(nextPassword.value), user.id],
  );
  const updated = await get<{ session_version: number }>(
    "SELECT session_version FROM users WHERE id=?",
    [user.id],
  );
  if (updated) setUserSessionCookie(c, user.id, updated.session_version, requestIsHttps(c.req.raw));
  return c.json({ ok: true });
});

authRoutes.post("/notifications/read", async (c) => {
  const user = c.get("user");
  if (!user) return jsonError("请先登录。", 401);
  await run("UPDATE notifications SET is_read=1 WHERE user_id=?", [user.id]);
  return Response.json({ ok: true });
});
