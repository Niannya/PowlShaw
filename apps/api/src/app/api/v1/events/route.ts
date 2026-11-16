import { apiData } from "@/lib/api-response";
import { eventsPayload } from "@/lib/api-read";

export const dynamic = "force-dynamic";

export function GET() {
  return apiData(eventsPayload());
}
