import crypto from "node:crypto";
import { jsonError } from "@/lib/admin";
import { auditAdmin } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  eventDocumentExtension,
  eventDocumentStorage,
  matchesEventDocumentSignature,
  MAX_EVENT_DOCUMENT_SIZE,
  normalizeEventDocumentContext,
  normalizeEventDocumentName,
  removeEventDocumentFile,
  writeEventDocument,
  type EventDocumentRecord,
} from "@/lib/event-documents";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const eventId = Number((await params).id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return jsonError("活动不存在。", 404);
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM events WHERE id=?").get(eventId)) {
    return jsonError("活动不存在。", 404);
  }

  const data = await request.formData().catch(() => null);
  const file = data?.get("file");
  if (!(file instanceof File)) return jsonError("请选择需要上传的资料文件。");
  if (!file.size) return jsonError("不能上传空文件。");
  if (file.size > MAX_EVENT_DOCUMENT_SIZE) return jsonError("单个资料文件不能超过 20MB。");

  const extension = eventDocumentExtension(file.name);
  if (!extension) {
    return jsonError("只支持 XLSX、XLS、CSV、DOCX、DOC、RTF、PDF、TXT、JPG 和 PNG 文件。");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesEventDocumentSignature(buffer, extension)) {
    return jsonError("文件内容与扩展名不符，或文件已经损坏。");
  }

  const displayName = normalizeEventDocumentName(data?.get("display_name") || file.name, extension);
  if (!displayName) return jsonError("显示名称不能为空，且扩展名必须与上传文件一致。");
  const contextLabel = normalizeEventDocumentContext(data?.get("context_label"));
  const storage = eventDocumentStorage(eventId, extension, buffer);
  const duplicate = db
    .prepare("SELECT id FROM event_documents WHERE event_id=? AND file_url=?")
    .get(eventId, storage.fileUrl);
  if (duplicate) return jsonError("这份文件已经上传到当前活动。", 409);

  await writeEventDocument(storage.targetPath, buffer);
  try {
    const sourcePath = `admin-upload/${eventId}/${crypto.randomUUID()}/${displayName}`;
    const result = db
      .prepare(
        `INSERT INTO event_documents (
           event_id, source_rel_path, display_name, context_label, file_url, file_size, sort_order
         )
         SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 10
         FROM event_documents WHERE event_id=?`,
      )
      .run(eventId, sourcePath, displayName, contextLabel, storage.fileUrl, file.size, eventId);
    const document = db
      .prepare(
        `SELECT id, display_name, context_label, file_url, file_size, sort_order
         FROM event_documents WHERE id=?`,
      )
      .get(Number(result.lastInsertRowid)) as EventDocumentRecord;
    auditAdmin("create", "event-document", document.id, {
      event_id: eventId,
      display_name: displayName,
    });
    return Response.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    const stillReferenced = db
      .prepare("SELECT 1 FROM event_documents WHERE file_url=?")
      .get(storage.fileUrl);
    if (!stillReferenced) await removeEventDocumentFile(storage.fileUrl).catch(() => undefined);
    throw error;
  }
}
