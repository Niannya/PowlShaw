import path from "node:path";
import { jsonError } from "@/lib/admin";
import { auditAdmin } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  normalizeEventDocumentContext,
  normalizeEventDocumentName,
  removeEventDocumentFile,
} from "@/lib/event-documents";

async function routeIds(params: Promise<{ id: string; documentId: string }>) {
  const values = await params;
  return { eventId: Number(values.id), documentId: Number(values.documentId) };
}

function validIds(eventId: number, documentId: number) {
  return (
    Number.isSafeInteger(eventId) &&
    eventId > 0 &&
    Number.isSafeInteger(documentId) &&
    documentId > 0
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const { eventId, documentId } = await routeIds(params);
  if (!validIds(eventId, documentId)) return jsonError("资料不存在。", 404);

  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM event_documents WHERE id=? AND event_id=?")
    .get(documentId, eventId) as { file_url: string; display_name: string } | undefined;
  if (!existing) return jsonError("资料不存在。", 404);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("请求内容不正确。");
  const extension = path.extname(existing.file_url).slice(1).toLowerCase();
  const displayName = normalizeEventDocumentName(body.display_name, extension);
  if (!displayName) return jsonError("显示名称不能为空，且扩展名必须与原文件一致。");
  const contextLabel = normalizeEventDocumentContext(body.context_label);

  db.prepare(
    `UPDATE event_documents
     SET display_name=?, context_label=?
     WHERE id=? AND event_id=?`,
  ).run(displayName, contextLabel, documentId, eventId);
  auditAdmin("update", "event-document", documentId, {
    event_id: eventId,
    display_name: displayName,
  });
  return Response.json({ ok: true, display_name: displayName, context_label: contextLabel });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const { eventId, documentId } = await routeIds(params);
  if (!validIds(eventId, documentId)) return jsonError("资料不存在。", 404);

  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM event_documents WHERE id=? AND event_id=?")
    .get(documentId, eventId) as
    { file_url: string; display_name: string; source_rel_path: string } | undefined;
  if (!existing) return jsonError("资料不存在。", 404);
  db.prepare("DELETE FROM event_documents WHERE id=? AND event_id=?").run(documentId, eventId);
  auditAdmin("delete", "event-document", documentId, {
    event_id: eventId,
    display_name: existing.display_name,
  });

  const stillReferenced = db
    .prepare("SELECT 1 FROM event_documents WHERE file_url=?")
    .get(existing.file_url);
  if (!stillReferenced) await removeEventDocumentFile(existing.file_url).catch(() => undefined);
  return Response.json({ ok: true });
}
