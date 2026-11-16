import { apiData } from "@/lib/api-response";
import { mePayload } from "@/lib/api-read";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiData(mePayload(request));
}
