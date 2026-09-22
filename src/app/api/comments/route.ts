import { jsonError } from "@/lib/admin";
import { COMMENT_COOLDOWN_SECONDS, COMMENT_MAX_LENGTH } from "@/lib/comment-rules";
import { refreshCommentNotifications } from "@/lib/comments";
import { getDb } from "@/lib/db";
import { getUserFromRequest } from "@/lib/user-auth";

export async function POST(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) return jsonError("请先登录。", 401);
  if (user.must_change_password) return jsonError("请先到账号中心修改初始密码。", 403);
  if (user.muted_until) {
    const mutedUntil = new Date(`${user.muted_until.replace(" ", "T")}+08:00`).getTime();
    if (Number.isFinite(mutedUntil) && mutedUntil > Date.now()) {
      return jsonError(
        `账号已被禁言至 ${user.muted_until}${user.mute_reason ? `：${user.mute_reason}` : ""}`,
        403,
      );
    }
  }

  const body = (await request.json().catch(() => null)) as {
    article_id?: unknown;
    parent_id?: unknown;
    content?: unknown;
  } | null;
  const articleId = Number(body?.article_id);
  const requestedParentId = Number(body?.parent_id || 0);
  const content = String(body?.content || "").trim();
  if (!Number.isSafeInteger(articleId) || articleId < 1) return jsonError("文章不存在。", 404);
  if (!content) return jsonError("请填写评论内容。");
  if (content.length > COMMENT_MAX_LENGTH) {
    return jsonError(`评论不能超过 ${COMMENT_MAX_LENGTH} 个字符。`);
  }

  const db = getDb();
  const article = db
    .prepare("SELECT id, comments_mode FROM articles WHERE id = ? AND status = 'published'")
    .get(articleId) as { id: number; comments_mode: string } | undefined;
  if (!article) return jsonError("文章不存在。", 404);
  if (article.comments_mode !== "open") return jsonError("这篇文章目前不接受新评论。", 403);

  let parentId: number | null = null;
  let requestedParentUserId: number | undefined;
  if (requestedParentId) {
    const parent = db
      .prepare(
        `SELECT id, parent_id, user_id FROM comments
         WHERE id=? AND article_id=? AND status='visible' AND deleted_at IS NULL`,
      )
      .get(requestedParentId, articleId) as
      { id: number; parent_id: number | null; user_id: number } | undefined;
    if (!parent) return jsonError("要回复的评论不存在。", 404);
    parentId = parent.parent_id || parent.id;
    requestedParentUserId = parent.user_id;
  }

  const latest = db
    .prepare("SELECT created_at FROM comments WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .get(user.id) as { created_at: string } | undefined;
  if (latest) {
    const createdAt = Date.parse(`${latest.created_at.replace(" ", "T")}Z`);
    if (Number.isFinite(createdAt) && Date.now() - createdAt < COMMENT_COOLDOWN_SECONDS * 1000) {
      return jsonError(`请等待 ${COMMENT_COOLDOWN_SECONDS} 秒再发表评论。`, 429);
    }
  }

  let id = 0;
  db.transaction(() => {
    const result = db
      .prepare("INSERT INTO comments(article_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)")
      .run(articleId, user.id, parentId, content);
    id = Number(result.lastInsertRowid);
    refreshCommentNotifications(id, user.id);
    if (
      requestedParentUserId &&
      requestedParentUserId !== user.id &&
      requestedParentId !== parentId
    ) {
      db.prepare(
        `INSERT OR IGNORE INTO notifications(user_id, actor_user_id, comment_id, type)
         VALUES (?, ?, ?, 'reply')`,
      ).run(requestedParentUserId, user.id, id);
    }
  })();
  return Response.json({ ok: true, id }, { status: 201 });
}
