import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventForm } from "@/components/admin/EventForm";
import { EventArticleManager } from "@/components/admin/EventArticleManager";
import { EventDocumentManager } from "@/components/admin/EventDocumentManager";
import { EventMapSettingsForm } from "@/components/admin/EventMapSettingsForm";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { EventDocumentRecord } from "@/lib/event-documents";
import { getEventMapSettings } from "@/lib/event-map-settings";

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const db = getDb();
  const event = db.prepare("SELECT * FROM events WHERE id=?").get(id) as
    Record<string, unknown> | undefined;
  if (!event) notFound();
  const initialEntries = db
    .prepare(
      `SELECT a.id, a.title, ea.section_path
       FROM event_articles ea
       JOIN articles a ON a.id=ea.article_id
       WHERE ea.event_id=?
       ORDER BY ea.sort_order,a.id`,
    )
    .all(id) as unknown as { id: number; title: string; section_path: string }[];
  const initialSections = db
    .prepare(
      `SELECT id, path_name
       FROM event_sections
       WHERE event_id=?
       ORDER BY sort_order,id`,
    )
    .all(id) as unknown as { id: number; path_name: string }[];
  const initialDocuments = db
    .prepare(
      `SELECT id, display_name, context_label, file_url, file_size, sort_order
       FROM event_documents
       WHERE event_id=?
       ORDER BY sort_order, display_name`,
    )
    .all(id) as EventDocumentRecord[];
  const mapSettings = getEventMapSettings(id);

  return (
    <AdminShell>
      <h1>编辑活动</h1>
      <EventForm initial={event} />
      {mapSettings ? (
        <EventMapSettingsForm eventId={id} eventSlug={String(event.slug)} initial={mapSettings} />
      ) : null}
      <EventDocumentManager eventId={id} initialDocuments={initialDocuments} />
      <EventArticleManager
        eventId={id}
        initialEntries={initialEntries}
        initialSections={initialSections}
      />
    </AdminShell>
  );
}
