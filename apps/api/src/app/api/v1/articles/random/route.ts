import { apiData } from "@/lib/api-response";
import { randomArticlePayload } from "@/lib/api-read";

export const dynamic = "force-dynamic";

export function GET() {
  return apiData(randomArticlePayload());
}
