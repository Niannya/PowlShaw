import { jsonError } from "@/lib/admin";
import { auditAdmin } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { deleteEventMapSnapshot, getEventMapSnapshot } from "@/lib/event-map-snapshots";
import { cleanupUnreferencedUploads } from "@/lib/uploaded-assets";

function positiveInteger(value: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

type RouteContext = { params: Promise<{ id: string; snapshotId: string }> };

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const values = await params;
  const eventId = positiveInteger(values.id);
  const snapshotId = positiveInteger(values.snapshotId);
  if (!eventId || !snapshotId) return jsonError("世界快照不存在。", 404);

  const snapshot = getEventMapSnapshot(eventId, snapshotId);
  if (!snapshot || !deleteEventMapSnapshot(eventId, snapshotId)) {
    return jsonError("世界快照不存在。", 404);
  }
  cleanupUnreferencedUploads();
  auditAdmin("delete", "event_map_snapshot", snapshotId, {
    event_id: eventId,
    snapshot_date: snapshot.snapshot_date,
    title: snapshot.title,
  });
  return Response.json({ ok: true });
}
