import { clearUserSessionCookie } from "@/lib/user-auth";

export async function POST() {
  await clearUserSessionCookie();
  return Response.json({ ok: true });
}
