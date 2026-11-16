import { AdminShell } from "@/components/admin/AdminShell";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { getAdminSettings } from "@/lib/api/admin";
import { requireAdmin } from "@/lib/auth";

export default async function SiteSettingsPage() {
  await requireAdmin();
  const settings = await getAdminSettings();
  return (
    <AdminShell>
      <h1>站点设置</h1>
      <SiteSettingsForm initial={settings} />
    </AdminShell>
  );
}
