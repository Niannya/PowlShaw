import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatUtcDateTime } from "@/lib/date-time";

function IndexLink({
  number,
  label,
  detail,
  count,
  unit,
  href,
}: {
  number: string;
  label: string;
  detail: string;
  count: number;
  unit: string;
  href: string;
}) {
  return (
    <Link className="admin-index-link" href={href}>
      <span className="admin-index-number">{number}</span>
      <span className="admin-index-description">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="admin-index-count">
        <strong>{count}</strong>
        <small>{unit}</small>
      </span>
      <span className="admin-index-arrow" aria-hidden="true">
        ↗
      </span>
    </Link>
  );
}

export default async function AdminPage() {
  await requireAdmin();
  const db = getDb();
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  const recentArticles = db
    .prepare(
      `SELECT id, title, status, updated_at
       FROM articles ORDER BY updated_at DESC, id DESC LIMIT 6`,
    )
    .all() as { id: number; title: string; status: string; updated_at: string }[];

  return (
    <AdminShell>
      <div className="admin-dashboard">
        <header className="admin-dashboard-hero">
          <p>PX / ARCHIVE DESK · 01</p>
          <h1>内容概览</h1>
          <span>从这里整理作品、活动与站内往来。</span>
        </header>

        <div className="admin-dashboard-columns">
          <div>
            <section className="admin-dashboard-panel">
              <div className="admin-dashboard-panel-title yellow">
                <h2>作品档案</h2>
                <small>CONTENT INDEX</small>
              </div>
              <IndexLink
                number="01"
                label="文章"
                detail="编辑、发布与归档作品"
                count={count("articles")}
                unit="篇"
                href="/admin/articles"
              />
              <IndexLink
                number="02"
                label="活动"
                detail="专题、顺序与参与作品"
                count={count("events")}
                unit="个"
                href="/admin/events"
              />
            </section>

            <section className="admin-dashboard-panel">
              <div className="admin-dashboard-panel-title blue">
                <h2>最近整理</h2>
                <small>RECENTLY UPDATED</small>
              </div>
              {recentArticles.length ? (
                <ul className="admin-recent-list">
                  {recentArticles.map((article) => (
                    <li key={article.id}>
                      <Link href={`/admin/articles/${article.id}`}>{article.title}</Link>
                      <span>{article.status === "published" ? "已发布" : "草稿"}</span>
                      <time>{formatUtcDateTime(article.updated_at).slice(0, 10)}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-dashboard-empty">还没有文章记录。</p>
              )}
            </section>
          </div>

          <div>
            <section className="admin-dashboard-panel">
              <div className="admin-dashboard-panel-title coral">
                <h2>往来与账户</h2>
                <small>COMMUNITY</small>
              </div>
              <Link className="admin-side-link" href="/admin/comments">
                <span>评论管理</span>
                <strong>{count("comments")} 条</strong>
              </Link>
              <Link className="admin-side-link" href="/admin/users">
                <span>评论账号</span>
                <strong>{count("users")} 个</strong>
              </Link>
            </section>

            <section className="admin-dashboard-panel">
              <div className="admin-dashboard-panel-title green">
                <h2>站点维护</h2>
                <small>HOUSEKEEPING</small>
              </div>
              <Link className="admin-side-link" href="/admin/settings">
                <span>首页公告</span>
                <span>↗</span>
              </Link>
              <Link className="admin-side-link" href="/admin/security">
                <span>后台安全</span>
                <span>↗</span>
              </Link>
              <Link className="admin-side-link" href="/admin/audit">
                <span>操作记录</span>
                <span>↗</span>
              </Link>
            </section>

            <div className="admin-archive-note">
              <span>附件线索 / MEDIA INDEX</span>
              <strong>{count("media")}</strong>
              <p>条旧附件记录等待恢复图片。</p>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
