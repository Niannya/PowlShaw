import { jsonError } from "@/lib/admin";
import { auditAdmin } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { normalizeEventMapSnapshot } from "@/lib/event-map-snapshot-validation";
import { createEventMapSnapshot, eventMapSnapshotSummary } from "@/lib/event-map-snapshots";

function positiveInteger(value: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const eventId = positiveInteger((await params).id);
  if (!eventId) return jsonError("活动不存在。", 404);
  const event = getDb().prepare("SELECT id, slug FROM events WHERE id=?").get(eventId) as
    { id: number; slug: string } | undefined;
  if (!event) return jsonError("活动不存在。", 404);

  const normalized = normalizeEventMapSnapshot(await request.json().catch(() => null));
  if (!normalized.ok) return jsonError(normalized.error);
  const created = createEventMapSnapshot(eventId, normalized.value);
  if (!created.ok) return jsonError(created.error);

  auditAdmin("create", "event_map_snapshot", created.snapshot.id, {
    event_id: eventId,
    event_slug: event.slug,
    snapshot_date: created.snapshot.snapshot_date,
    title: created.snapshot.title,
    node_count: created.snapshot.node_count,
    region_count: created.snapshot.region_count,
    relation_count: created.snapshot.relation_count,
  });
  return Response.json(
    { ok: true, snapshot: eventMapSnapshotSummary(created.snapshot) },
    { status: 201 },
  );
}
