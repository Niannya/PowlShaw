import { AdminShell } from "@/components/admin/AdminShell";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default async function NewArticle({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  await requireAdmin();
  const db = getDb();
  const requestedEventId = Number((await searchParams).event);
  const events = db
    .prepare("SELECT id,title FROM events ORDER BY starts_at DESC")
    .all() as unknown as { id: number; title: string }[];
  const selectedEvent = events.find((event) => event.id === requestedEventId);
  return (
    <AdminShell>
      <h1>{selectedEvent ? `为“${selectedEvent.title}”添加新文章` : "新建文章"}</h1>
      <ArticleForm
        initial={selectedEvent ? { event_ids: [selectedEvent.id] } : {}}
        events={events}
        returnPath={selectedEvent ? `/admin/events/${selectedEvent.id}` : "/admin/articles"}
      />
    </AdminShell>
  );
}
