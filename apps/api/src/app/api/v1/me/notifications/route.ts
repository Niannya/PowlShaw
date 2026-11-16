import { apiData, apiUnauthorized } from "@/lib/api-response";
import { notificationsPayload } from "@/lib/api-read";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const payload = notificationsPayload(request);
  if (!payload) return apiUnauthorized("请先登录账号。");
  return apiData(payload);
}
