import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/content";
import { getDb } from "@/lib/db";
import { containsLike } from "@/lib/db-search";

type Query = { q?: string; event?: string; page?: string };
type Row = {
  id: number;
  title: string;
  slug: string;
  status: string;
  published_at: string | null;
  event_id: number | null;
  event_title: string | null;
  group_count: number;
};
type EventOption = { id: number; title: string };

export default async function AdminArticles({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const keyword = String(query.q || "").trim();
  const eventId = Number(query.event);
  const eventFilter = Number.isSafeInteger(eventId) && eventId > 0;
  const requestedPage = Math.max(1, Number(query.page) || 1);
  const perPage = 100;
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (keyword) {
    clauses.push("(a.title LIKE ? ESCAPE '\\' OR a.slug LIKE ? ESCAPE '\\')");
    const value = containsLike(keyword);
    values.push(value, value);
  }
  if (eventFilter) {
    clauses.push(
      "EXISTS(SELECT 1 FROM event_articles filter_ea WHERE filter_ea.article_id=a.id AND filter_ea.event_id=?)",
    );
    values.push(eventId);
  }

  const db = getDb();
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM articles a ${where}`).get(...values) as {
      count: number;
    }
  ).count;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(requestedPage, pages);
  const rows = db
    .prepare(
      `SELECT a.id, a.title, a.slug, a.status, a.published_at,
              e.id AS event_id, e.title AS event_title,
              COUNT(*) OVER (PARTITION BY e.id) AS group_count
       FROM articles a
       LEFT JOIN event_articles ea ON ea.article_id = a.id
         AND ea.event_id = COALESCE(
           ${eventFilter ? "?" : "NULL"},
           (SELECT ea2.event_id
            FROM event_articles ea2 JOIN events e2 ON e2.id=ea2.event_id
            WHERE ea2.article_id=a.id
            ORDER BY e2.sort_order, e2.id LIMIT 1)
         )
       LEFT JOIN events e ON e.id = ea.event_id
       ${where}
       ORDER BY CASE WHEN e.id IS NULL THEN 1 ELSE 0 END,
                e.sort_order, a.published_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...(eventFilter ? [eventId] : []), ...values, perPage, (page - 1) * perPage) as Row[];
  const events = db
    .prepare("SELECT id, title FROM events ORDER BY sort_order, starts_at DESC, id DESC")
    .all() as EventOption[];
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
                        <DeleteButton endpoint={`/api/admin/articles/${row.id}`} />
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
