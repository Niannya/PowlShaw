import { AdminPasswordForm } from "@/components/admin/AdminPasswordForm";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminUsername, requireAdmin } from "@/lib/auth";

export default async function AdminSecurityPage() {
  await requireAdmin();
  const username = await getAdminUsername();
  return (
    <AdminShell>
      <h1>后台安全</h1>
      <p>管理员用户名：{username}</p>
      <AdminPasswordForm />
    </AdminShell>
  );
}
