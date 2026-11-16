import { apiData } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export function GET() {
  return apiData({ status: "ok", service: "powlshaw-api" });
}
