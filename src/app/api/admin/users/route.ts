import { jsonError } from "@/lib/admin";
import { isAdminRequest } from "@/lib/auth";
import { auditAdmin } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  hashPassword,
  validateAdminNote,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from "@/lib/user-auth";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("请求格式不正确。");

  const username = validateUsername(body.username);
  const displayName = validateDisplayName(body.display_name);
  const adminNote = validateAdminNote(body.admin_note);
  const password = validatePassword(body.password);
  if (!username.ok) return jsonError(username.error);
  if (!displayName.ok) return jsonError(displayName.error);
  if (!adminNote.ok) return jsonError(adminNote.error);
  if (!password.ok) return jsonError(password.error);

  try {
    const result = getDb()
      .prepare(
        `INSERT INTO users(
           username, display_name, admin_note, password_hash, must_change_password
         ) VALUES (?, ?, ?, ?, 1)`,
      )
      .run(username.value, displayName.value, adminNote.value, hashPassword(password.value));
    auditAdmin("create", "user", Number(result.lastInsertRowid), {
      username: username.value,
      display_name: displayName.value,
    });
    return Response.json({ ok: true, id: Number(result.lastInsertRowid) }, { status: 201 });
  } catch (error) {
    if (String(error).includes("UNIQUE")) return jsonError("这个用户名已经存在。", 409);
    throw error;
  }
}
