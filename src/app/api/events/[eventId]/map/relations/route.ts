import { jsonError } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { normalizeEventMapRelation } from "@/lib/event-map-relation-validation";
import { eventHasEnabledMap } from "@/lib/event-map-nodes";
import {
  eventMapRelationNodesExist,
  getEventMapRelation,
  getEventMapRelations,
} from "@/lib/event-map-relations";
import { consumeRateLimit } from "@/lib/request-security";
import { getUserFromRequest, userCanPublishContent } from "@/lib/user-auth";

function eventIdFrom(value: string) {
  const eventId = Number(value);
  return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : undefined;
}

function contributionError(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) return { response: jsonError("请先登录。", 401) } as const;
  if (!userCanPublishContent(user)) {
    const error = user.must_change_password
      ? "请先到账号中心修改初始密码。"
      : "账号当前不能发布地图内容。";
    return { response: jsonError(error, 403) } as const;
  }
  return { user } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const eventId = eventIdFrom((await params).eventId);
  if (!eventId || !eventHasEnabledMap(eventId)) return jsonError("活动地图不存在。", 404);
  return Response.json({ relations: getEventMapRelations(eventId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = contributionError(request);
  if ("response" in auth) return auth.response;

  const eventId = eventIdFrom((await params).eventId);
  if (!eventId || !eventHasEnabledMap(eventId)) return jsonError("活动地图不存在。", 404);

  const limit = consumeRateLimit(`event-map-relation-create:${auth.user.id}`, request, 30, 60);
  if (!limit.allowed) {
    return Response.json(
      { error: "添加关系过于频繁，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const normalized = normalizeEventMapRelation(await request.json().catch(() => null));
  if (!normalized.ok) return jsonError(normalized.error);
  const value = normalized.value;
  if (!eventMapRelationNodesExist(eventId, value.source_node_id, value.target_node_id)) {
    return jsonError("关系连接的节点不存在。", 404);
  }

  const result = getDb()
    .prepare(
      `INSERT INTO event_map_relations(
         event_id, user_id, source_node_id, target_node_id, name, description, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      eventId,
      auth.user.id,
      value.source_node_id,
      value.target_node_id,
      value.name,
      value.description,
      value.notes,
    );
  const relation = getEventMapRelation(Number(result.lastInsertRowid));
  return Response.json({ ok: true, relation }, { status: 201 });
}
