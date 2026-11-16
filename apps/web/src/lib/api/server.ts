import { cookies } from "next/headers";
import { toApiError } from "@/lib/api/errors";

const BASE = (process.env.API_INTERNAL_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");

/**
 * Server-side (RSC / route handler) request to the standalone backend.
 *
 * Only the cookie header is forwarded; the frontend never parses or validates
 * the session itself. Authorization always happens in the API service.
 */
export async function apiServer<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookie = (await cookies()).toString();
  const response = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(cookie ? { cookie } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) throw await toApiError(response);
  const body = (await response.json()) as { data: T };
  return body.data;
}
