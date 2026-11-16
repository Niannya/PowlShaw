import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../middleware/session";
import { jsonError } from "../lib/api-response";
import { get, run, transaction } from "../db/sql";
import { COMMENT_COOLDOWN_SECONDS, COMMENT_MAX_LENGTH } from "@/lib/comment-rules";
import { canEditComment, refreshCommentNotifications } from "../lib/comments";

/**
 * 评论路由（挂在 `/api/v1/comments`）。
 * `PUT` 为旧契约，同时接受 `PATCH` 作为别名。
 */
export const commentRoutes = new Hono<AppEnv>();

commentRoutes.post("/", async (c) => {
  const user = c.get("user");
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

  const body = (await c.req.json().catch(() => null)) as {
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

  const article = await get<{ id: number; comments_mode: string }>(
    "SELECT id, comments_mode FROM articles WHERE id = ? AND status = 'published'",
    [articleId],
  );
  if (!article) return jsonError("文章不存在。", 404);
  if (article.comments_mode !== "open") return jsonError("这篇文章目前不接受新评论。", 403);

  let parentId: number | null = null;
  let requestedParentUserId: number | undefined;
  if (requestedParentId) {
    const parent = await get<{ id: number; parent_id: number | null; user_id: number }>(
      `SELECT id, parent_id, user_id FROM comments
       WHERE id=? AND article_id=? AND status='visible' AND deleted_at IS NULL`,
      [requestedParentId, articleId],
    );
    if (!parent) return jsonError("要回复的评论不存在。", 404);
    parentId = parent.parent_id || parent.id;
    requestedParentUserId = parent.user_id;
  }

  const latest = await get<{ created_at: string }>(
    "SELECT created_at FROM comments WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [user.id],
  );
  if (latest) {
    const createdAt = Date.parse(`${latest.created_at.replace(" ", "T")}Z`);
    if (Number.isFinite(createdAt) && Date.now() - createdAt < COMMENT_COOLDOWN_SECONDS * 1000) {
      return jsonError(`请等待 ${COMMENT_COOLDOWN_SECONDS} 秒再发表评论。`, 429);
    }
  }

  const id = await transaction(async () => {
    const result = await run(
      "INSERT INTO comments(article_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)",
      [articleId, user.id, parentId, content],
    );
    const commentId = result.lastInsertRowid;
    await refreshCommentNotifications(commentId, user.id);
    if (
      requestedParentUserId &&
      requestedParentUserId !== user.id &&
      requestedParentId !== parentId
    ) {
      await run(
        `INSERT OR IGNORE INTO notifications(user_id, actor_user_id, comment_id, type)
         VALUES (?, ?, ?, 'reply')`,
        [requestedParentUserId, user.id, commentId],
      );
    }
    return commentId;
  });

  return Response.json({ ok: true, id }, { status: 201 });
});

async function updateComment(c: Context<AppEnv>) {
  const user = c.get("user");
  if (!user) return jsonError("请先登录。", 401);
  if (user.must_change_password) return jsonError("请先修改初始密码。", 403);
  const id = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => null)) as { content?: unknown } | null;
  const content = String(body?.content || "").trim();
  if (!Number.isSafeInteger(id)) return jsonError("评论不存在。", 404);
  if (!content) return jsonError("评论内容不能为空。");
  if (content.length > COMMENT_MAX_LENGTH) return jsonError("评论内容过长。");

  const comment = await get<{ user_id: number; created_at: string; deleted_at: string | null }>(
    "SELECT user_id, created_at, deleted_at FROM comments WHERE id=?",
    [id],
  );
  if (!comment || comment.user_id !== user.id || comment.deleted_at) {
    return jsonError("评论不存在，或你无权编辑。", 404);
  }
  if (!canEditComment(comment.created_at)) {
    return jsonError("评论发表超过 30 分钟，不能再编辑。", 403);
  }
  await transaction(async () => {
    await run(
      "UPDATE comments SET content=?, edited_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [content, id],
    );
    await refreshCommentNotifications(id, user.id);
  });
  return Response.json({ ok: true });
}

commentRoutes.put("/:id", updateComment);
commentRoutes.patch("/:id", updateComment);

commentRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return jsonError("请先登录。", 401);
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id)) return jsonError("评论不存在。", 404);

  const changed = await transaction(async () => {
    const result = await run(
      `UPDATE comments
       SET deleted_at=CURRENT_TIMESTAMP, deleted_by='user', updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND user_id=? AND deleted_at IS NULL`,
      [id, user.id],
    );
    if (result.changes) await run("DELETE FROM notifications WHERE comment_id=?", [id]);
    return result.changes;
  });
  if (!changed) return jsonError("评论不存在，或你无权删除。", 404);
  return Response.json({ ok: true });
});
