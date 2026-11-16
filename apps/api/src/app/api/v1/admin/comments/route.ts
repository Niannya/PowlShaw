import { apiData, apiUnauthorized } from "@/lib/api-response";
import { adminCommentsPayload } from "@/lib/api-read";
import { isAdminRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  if (!isAdminRequest(request)) return apiUnauthorized("请先登录后台。");
  const params = new URL(request.url).searchParams;
  return apiData(
    adminCommentsPayload({
      q: params.get("q") ?? undefined,
      status: params.get("status") ?? undefined,
      article: params.get("article") ?? undefined,
      user: params.get("user") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      page: Number(params.get("page")) || undefined,
    }),
  );
}
