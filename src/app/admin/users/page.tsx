import { AdminShell } from "@/components/admin/AdminShell";
import { UserManager } from "@/components/admin/UserManager";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default async function AdminUsersPage() {
  await requireAdmin();
  const users = getDb()
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.admin_note, u.is_active,
              u.must_change_password, u.muted_until, u.mute_reason,
              u.last_login_at, u.created_at,
              COUNT(c.id) AS comment_count,
              COALESCE(ts.cookie_eaten, 0) AS cookie_eaten,
              COALESCE(ts.tea_drunk, 0) AS tea_drunk,
              COALESCE(ts.cookie_broken, 0) AS cookie_broken,
              COALESCE(ts.tea_broken, 0) AS tea_broken
       FROM users u
       LEFT JOIN comments c ON c.user_id = u.id
       LEFT JOIN user_treat_stats ts ON ts.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC, u.id DESC`,
    )
    .all() as {
    id: number;
    username: string;
    display_name: string;
    admin_note: string;
    is_active: number;
    must_change_password: number;
    muted_until: string | null;
    mute_reason: string;
    last_login_at: string | null;
    created_at: string;
    comment_count: number;
    cookie_eaten: number;
    tea_drunk: number;
    cookie_broken: number;
    tea_broken: number;
  }[];
  return (
    <AdminShell>
      <h1>评论账号</h1>
      <UserManager users={users} />
    </AdminShell>
  );
}
