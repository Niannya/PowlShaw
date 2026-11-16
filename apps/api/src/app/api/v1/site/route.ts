import { apiData } from "@/lib/api-response";
import { sitePayload } from "@/lib/api-read";

export const dynamic = "force-dynamic";

export function GET() {
  return apiData(sitePayload());
}
