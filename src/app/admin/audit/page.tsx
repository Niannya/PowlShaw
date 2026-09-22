import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatUtcDateTime } from "@/lib/date-time";

export default async function AdminAuditPage() {
  await requireAdmin();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, action, target_type, target_id, details, created_at
       FROM admin_audit_log ORDER BY created_at DESC, id DESC LIMIT 1000`,
    )
    .all() as {
    id: number;
    action: string;
    target_type: string;
    target_id: number | null;
    details: string;
    created_at: string;
  }[];
  const revisions = db
    .prepare(
      `SELECT id, target_type, target_id, action, length(snapshot_json) AS snapshot_size, created_at
       FROM content_revisions ORDER BY created_at DESC, id DESC LIMIT 100`,
    )
    .all() as {
    id: number;
    target_type: string;
    target_id: number;
    action: string;
    snapshot_size: number;
    created_at: string;
  }[];
  return (
    <AdminShell>
      <h1>操作记录</h1>
      <p>记录内容、账号、评论和导出等管理操作，最多显示最近 1000 条。</p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>操作</th>
            <th>对象</th>
            <th>细节</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatUtcDateTime(row.created_at)}</td>
              <td>{row.action}</td>
              <td>
                {row.target_type} {row.target_id || ""}
              </td>
              <td className="audit-details">{row.details}</td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={4}>暂无操作记录。</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <h2>内容快照</h2>
      <p>
        新建、修改或删除文章、活动时会保存恢复用快照。这里显示最近 100
        条；快照保存在数据库中，不会公开到前台。
      </p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>动作</th>
            <th>对象</th>
            <th>快照大小</th>
          </tr>
        </thead>
        <tbody>
          {revisions.map((revision) => (
            <tr key={revision.id}>
              <td>{formatUtcDateTime(revision.created_at)}</td>
              <td>{revision.action}</td>
              <td>
                {revision.target_type} {revision.target_id}
              </td>
              <td>{Math.max(1, Math.ceil(revision.snapshot_size / 1024))} KB</td>
            </tr>
          ))}
          {!revisions.length ? (
            <tr>
              <td colSpan={4}>从下一次内容改动开始记录快照。</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </AdminShell>
  );
}
