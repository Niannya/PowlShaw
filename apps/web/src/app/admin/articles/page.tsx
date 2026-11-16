import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { getAdminArticleList } from "@/lib/api/admin";
import type { AdminArticleRow as Row } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/content";

type Query = { q?: string; event?: string; page?: string };

export default async function AdminArticles({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const keyword = String(query.q || "").trim();
  const eventId = Number(query.event);
  const eventFilter = Number.isSafeInteger(eventId) && eventId > 0;
  const requestedPage = Math.max(1, Number(query.page) || 1);
  const { rows, events, total, page, pages } = await getAdminArticleList({
    q: keyword,
    eventId: eventFilter ? eventId : undefined,
    page: requestedPage,
  });
  const groups = new Map<string, { title: string; total: number; rows: Row[] }>();
  for (const row of rows) {
    const key = row.event_id ? String(row.event_id) : "standalone";
    const group = groups.get(key) || {
      title: row.event_title || "未归入活动",
      total: row.group_count,
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  const expandGroups = Boolean(keyword || eventFilter);
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (eventFilter) params.set("event", String(eventId));
    params.set("page", String(target));
    return `/admin/articles?${params}`;
  };

  return (
    <AdminShell>
      <div className="admin-actions">
        <h1 style={{ marginRight: "auto" }}>文章管理</h1>
        <Link className="old-button" href="/admin/articles/new">
          新建文章
        </Link>
      </div>

      <div className="admin-filter-form admin-article-filter">
        <form className="admin-article-filter-search" action="/admin/articles">
          <label>
            <span className="visually-hidden">搜索文章</span>
            <input name="q" defaultValue={keyword} placeholder="搜索标题或网址别名" />
          </label>
          <label>
            <span className="visually-hidden">按活动筛选</span>
            <select name="event" defaultValue={eventFilter ? String(eventId) : ""}>
              <option value="">全部活动</option>
              {events.map((event) => (
                <option value={event.id} key={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>
          <button className="admin-button">搜索</button>
        </form>
        <form className="admin-article-filter-clear" action="/admin/articles">
          <button className="admin-button">清空</button>
        </form>
        <span className="admin-filter-count">找到 {total} 篇文章</span>
      </div>

      <div className="admin-article-groups">
        {[...groups.entries()].map(([key, group], index) => (
          <details className="admin-article-group" open={expandGroups} key={key}>
            <summary className={index % 2 ? "pink" : "blue"}>
              <strong>{group.title}</strong>
              <small>{group.total} 篇</small>
            </summary>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>状态</th>
                  <th>日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{row.status === "published" ? "已发布" : "草稿"}</td>
                    <td>{formatDate(row.published_at)}</td>
                    <td>
                      <div className="admin-actions">
                        <Link href={`/admin/articles/${row.id}`}>编辑</Link>
                        {row.status === "published" ? (
                          <Link href={`/articles/${row.slug}`} target="_blank">
                            查看
                          </Link>
                        ) : null}
                        <DeleteButton endpoint={`/api/v1/admin/articles/${row.id}`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
        {!groups.size ? <p className="empty-note">没有找到符合条件的文章。</p> : null}
      </div>
      {pages > 1 ? (
        <nav className="pagination">
          {page > 1 ? <Link href={pageHref(page - 1)}>上一页</Link> : <span />}
          <span>
            第 {page} / {pages} 页
          </span>
          {page < pages ? <Link href={pageHref(page + 1)}>下一页</Link> : <span />}
        </nav>
      ) : null}
    </AdminShell>
  );
}
