import { jsonError } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { normalizeEventMapNode } from "@/lib/event-map-node-validation";
import { eventHasEnabledMap, getEventMapNode, getEventMapNodes } from "@/lib/event-map-nodes";
import { consumeRateLimit } from "@/lib/request-security";
import { getUserFromRequest } from "@/lib/user-auth";

function eventIdFrom(value: string) {
  const eventId = Number(value);
  return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : undefined;
}

function contributionError(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) return { response: jsonError("请先登录。", 401) } as const;
  if (user.must_change_password) {
    return { response: jsonError("请先到账号中心修改初始密码。", 403) } as const;
  }
  if (user.muted_until) {
    const mutedUntil = Date.parse(`${user.muted_until.replace(" ", "T")}+08:00`);
    if (Number.isFinite(mutedUntil) && mutedUntil > Date.now()) {
      return { response: jsonError("账号当前不能发布地图内容。", 403) } as const;
    }
  }
  return { user } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const eventId = eventIdFrom((await params).eventId);
  if (!eventId || !eventHasEnabledMap(eventId)) return jsonError("活动地图不存在。", 404);
  return Response.json({ nodes: getEventMapNodes(eventId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = contributionError(request);
  if ("response" in auth) return auth.response;

  const eventId = eventIdFrom((await params).eventId);
  if (!eventId || !eventHasEnabledMap(eventId)) return jsonError("活动地图不存在。", 404);

  const limit = consumeRateLimit(`event-map-node-create:${auth.user.id}`, request, 30, 60);
  if (!limit.allowed) {
    return Response.json(
      { error: "添加节点过于频繁，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const normalized = normalizeEventMapNode(await request.json().catch(() => null));
  if (!normalized.ok) return jsonError(normalized.error);
  const value = normalized.value;
  const result = getDb()
    .prepare(
      `INSERT INTO event_map_nodes(event_id, user_id, name, description, notes, x, y)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(eventId, auth.user.id, value.name, value.description, value.notes, value.x, value.y);
  const node = getEventMapNode(Number(result.lastInsertRowid));
  return Response.json({ ok: true, node }, { status: 201 });
}
