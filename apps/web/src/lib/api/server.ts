import { cookies } from "next/headers";
import { app } from "@/server/app";
import { toApiError } from "@/lib/api/errors";

/**
 * 服务端组件（RSC）取数入口：在同一个函数实例内直接调用 Hono 应用。
 *
 * 合并为单应用后不再跨进程请求独立后端（原 `127.0.0.1:3001`），因此：
 * - 没有公网回环请求与双倍函数计费；
 * - 预览环境的 Deployment Protection 不会拦截内部调用；
 * - Cookie 通过请求头原样透传，鉴权仍由 Hono 侧完成。
 */
export async function apiServer<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookie = (await cookies()).toString();
  const response = await app.request(`http://internal/api/v1${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(cookie ? { cookie } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw await toApiError(response);
  const body = (await response.json()) as { data: T };
  return body.data;
}
