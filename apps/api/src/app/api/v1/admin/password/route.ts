import { jsonError } from "@/lib/admin";
import { auditAdmin } from "@/lib/audit";
import { isAdminRequest, setSessionCookie, updateAdminPassword } from "@/lib/auth";
import { validatePassword } from "@/lib/user-auth";

export async function PUT(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("没有收到密码信息。");

  const currentPassword = String(body.current_password || "");
  if (!currentPassword || currentPassword.length > 200) {
    return jsonError("当前密码不正确。");
  }
  const newPassword = validatePassword(body.new_password);
  if (!newPassword.ok) return jsonError(newPassword.error);
  if (newPassword.value !== String(body.confirm_password || "")) {
    return jsonError("两次输入的新密码不一致。");
  }

  const updated = updateAdminPassword(currentPassword, newPassword.value);
  if (!updated.ok) return jsonError(updated.error);

  auditAdmin("change_password", "admin_credentials");
  await setSessionCookie(request, updated.sessionVersion);
  return Response.json({ ok: true });
}
