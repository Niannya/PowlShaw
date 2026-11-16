import { apiData, apiBadRequest } from "@/lib/api-response";
import { redirectPayload } from "@/lib/api-read";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "";
  const slug = (params.get("slug") ?? "").trim();
  const payload = redirectPayload(kind, slug);
  if (!payload) return apiBadRequest("重定向查询参数不正确。");
  return apiData(payload);
}
