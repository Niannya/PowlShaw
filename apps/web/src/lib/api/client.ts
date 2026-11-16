import { toApiError } from "@/lib/api/errors";

/**
 * Browser-side request helper for the same-origin `/api/v1/v1` surface.
 * Next rewrites (development) or Nginx (production) forwards it to the API app.
 */
export async function apiClient<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) throw await toApiError(response);
  const body = (await response.json()) as { data: T };
  return body.data;
}
