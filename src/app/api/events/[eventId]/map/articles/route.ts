import { jsonError } from "@/lib/admin";
import { eventHasEnabledMap, searchEventMapArticles } from "@/lib/event-map-nodes";

function eventIdFrom(value: string) {
  const eventId = Number(value);
  return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : undefined;
}

/** Search public articles for the optional article picker in the map node editor. */
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const eventId = eventIdFrom((await params).eventId);
  if (!eventId || !eventHasEnabledMap(eventId)) return jsonError("活动地图不存在。", 404);

  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || "";
  return Response.json({ articles: query ? searchEventMapArticles(query) : [] });
}
