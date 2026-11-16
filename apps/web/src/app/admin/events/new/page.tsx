import { AdminShell } from "@/components/admin/AdminShell";
import { EventForm } from "@/components/admin/EventForm";
import { requireAdmin } from "@/lib/auth";
export default async function NewEvent() {
  await requireAdmin();
  return (
    <AdminShell>
      <h1>新建活动</h1>
      <EventForm />
    </AdminShell>
  );
}
