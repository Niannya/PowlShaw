import { jsonError } from "@/lib/admin";
import { isAdminRequest } from "@/lib/auth";
import { auditAdmin } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { normalizeLocalDateTime } from "@/lib/date-time";
import {
  hashPassword,
  validateAdminNote,
  validateDisplayName,
  validatePassword,
} from "@/lib/user-auth";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) return jsonError("账号不存在。", 404);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("请求格式不正确。");

  const displayName = validateDisplayName(body.display_name);
  const adminNote = validateAdminNote(body.admin_note);
  const password = validatePassword(body.password, false);
  if (!displayName.ok) return jsonError(displayName.error);
  if (!adminNote.ok) return jsonError(adminNote.error);
  if (!password.ok) return jsonError(password.error);
  const active = body.is_active ? 1 : 0;
  const mutedUntilResult = normalizeLocalDateTime(body.muted_until);
  if (!mutedUntilResult.ok) return jsonError(mutedUntilResult.error);
  const mutedUntil = mutedUntilResult.value;
  const muteReason = String(body.mute_reason || "")
    .trim()
    .slice(0, 500);
  const db = getDb();
  const previous = db.prepare("SELECT is_active FROM users WHERE id=?").get(id) as
    { is_active: number } | undefined;
  if (!previous) return jsonError("账号不存在。", 404);
  const result = password.value
    ? db
        .prepare(
          `UPDATE users
           SET display_name=?, admin_note=?, password_hash=?, is_active=?,
               must_change_password=1, session_version=session_version+1,
               muted_until=?, mute_reason=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=?`,
        )
        .run(
          displayName.value,
          adminNote.value,
          hashPassword(password.value),
          active,
          mutedUntil,
          muteReason,
          id,
        )
    : db
        .prepare(
          `UPDATE users
           SET display_name=?, admin_note=?, is_active=?, muted_until=?, mute_reason=?,
               session_version=session_version+?, updated_at=CURRENT_TIMESTAMP
           WHERE id=?`,
        )
        .run(
          displayName.value,
          adminNote.value,
          active,
          mutedUntil,
          muteReason,
          previous.is_active && !active ? 1 : 0,
          id,
        );
  if (!result.changes) return jsonError("账号不存在。", 404);
  auditAdmin("update", "user", id, {
    display_name: displayName.value,
    is_active: active,
    password_reset: Boolean(password.value),
    muted_until: mutedUntil,
    mute_reason: muteReason,
  });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) return jsonError("账号不存在。", 404);
  const result = getDb().prepare("DELETE FROM users WHERE id=?").run(id);
  if (!result.changes) return jsonError("账号不存在。", 404);
  auditAdmin("delete", "user", id);
  return Response.json({ ok: true });
}
