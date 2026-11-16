import { jsonError } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { normalizeEventMapRegion } from "@/lib/event-map-region-validation";
import { eventHasEnabledMap } from "@/lib/event-map-nodes";
import { getEventMapRegion } from "@/lib/event-map-regions";
import { consumeRateLimit } from "@/lib/request-security";
import { getUserFromRequest, userCanPublishContent } from "@/lib/user-auth";

function positiveInteger(value: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function currentContributor(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) return { response: jsonError("请先登录。", 401) } as const;
  if (!userCanPublishContent(user)) {
    const error = user.must_change_password
      ? "请先到账号中心修改初始密码。"
      : "账号当前不能编辑地图内容。";
    return { response: jsonError(error, 403) } as const;
  }
  return { user } as const;
}

type RouteContext = { params: Promise<{ eventId: string; regionId: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = currentContributor(request);
  if ("response" in auth) return auth.response;
  const values = await params;
  const eventId = positiveInteger(values.eventId);
  const regionId = positiveInteger(values.regionId);
  if (!eventId || !regionId || !eventHasEnabledMap(eventId)) {
    return jsonError("地图区域不存在。", 404);
  }

  const limit = consumeRateLimit(`event-map-region-update:${auth.user.id}`, request, 60, 60);
  if (!limit.allowed) {
    return Response.json(
      { error: "编辑区域过于频繁，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const normalized = normalizeEventMapRegion(await request.json().catch(() => null));
  if (!normalized.ok) return jsonError(normalized.error);
  const value = normalized.value;
  const result = getDb()
    .prepare(
      `UPDATE event_map_regions
       SET name=?, description=?, notes=?, color=?, points_json=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND event_id=? AND user_id=? AND deleted_at IS NULL`,
    )
    .run(
      value.name,
      value.description,
      value.notes,
      value.color,
      JSON.stringify(value.points),
      regionId,
      eventId,
      auth.user.id,
    );
  if (!result.changes) return jsonError("地图区域不存在，或你无权编辑。", 404);
  return Response.json({ ok: true, region: getEventMapRegion(regionId) });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = currentContributor(request);
  if ("response" in auth) return auth.response;
  const values = await params;
  const eventId = positiveInteger(values.eventId);
  const regionId = positiveInteger(values.regionId);
  if (!eventId || !regionId || !eventHasEnabledMap(eventId)) {
    return jsonError("地图区域不存在。", 404);
  }

  const result = getDb()
    .prepare(
      `UPDATE event_map_regions
       SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND event_id=? AND user_id=? AND deleted_at IS NULL`,
    )
    .run(regionId, eventId, auth.user.id);
  if (!result.changes) return jsonError("地图区域不存在，或你无权删除。", 404);
  return Response.json({ ok: true });
}
