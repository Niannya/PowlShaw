import { toApiError } from "@/lib/api/errors";

/**
 * Browser-side request helper for the same-origin `/api/v1` surface.
 * 单应用部署后，`/api/v1/*` 由同仓挂载的 Hono 直接处理，无需 Next 重写或 Nginx 反代。
 */
export async function apiClient<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
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
