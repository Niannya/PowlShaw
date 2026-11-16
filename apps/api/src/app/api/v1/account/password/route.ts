import { jsonError } from "@/lib/admin";
import { getDb } from "@/lib/db";
import {
  getUserFromRequest,
  hashPassword,
  setUserSessionCookie,
  validatePassword,
  verifyPassword,
} from "@/lib/user-auth";

export async function POST(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) return jsonError("请先登录。", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("请求格式不正确。");
  const currentPassword = String(body.current_password || "");
  const nextPassword = validatePassword(body.new_password);
  if (!nextPassword.ok) return jsonError(nextPassword.error);
  if (String(body.confirm_password || "") !== nextPassword.value) {
    return jsonError("两次输入的新密码不一致。");
  }

  const db = getDb();
  const row = db.prepare("SELECT password_hash FROM users WHERE id=?").get(user.id) as
    { password_hash: string } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    return jsonError("当前密码不正确。", 401);
  }
  if (verifyPassword(nextPassword.value, row.password_hash)) {
    return jsonError("新密码不能与当前密码相同。");
  }

  db.prepare(
    `UPDATE users
     SET password_hash=?, must_change_password=0,
         session_version=session_version+1, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
  ).run(hashPassword(nextPassword.value), user.id);
  const updated = db.prepare("SELECT session_version FROM users WHERE id=?").get(user.id) as {
    session_version: number;
  };
  await setUserSessionCookie(request, user.id, updated.session_version);
  return Response.json({ ok: true });
}
