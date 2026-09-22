import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventOrderManager, type AdminEventRow } from "@/components/admin/EventOrderManager";
import { requireAdmin } from "@/lib/auth";
import { eventStatus, getEvents } from "@/lib/queries";

export default async function AdminEvents() {
  await requireAdmin();
  const events = getEvents();
  const rows: AdminEventRow[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    slug: event.slug,
    event_group: event.event_group,
    summary: event.summary,
    article_count: event.article_count || 0,
    is_featured: event.is_featured,
    status: eventStatus(event),
  }));
  return (
    <AdminShell>
      <div className="admin-actions">
        <h1>活动管理</h1>
        <Link className="old-button" href="/admin/events/new">
          新建活动
        </Link>
      </div>
      <EventOrderManager
        key={rows.map((row) => `${row.id}:${row.event_group}`).join("-")}
        initialRows={rows}
      />
    </AdminShell>
  );
}
