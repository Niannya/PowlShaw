import { apiData, apiNotFound } from "@/lib/api-response";
import { articlePayload } from "@/lib/api-read";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  const slug = decodeURIComponent((await params).slug);
  const searchParams = new URL(request.url).searchParams;
  const commentId = Number(searchParams.get("commentId")) || undefined;
  const payload = articlePayload(slug, {
    commentPage: Number(searchParams.get("commentPage")) || undefined,
    commentSort: searchParams.get("commentSort") ?? undefined,
    commentId,
  });
  if (!payload) return apiNotFound("文章不存在。");
  return apiData(payload);
}
