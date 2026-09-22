import Link from "next/link";
import { UserLogoutButton } from "@/components/account/UserLogoutButton";
import { CommentActions } from "@/components/comments/CommentActions";
import { CommentForm } from "@/components/comments/CommentForm";
import { CommentText } from "@/components/comments/CommentText";
import { canEditComment, type Comment } from "@/lib/comments";
import type { PublicUser } from "@/lib/user-auth";

function commentTime(value: string) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function isCurrentlyMuted(user?: PublicUser) {
  if (!user?.muted_until) return false;
  const timestamp = new Date(`${user.muted_until.replace(" ", "T")}+08:00`).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function CommentItem({
  comment,
  articleId,
  user,
  canReply,
  isReply = false,
}: {
  comment: Comment;
  articleId: number;
  user?: PublicUser;
  canReply: boolean;
  isReply?: boolean;
}) {
  const deleted = Boolean(comment.deleted_at);
  return (
    <li
      id={`comment-${comment.id}`}
      className={`${isReply ? "comment-reply" : ""} ${comment.is_pinned ? "is-pinned" : ""}`}
    >
      <div className="comment-meta">
        <strong>{comment.display_name}</strong>
        <span>@{comment.username}</span>
        <time>{commentTime(comment.created_at)}</time>
        {comment.edited_at ? <span>已编辑</span> : null}
        {comment.is_pinned ? <b className="comment-pin">管理员置顶</b> : null}
      </div>
      {deleted ? (
        <p className="deleted-comment">
          {comment.deleted_by === "admin" ? "该评论已被管理员删除。" : "该评论已由用户删除。"}
        </p>
      ) : (
        <CommentText>{comment.content}</CommentText>
      )}
      {!deleted ? (
        <CommentActions
          articleId={articleId}
          commentId={comment.id}
          content={comment.content}
          owned={user?.id === comment.user_id}
          editable={canEditComment(comment.created_at)}
          replyable={canReply}
        />
      ) : null}
      {comment.replies.length ? (
        <ol className="comment-replies">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              articleId={articleId}
              user={user}
              canReply={canReply}
              isReply
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export function CommentSection({
  articleId,
  articleSlug,
  comments,
  totalComments,
  page,
  pages,
  sort,
  mode,
  user,
}: {
  articleId: number;
  articleSlug: string;
  comments: Comment[];
  totalComments: number;
  page: number;
  pages: number;
  sort: "oldest" | "newest";
  mode: "open" | "closed";
  user?: PublicUser;
}) {
  const returnPath = `/articles/${encodeURIComponent(articleSlug)}`;
  const muted = isCurrentlyMuted(user);
  const canPost = Boolean(user && !user.must_change_password && !muted && mode === "open");
  const pageHref = (targetPage: number) =>
    `${returnPath}?commentPage=${targetPage}&commentSort=${sort}#comments-title`;

  return (
    <section className="comments-section" aria-labelledby="comments-title">
      <div className="comments-heading-row">
        <h2 id="comments-title">评论（{totalComments}）</h2>
        <span>
          <Link
            className={sort === "oldest" ? "is-current" : ""}
            href={`${returnPath}?commentSort=oldest#comments-title`}
          >
            最早优先
          </Link>
          {" · "}
          <Link
            className={sort === "newest" ? "is-current" : ""}
            href={`${returnPath}?commentSort=newest#comments-title`}
          >
            最新优先
          </Link>
        </span>
      </div>
      {comments.length ? (
        <ol className="comment-list">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              articleId={articleId}
              user={user}
              canReply={canPost}
            />
          ))}
        </ol>
      ) : (
        <p className="muted-note">还没有评论。</p>
      )}

      {pages > 1 ? (
        <nav className="comment-pagination" aria-label="评论分页">
          {page > 1 ? <Link href={pageHref(page - 1)}>上一页</Link> : <span>上一页</span>}
          <span>
            第 {page} / {pages} 页
          </span>
          {page < pages ? <Link href={pageHref(page + 1)}>下一页</Link> : <span>下一页</span>}
        </nav>
      ) : null}

      {user ? (
        <>
          <p className="comment-identity">
            以 <strong>{user.display_name}</strong> 的身份评论 · <UserLogoutButton />
          </p>
          {user.must_change_password ? (
            <p className="comment-login-note">
              <Link href={`/account?first=1&next=${encodeURIComponent(returnPath)}`}>
                请先修改初始密码
              </Link>
            </p>
          ) : muted ? (
            <p className="comment-login-note">
              账号已被禁言至 {user.muted_until}
              {user.mute_reason ? `：${user.mute_reason}` : ""}
            </p>
          ) : mode === "closed" ? (
            <p className="comment-login-note">这篇文章的评论已经关闭。</p>
          ) : (
            <CommentForm articleId={articleId} />
          )}
        </>
      ) : (
        <p className="comment-login-note">
          <Link href={`/login?next=${encodeURIComponent(returnPath)}`}>登录后发表评论</Link>
          <br />
          <small>本站不开放注册；如需账号，请联系管理员。</small>
        </p>
      )}
    </section>
  );
}
