import { getDb } from "@/lib/db";

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

export function getCommentsPage(articleId: number, page = 1, sort: "oldest" | "newest" = "oldest") {
  const db = getDb();
  const rootCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM comments
         WHERE article_id=? AND parent_id IS NULL AND status='visible'`,
      )
      .get(articleId) as { count: number }
  ).count;
  const totalComments = (
    db
      .prepare("SELECT COUNT(*) AS count FROM comments WHERE article_id=? AND status='visible'")
      .get(articleId) as { count: number }
  ).count;
  const pages = Math.max(1, Math.ceil(rootCount / COMMENTS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), pages);
  const direction = sort === "newest" ? "DESC" : "ASC";
  const roots = db
    .prepare(
      `${publicSelect}
       WHERE c.article_id=? AND c.parent_id IS NULL AND c.status='visible'
       ORDER BY c.is_pinned DESC, c.created_at ${direction}, c.id ${direction}
       LIMIT ? OFFSET ?`,
    )
    .all(articleId, COMMENTS_PER_PAGE, (currentPage - 1) * COMMENTS_PER_PAGE) as CommentRow[];

  const rootIds = roots.map((item) => item.id);
  const replies = rootIds.length
    ? (db
        .prepare(
          `${publicSelect}
           WHERE c.parent_id IN (${rootIds.map(() => "?").join(",")})
             AND c.status='visible'
           ORDER BY c.created_at ASC, c.id ASC`,
        )
        .all(...rootIds) as CommentRow[])
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

export function commentPageForId(articleId: number, commentId: number, sort: "oldest" | "newest") {
  const db = getDb();
  const target = db
    .prepare("SELECT id, parent_id FROM comments WHERE id=? AND article_id=? AND status='visible'")
    .get(commentId, articleId) as { id: number; parent_id: number | null } | undefined;
  if (!target) return 1;
  const rootId = target.parent_id || target.id;
  const direction = sort === "newest" ? "DESC" : "ASC";
  const ids = db
    .prepare(
      `SELECT id FROM comments
       WHERE article_id=? AND parent_id IS NULL AND status='visible'
       ORDER BY is_pinned DESC, created_at ${direction}, id ${direction}`,
    )
    .all(articleId) as { id: number }[];
  const index = ids.findIndex((item) => item.id === rootId);
  return index < 0 ? 1 : Math.floor(index / COMMENTS_PER_PAGE) + 1;
}

function mentionedUsernames(content: string) {
  return [...content.matchAll(/@([\p{L}\p{N}_-]{3,32})/gu)].map((match) => match[1]);
}

export function refreshCommentNotifications(commentId: number, actorUserId: number) {
  const db = getDb();
  const comment = db
    .prepare("SELECT parent_id, content FROM comments WHERE id=?")
    .get(commentId) as { parent_id: number | null; content: string } | undefined;
  if (!comment) return;
  db.prepare("DELETE FROM notifications WHERE comment_id=? AND type='mention'").run(commentId);

  let replyUserId: number | undefined;
  if (comment.parent_id) {
    const parent = db.prepare("SELECT user_id FROM comments WHERE id=?").get(comment.parent_id) as
      { user_id: number } | undefined;
    replyUserId = parent?.user_id;
    if (replyUserId && replyUserId !== actorUserId) {
      db.prepare(
        `INSERT OR IGNORE INTO notifications(user_id, actor_user_id, comment_id, type)
         VALUES (?, ?, ?, 'reply')`,
      ).run(replyUserId, actorUserId, commentId);
    }
  }

  const names = [...new Set(mentionedUsernames(comment.content))];
  if (!names.length) return;
  const findUser = db.prepare("SELECT id FROM users WHERE username=? AND is_active=1");
  const insert = db.prepare(
    `INSERT OR IGNORE INTO notifications(user_id, actor_user_id, comment_id, type)
     VALUES (?, ?, ?, 'mention')`,
  );
  for (const name of names) {
    const mentioned = findUser.get(name) as { id: number } | undefined;
    if (!mentioned || mentioned.id === actorUserId || mentioned.id === replyUserId) continue;
    insert.run(mentioned.id, actorUserId, commentId);
  }
}

export function canEditComment(createdAt: string) {
  const timestamp = Date.parse(`${createdAt.replace(" ", "T")}Z`);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= COMMENT_EDIT_MINUTES * 60 * 1000;
}
