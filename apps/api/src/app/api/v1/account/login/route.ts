import { getDb } from "@/lib/db";
import { safeInternalPath } from "@/lib/safe-path";
import {
  checkLoginLimit,
  clearLoginFailures,
  recordLoginFailure,
  setUserSessionCookie,
  validateUsername,
  verifyLoginPassword,
} from "@/lib/user-auth";

type LoginUser = {
  id: number;
  password_hash: string;
  is_active: number;
  must_change_password: number;
  session_version: number;
};

function redirectTo(path: string) {
  // 使用相对地址，避免反向代理后的 request.url 指向 localhost。
  return new Response(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request) {
  const isFormSubmission = request.headers
    .get("content-type")
    ?.includes("application/x-www-form-urlencoded");
  const body = isFormSubmission
    ? Object.fromEntries(await request.formData())
    : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
  const usernameResult = validateUsername(body.username);
  const username = usernameResult.ok
    ? usernameResult.value
    : String(body.username || "").slice(0, 64);
  const limit = checkLoginLimit(username, request);

  if (!limit.allowed) {
    if (isFormSubmission) {
      return redirectTo("/login?error=rate-limit");
    }
    return Response.json(
      { error: "尝试次数过多，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const password = String(body.password || "");
  const user = usernameResult.ok
    ? (getDb()
        .prepare(
          `SELECT id, password_hash, is_active, must_change_password, session_version
           FROM users WHERE username = ?`,
        )
        .get(username) as LoginUser | undefined)
    : undefined;
  const passwordIsValid = verifyLoginPassword(password, user?.password_hash);
  if (!user || !user.is_active || !passwordIsValid) {
    recordLoginFailure(limit.key);
    if (isFormSubmission) {
      return redirectTo("/login?error=credentials");
    }
    return Response.json({ error: "用户名或密码不正确。" }, { status: 401 });
  }

  clearLoginFailures(limit.key);
  getDb().prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id);
  await setUserSessionCookie(request, user.id, user.session_version);
  if (isFormSubmission) {
    const requestedPath = safeInternalPath(body.next);
    const nextPath = user.must_change_password
      ? `/account?first=1&next=${encodeURIComponent(requestedPath)}`
      : requestedPath;
    return redirectTo(nextPath);
  }
  return Response.json({ ok: true, must_change_password: Boolean(user.must_change_password) });
}
