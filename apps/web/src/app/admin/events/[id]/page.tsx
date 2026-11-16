import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventForm } from "@/components/admin/EventForm";
import { EventArticleManager } from "@/components/admin/EventArticleManager";
import { EventDocumentManager } from "@/components/admin/EventDocumentManager";
import { EventMapSettingsForm } from "@/components/admin/EventMapSettingsForm";
import { EventMapSnapshotManager } from "@/components/admin/EventMapSnapshotManager";
import { getAdminEventDetail } from "@/lib/api/admin";
import { requireAdmin } from "@/lib/auth";

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const data = await getAdminEventDetail(id);
  if (!data) notFound();
  const { event, entries, sections, documents, mapSettings, mapSnapshots } = data;
  const snapshotDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <AdminShell>
      <h1>编辑活动</h1>
      <EventForm initial={event} />
      {mapSettings ? (
        <>
          <EventMapSettingsForm eventId={id} eventSlug={String(event.slug)} initial={mapSettings} />
          <EventMapSnapshotManager
            eventId={id}
            eventSlug={String(event.slug)}
            initialDate={snapshotDate}
            initialSnapshots={mapSnapshots}
          />
        </>
      ) : null}
      <EventDocumentManager eventId={id} initialDocuments={documents} />
      <EventArticleManager eventId={id} initialEntries={entries} initialSections={sections} />
    </AdminShell>
  );
}
