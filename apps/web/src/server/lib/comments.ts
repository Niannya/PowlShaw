import { all, get, run } from "../db/sql";

export const COMMENTS_PER_PAGE = 30;
export const COMMENT_EDIT_MINUTES = 30;

export type Comment = {
  id: number;
  article_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  status: "visible" | "hidden";
  is_pinned: number;
  edited_at: string | null;
  deleted_at: string | null;
  deleted_by: "user" | "admin" | null;
  created_at: string;
  display_name: string;
  username: string;
  replies: Comment[];
};

type CommentRow = Omit<Comment, "replies">;

const publicSelect = `
  SELECT c.id, c.article_id, c.user_id, c.parent_id, c.content, c.status,
         c.is_pinned, c.edited_at, c.deleted_at, c.deleted_by, c.created_at,
         u.display_name, u.username
  FROM comments c
  JOIN users u ON u.id = c.user_id
`;

export async function getCommentsPage(
  articleId: number,
  page = 1,
  sort: "oldest" | "newest" = "oldest",
) {
  const rootCountRow = await get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM comments
     WHERE article_id=? AND parent_id IS NULL AND status='visible'`,
    [articleId],
  );
  const totalRow = await get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM comments WHERE article_id=? AND status='visible'",
    [articleId],
  );
  const rootCount = Number(rootCountRow?.count ?? 0);
  const totalComments = Number(totalRow?.count ?? 0);
  const pages = Math.max(1, Math.ceil(rootCount / COMMENTS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), pages);
  const direction = sort === "newest" ? "DESC" : "ASC";
  const roots = await all<CommentRow>(
    `${publicSelect}
     WHERE c.article_id=? AND c.parent_id IS NULL AND c.status='visible'
     ORDER BY c.is_pinned DESC, c.created_at ${direction}, c.id ${direction}
     LIMIT ? OFFSET ?`,
    [articleId, COMMENTS_PER_PAGE, (currentPage - 1) * COMMENTS_PER_PAGE],
  );

  const rootIds = roots.map((item) => item.id);
  const replies = rootIds.length
    ? await all<CommentRow>(
        `${publicSelect}
         WHERE c.parent_id IN (${rootIds.map(() => "?").join(",")})
           AND c.status='visible'
         ORDER BY c.created_at ASC, c.id ASC`,
        rootIds,
      )
    : [];
  const repliesByRoot = new Map<number, Comment[]>();
  for (const reply of replies) {
    const items = repliesByRoot.get(reply.parent_id || 0) || [];
    items.push({ ...reply, replies: [] });
    repliesByRoot.set(reply.parent_id || 0, items);
  }
  return {
    comments: roots.map((root) => ({ ...root, replies: repliesByRoot.get(root.id) || [] })),
    page: currentPage,
    pages,
    totalComments,
    sort,
  };
}

export async function commentPageForId(
  articleId: number,
  commentId: number,
  sort: "oldest" | "newest",
) {
  const target = await get<{ id: number; parent_id: number | null }>(
    "SELECT id, parent_id FROM comments WHERE id=? AND article_id=? AND status='visible'",
    [commentId, articleId],
  );
  if (!target) return 1;
  const rootId = target.parent_id || target.id;
  const direction = sort === "newest" ? "DESC" : "ASC";
  const ids = await all<{ id: number }>(
    `SELECT id FROM comments
     WHERE article_id=? AND parent_id IS NULL AND status='visible'
     ORDER BY is_pinned DESC, created_at ${direction}, id ${direction}`,
    [articleId],
  );
  const index = ids.findIndex((item) => item.id === rootId);
  return index < 0 ? 1 : Math.floor(index / COMMENTS_PER_PAGE) + 1;
}

function mentionedUsernames(content: string) {
  return [...content.matchAll(/@([\p{L}\p{N}_-]{3,32})/gu)].map((match) => match[1]);
}

/**
 * 重新计算一条评论产生的通知（回复 + @ 提及）。
 * 由评论创建/编辑在同一事务内调用。
 */
export async function refreshCommentNotifications(commentId: number, actorUserId: number) {
  const comment = await get<{ parent_id: number | null; content: string }>(
    "SELECT parent_id, content FROM comments WHERE id=?",
    [commentId],
  );
  if (!comment) return;
  await run("DELETE FROM notifications WHERE comment_id=? AND type='mention'", [commentId]);

  let replyUserId: number | undefined;
  if (comment.parent_id) {
    const parent = await get<{ user_id: number }>("SELECT user_id FROM comments WHERE id=?", [
      comment.parent_id,
    ]);
    replyUserId = parent?.user_id;
    if (replyUserId && replyUserId !== actorUserId) {
      await run(
        `INSERT OR IGNORE INTO notifications(user_id, actor_user_id, comment_id, type)
         VALUES (?, ?, ?, 'reply')`,
        [replyUserId, actorUserId, commentId],
      );
    }
  }

  const names = [...new Set(mentionedUsernames(comment.content))];
  if (!names.length) return;
  for (const name of names) {
    const mentioned = await get<{ id: number }>(
      "SELECT id FROM users WHERE username=? AND is_active=1",
      [name],
    );
    if (!mentioned || mentioned.id === actorUserId || mentioned.id === replyUserId) continue;
    await run(
      `INSERT OR IGNORE INTO notifications(user_id, actor_user_id, comment_id, type)
       VALUES (?, ?, ?, 'mention')`,
      [mentioned.id, actorUserId, commentId],
    );
  }
}

/** 评论发表后 30 分钟内可编辑（时间以 SQLite 的 UTC 存储格式为准）。 */
export function canEditComment(createdAt: string) {
  const timestamp = Date.parse(`${createdAt.replace(" ", "T")}Z`);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= COMMENT_EDIT_MINUTES * 60 * 1000;
}
