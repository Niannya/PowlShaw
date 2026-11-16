import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventForm } from "@/components/admin/EventForm";
import { EventArticleManager } from "@/components/admin/EventArticleManager";
import { EventDocumentManager } from "@/components/admin/EventDocumentManager";
import { EventExtensionManager } from "@/components/admin/EventExtensionManager";
import { getAdminEventDetail } from "@/lib/api/admin";
import { requireAdmin } from "@/lib/auth";

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const data = await getAdminEventDetail(id);
  if (!data) notFound();
  const { event, entries, sections, documents, extensions = [] } = data;

  return (
    <AdminShell>
      <h1>编辑活动</h1>
      <EventForm initial={event} />
      <EventExtensionManager eventId={id} initialExtensions={extensions} />
      <EventDocumentManager eventId={id} initialDocuments={documents} />
      <EventArticleManager eventId={id} initialEntries={entries} initialSections={sections} />
    </AdminShell>
  );
}
