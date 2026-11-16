import { jsonError } from "@/lib/admin";
import { isAdminRequest } from "@/lib/auth";
import { auditAdmin } from "@/lib/audit";
import { getDb } from "@/lib/db";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const id = Number((await params).id);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!Number.isSafeInteger(id) || !body) return jsonError("评论不存在。", 404);
  const db = getDb();
  let result;
  let action = "update";
  if (body.action === "restore") {
    result = db
      .prepare(
        `UPDATE comments
         SET deleted_at=NULL, deleted_by=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      )
      .run(id);
    action = "restore";
  } else if (typeof body.is_pinned === "boolean") {
    result = db
      .prepare("UPDATE comments SET is_pinned=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(body.is_pinned ? 1 : 0, id);
    action = body.is_pinned ? "pin" : "unpin";
  } else {
    const status = String(body.status || "");
    if (!["visible", "hidden"].includes(status)) return jsonError("评论状态不正确。");
    result = db
      .prepare("UPDATE comments SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(status, id);
    action = status === "visible" ? "show" : "hide";
  }
  if (!result.changes) return jsonError("评论不存在。", 404);
  auditAdmin(action, "comment", id);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) return jsonError("评论不存在。", 404);
  const permanent = new URL(request.url).searchParams.get("permanent") === "1";
  const db = getDb();
  const result = permanent
    ? db.prepare("DELETE FROM comments WHERE id=?").run(id)
    : db
        .prepare(
          `UPDATE comments
           SET deleted_at=CURRENT_TIMESTAMP, deleted_by='admin', updated_at=CURRENT_TIMESTAMP
           WHERE id=? AND deleted_at IS NULL`,
        )
        .run(id);
  if (!result.changes) return jsonError("评论不存在。", 404);
  auditAdmin(permanent ? "permanent-delete" : "soft-delete", "comment", id);
  return Response.json({ ok: true });
}
