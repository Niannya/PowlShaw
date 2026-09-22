import { ids, jsonError } from "@/lib/admin";
import { auditAdmin } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function PUT(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const orderedIds = [...new Set(ids(body?.ids))];
  const db = getDb();
  const existingIds = (db.prepare("SELECT id FROM events").all() as { id: number }[]).map(
    (row) => row.id,
  );
  if (
    orderedIds.length !== existingIds.length ||
    existingIds.some((id) => !orderedIds.includes(id))
  ) {
    return jsonError("活动顺序数据不完整，请刷新页面后重试。");
  }

  const update = db.prepare(
    "UPDATE events SET sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
  );
  db.transaction(() => orderedIds.forEach((id, index) => update.run(index * 10, id)))();
  auditAdmin("reorder", "events", undefined, { ids: orderedIds });
  return Response.json({ ok: true });
}
