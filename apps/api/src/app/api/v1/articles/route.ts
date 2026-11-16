import { apiData } from "@/lib/api-response";
import { articlesPayload } from "@/lib/api-read";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return apiData(
    articlesPayload({
      page: Number(params.get("page")) || undefined,
      perPage: Number(params.get("perPage")) || undefined,
      limit: Number(params.get("limit")) || undefined,
      q: params.get("q") ?? undefined,
      year: params.get("year") ?? undefined,
    }),
  );
}
