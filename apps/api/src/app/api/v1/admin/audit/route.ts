import { apiData, apiUnauthorized } from "@/lib/api-response";
import { adminAuditPayload } from "@/lib/api-read";
import { isAdminRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  if (!isAdminRequest(request)) return apiUnauthorized("请先登录后台。");
  return apiData(adminAuditPayload());
}
