import { credentialsAreValid, setSessionCookie } from "@/lib/auth";
import { checkLoginLimit, clearLoginFailures, recordLoginFailure } from "@/lib/user-auth";

function redirectTo(path: string) {
  return new Response(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request) {
  const isFormSubmission = request.headers
    .get("content-type")
    ?.includes("application/x-www-form-urlencoded");
  const body = isFormSubmission
    ? Object.fromEntries(await request.formData())
    : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
  const username = String(body.username || "").slice(0, 64);
  const limit = checkLoginLimit(username, request, "admin-login");
  if (!limit.allowed) {
    if (isFormSubmission) return redirectTo("/admin/login?error=rate-limit");
    return Response.json(
      { error: "尝试次数过多，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }
  if (!credentialsAreValid(username, String(body.password || ""))) {
    recordLoginFailure(limit.key);
    if (isFormSubmission) {
      return redirectTo("/admin/login?error=credentials");
    }
    return Response.json({ error: "用户名或密码不正确。" }, { status: 401 });
  }
  clearLoginFailures(limit.key);
  await setSessionCookie(request);
  if (isFormSubmission) return redirectTo("/admin");
  return Response.json({ ok: true });
}
