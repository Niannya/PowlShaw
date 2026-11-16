import { jsonError } from "@/lib/admin";
import { auditAdmin } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const eventId = Number((await params).id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return jsonError("活动不存在。", 404);
  const body = (await request.json().catch(() => null)) as { document_ids?: unknown } | null;
  const documentIds = Array.isArray(body?.document_ids)
    ? body.document_ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
    : [];
  if (new Set(documentIds).size !== documentIds.length) return jsonError("资料顺序中有重复项目。");

  const db = getDb();
  const existingIds = (
    db.prepare("SELECT id FROM event_documents WHERE event_id=? ORDER BY id").all(eventId) as {
      id: number;
    }[]
  ).map((row) => row.id);
  if (
    existingIds.length !== documentIds.length ||
    existingIds.some((id) => !documentIds.includes(id))
  ) {
    return jsonError("资料列表已经变化，请刷新页面后重试。", 409);
  }

  const update = db.prepare("UPDATE event_documents SET sort_order=? WHERE id=? AND event_id=?");
  db.transaction(() => {
    documentIds.forEach((documentId, index) => update.run((index + 1) * 10, documentId, eventId));
    auditAdmin("reorder", "event-document", eventId, { document_ids: documentIds });
  })();
  return Response.json({ ok: true });
}
