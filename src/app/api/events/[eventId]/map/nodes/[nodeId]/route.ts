import { jsonError } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { normalizeEventMapNode } from "@/lib/event-map-node-validation";
import { eventHasEnabledMap, getEventMapNode } from "@/lib/event-map-nodes";
import { consumeRateLimit } from "@/lib/request-security";
import { getUserFromRequest } from "@/lib/user-auth";

function positiveInteger(value: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function currentContributor(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) return { response: jsonError("请先登录。", 401) } as const;
  if (user.must_change_password) {
    return { response: jsonError("请先到账号中心修改初始密码。", 403) } as const;
  }
  if (user.muted_until) {
    const mutedUntil = Date.parse(`${user.muted_until.replace(" ", "T")}+08:00`);
    if (Number.isFinite(mutedUntil) && mutedUntil > Date.now()) {
      return { response: jsonError("账号当前不能编辑地图内容。", 403) } as const;
    }
  }
  return { user } as const;
}

type RouteContext = { params: Promise<{ eventId: string; nodeId: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = currentContributor(request);
  if ("response" in auth) return auth.response;
  const values = await params;
  const eventId = positiveInteger(values.eventId);
  const nodeId = positiveInteger(values.nodeId);
  if (!eventId || !nodeId || !eventHasEnabledMap(eventId)) {
    return jsonError("地图节点不存在。", 404);
  }

  const limit = consumeRateLimit(`event-map-node-update:${auth.user.id}`, request, 90, 60);
  if (!limit.allowed) {
    return Response.json(
      { error: "编辑节点过于频繁，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const normalized = normalizeEventMapNode(await request.json().catch(() => null));
  if (!normalized.ok) return jsonError(normalized.error);
  const value = normalized.value;
  const result = getDb()
    .prepare(
      `UPDATE event_map_nodes
       SET name=?, description=?, notes=?, x=?, y=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND event_id=? AND user_id=? AND deleted_at IS NULL`,
    )
    .run(
      value.name,
      value.description,
      value.notes,
      value.x,
      value.y,
      nodeId,
      eventId,
      auth.user.id,
    );
  if (!result.changes) return jsonError("地图节点不存在，或你无权编辑。", 404);
  return Response.json({ ok: true, node: getEventMapNode(nodeId) });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = currentContributor(request);
  if ("response" in auth) return auth.response;
  const values = await params;
  const eventId = positiveInteger(values.eventId);
  const nodeId = positiveInteger(values.nodeId);
  if (!eventId || !nodeId || !eventHasEnabledMap(eventId)) {
    return jsonError("地图节点不存在。", 404);
  }

  const result = getDb()
    .prepare(
      `UPDATE event_map_nodes
       SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND event_id=? AND user_id=? AND deleted_at IS NULL`,
    )
    .run(nodeId, eventId, auth.user.id);
  if (!result.changes) return jsonError("地图节点不存在，或你无权删除。", 404);
  return Response.json({ ok: true });
}
