export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

/** New `/api/v1` read endpoints use `{ data }` so the web client can unwrap once. */
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
