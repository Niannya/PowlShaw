import { jsonError } from "@/lib/admin";
import { COMMENT_MAX_LENGTH } from "@/lib/comment-rules";
import { canEditComment, refreshCommentNotifications } from "@/lib/comments";
import { getDb } from "@/lib/db";
import { getUserFromRequest } from "@/lib/user-auth";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(request);
  if (!user) return jsonError("请先登录。", 401);
  if (user.must_change_password) return jsonError("请先修改初始密码。", 403);
  const id = Number((await params).id);
  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  const content = String(body?.content || "").trim();
  if (!Number.isSafeInteger(id)) return jsonError("评论不存在。", 404);
  if (!content) return jsonError("评论内容不能为空。");
  if (content.length > COMMENT_MAX_LENGTH) return jsonError("评论内容过长。");
  const db = getDb();
  const comment = db
    .prepare("SELECT user_id, created_at, deleted_at FROM comments WHERE id=?")
    .get(id) as { user_id: number; created_at: string; deleted_at: string | null } | undefined;
  if (!comment || comment.user_id !== user.id || comment.deleted_at) {
    return jsonError("评论不存在，或你无权编辑。", 404);
  }
  if (!canEditComment(comment.created_at)) {
    return jsonError("评论发表超过 30 分钟，不能再编辑。", 403);
  }
  db.transaction(() => {
    db.prepare(
      "UPDATE comments SET content=?, edited_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(content, id);
    refreshCommentNotifications(id, user.id);
  })();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(request);
  if (!user) return jsonError("请先登录。", 401);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) return jsonError("评论不存在。", 404);
  const db = getDb();
  const changed = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE comments
         SET deleted_at=CURRENT_TIMESTAMP, deleted_by='user', updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND user_id=? AND deleted_at IS NULL`,
      )
      .run(id, user.id);
    if (result.changes) db.prepare("DELETE FROM notifications WHERE comment_id=?").run(id);
    return result.changes;
  })();
  if (!changed) return jsonError("评论不存在，或你无权删除。", 404);
  return Response.json({ ok: true });
}
