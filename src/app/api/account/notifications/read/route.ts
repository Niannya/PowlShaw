import { jsonError } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getUserFromRequest } from "@/lib/user-auth";

export async function POST(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) return jsonError("请先登录。", 401);
  getDb().prepare("UPDATE notifications SET is_read=1 WHERE user_id=?").run(user.id);
  return Response.json({ ok: true });
}
