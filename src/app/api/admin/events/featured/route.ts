import { jsonError } from "@/lib/admin";
import { auditAdmin } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function PUT(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("没有收到首页活动设置。");

  const eventId = Number(body.eventId || 0);
  if (!Number.isSafeInteger(eventId) || eventId < 0) return jsonError("请选择有效活动。");

  const db = getDb();
  if (eventId && !db.prepare("SELECT 1 FROM events WHERE id=?").get(eventId)) {
    return jsonError("选中的活动不存在。", 404);
  }

  db.prepare("UPDATE events SET is_featured=CASE WHEN id=? THEN 1 ELSE 0 END").run(eventId);
  auditAdmin("update-homepage-showcase", "event", eventId || undefined);
  return Response.json({ ok: true });
}
