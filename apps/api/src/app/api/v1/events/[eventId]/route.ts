import { apiData, apiNotFound } from "@/lib/api-response";
import { eventPayload } from "@/lib/api-read";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(request: Request, { params }: Params) {
  const slug = decodeURIComponent((await params).eventId);
  const snapshotId = Number(new URL(request.url).searchParams.get("snapshot")) || undefined;
  const payload = eventPayload(slug, snapshotId);
  if (!payload) return apiNotFound("活动不存在。");
  return apiData(payload);
}
