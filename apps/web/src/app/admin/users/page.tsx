import { AdminShell } from "@/components/admin/AdminShell";
import { UserManager } from "@/components/admin/UserManager";
import { getAdminUsers } from "@/lib/api/admin";
import { requireAdmin } from "@/lib/auth";

export default async function AdminUsersPage() {
  await requireAdmin();
  const users = await getAdminUsers();
  return (
    <AdminShell>
      <h1>评论账号</h1>
      <UserManager users={users} />
    </AdminShell>
  );
}
