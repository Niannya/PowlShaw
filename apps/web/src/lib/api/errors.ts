export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ErrorShape = {
  error?: string | { code?: string; message?: string; details?: unknown };
};

/**
 * The new `/api/v1/v1` read endpoints return `{ error: { code, message } }`, while
 * legacy mutation endpoints still return `{ error: string }`. Normalize both.
 */
export async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ErrorShape | null;
  const error = body?.error;
  if (error && typeof error === "object") {
    return new ApiError(
      response.status,
      error.code || "API_ERROR",
      error.message || `请求失败（${response.status}）。`,
      error.details,
    );
  }
  if (typeof error === "string" && error) {
    return new ApiError(response.status, "API_ERROR", error);
  }
  return new ApiError(response.status, "API_ERROR", `请求失败（${response.status}）。`);
}
