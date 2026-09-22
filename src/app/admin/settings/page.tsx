import { AdminShell } from "@/components/admin/AdminShell";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings";

export default async function SiteSettingsPage() {
  await requireAdmin();
  const settings = getSiteSettings();
  return (
    <AdminShell>
      <h1>站点设置</h1>
      <SiteSettingsForm initial={settings} />
    </AdminShell>
  );
}
