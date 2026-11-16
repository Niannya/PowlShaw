export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

/**
 * 响应契约（与旧实现保持一致）：
 * - 读取端点（RSC 取数）返回 `{ data }`，前端 `apiServer` / `apiClient` 只解包一次；
 * - 旧的浏览器变更端点继续返回 `{ ok: true }` 或 `{ error: "中文提示" }`；
 * - 新增的扩展端点使用 `{ data }` 与 `{ error: { code, message, details? } }`。
 */

export function apiData<T>(data: T, init?: ResponseInit) {
  return Response.json({ data }, init);
}

export function apiError(code: string, message: string, status = 400, details?: unknown) {
  const body: ApiErrorBody = {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
  return Response.json(body, { status });
}

export function apiUnauthorized(message = "请先登录。") {
  return apiError("UNAUTHORIZED", message, 401);
}

export function apiNotFound(message = "资源不存在。") {
  return apiError("NOT_FOUND", message, 404);
}

export function apiBadRequest(message: string, code = "BAD_REQUEST") {
  return apiError(code, message, 400);
}

export function apiServerError(message = "服务器内部错误。") {
  return apiError("INTERNAL_ERROR", message, 500);
}

/** 旧浏览器端点统一使用的错误体：`{ error: "中文提示" }`。 */
export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** 表单提交（`application/x-www-form-urlencoded`）仍使用 303 相对跳转。 */
export function formRedirect(location: string, status = 303) {
  return new Response(null, { status, headers: { Location: location } });
}
