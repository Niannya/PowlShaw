import { AdminShell } from "@/components/admin/AdminShell";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { getAdminEventOptions } from "@/lib/api/admin";
import { requireAdmin } from "@/lib/auth";

export default async function NewArticle({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  await requireAdmin();
  const requestedEventId = Number((await searchParams).event);
  const events = await getAdminEventOptions();
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
