import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { CommentAdminActions } from "@/components/admin/CommentAdminActions";
import { getAdminComments } from "@/lib/api/admin";
import { requireAdmin } from "@/lib/auth";
import { displayDateFilter } from "@/lib/date-filter";
import { formatUtcDateTime } from "@/lib/date-time";

type Query = {
  q?: string;
  status?: string;
  article?: string;
  user?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const {
    items: comments,
    total,
    page: currentPage,
    pages,
  } = await getAdminComments({
    q: query.q,
    status: query.status,
    article: query.article,
    user: query.user,
    from: query.from,
    to: query.to,
    page,
  });
  const exportQuery = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value && value !== "1") as [string, string][],
  ).toString();
  const pageHref = (target: number) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value) as [string, string][],
    );
    params.set("page", String(target));
    return `/admin/comments?${params}`;
  };

  return (
    <AdminShell>
      <h1>评论管理</h1>
      <div className="admin-filter-form admin-comment-filter">
        <form className="admin-comment-filter-search">
          <input name="q" defaultValue={query.q} placeholder="评论内容" />
          <input name="article" defaultValue={query.article} placeholder="文章标题或网址别名" />
          <input name="user" defaultValue={query.user} placeholder="用户名或显示名称" />
          <select name="status" defaultValue={query.status || "all"}>
            <option value="all">全部状态</option>
            <option value="visible">公开</option>
            <option value="hidden">隐藏</option>
            <option value="deleted">回收状态</option>
          </select>
          <label>
            从
            <input
              className="admin-date-filter"
              name="from"
              inputMode="numeric"
              defaultValue={displayDateFilter(query.from)}
              placeholder="年 / 月 / 日"
              aria-label="开始日期，年、月、日"
              title="例如：2026 / 09 / 20"
            />
          </label>
          <label>
            至
            <input
              className="admin-date-filter"
              name="to"
              inputMode="numeric"
              defaultValue={displayDateFilter(query.to)}
              placeholder="年 / 月 / 日"
              aria-label="结束日期，年、月、日"
              title="例如：2026 / 09 / 20"
            />
          </label>
          <button className="admin-button">筛选</button>
        </form>
        <form className="admin-comment-filter-clear" action="/admin/comments">
          <button className="admin-button">清空</button>
        </form>
      </div>
      <p className="admin-actions">
        共 {total} 条 ·{" "}
        <a href={`/api/v1/admin/comments/export?format=csv&${exportQuery}`}>导出 CSV</a>
        <a href={`/api/v1/admin/comments/export?format=json&${exportQuery}`}>导出 JSON</a>
      </p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>评论</th>
            <th>账号</th>
            <th>文章</th>
            <th>状态 / 操作</th>
          </tr>
        </thead>
        <tbody>
          {comments.map((comment) => (
            <tr key={comment.id}>
              <td>
                <p className="admin-comment-content">{comment.content}</p>
                <small>
                  {formatUtcDateTime(comment.created_at)}
                  {comment.edited_at ? " · 已编辑" : ""}
                </small>
              </td>
              <td>
                {comment.display_name}
                <br />
                <small>{comment.username}</small>
              </td>
              <td>
                <Link
                  href={`/articles/${comment.article_slug}#comment-${comment.id}`}
                  target="_blank"
                >
                  {comment.article_title}
                </Link>
              </td>
              <td>
                <p>
                  {comment.deleted_at
                    ? `已删除（${comment.deleted_by === "admin" ? "管理员" : "用户"}）`
                    : comment.status === "visible"
                      ? "公开"
                      : "已隐藏"}
                  {comment.is_pinned ? " · 已置顶" : ""}
                </p>
                <CommentAdminActions
                  id={comment.id}
                  status={comment.status}
                  pinned={Boolean(comment.is_pinned)}
                  deleted={Boolean(comment.deleted_at)}
                />
              </td>
            </tr>
          ))}
          {!comments.length ? (
            <tr>
              <td colSpan={4}>没有符合条件的评论。</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {pages > 1 ? (
        <nav className="pagination">
          {currentPage > 1 ? <Link href={pageHref(currentPage - 1)}>上一页</Link> : null}
          <span>
            第 {currentPage} / {pages} 页
          </span>
          {currentPage < pages ? <Link href={pageHref(currentPage + 1)}>下一页</Link> : null}
        </nav>
      ) : null}
    </AdminShell>
  );
}
