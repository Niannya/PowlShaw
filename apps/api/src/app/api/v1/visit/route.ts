import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { consumeRateLimit, requestIsHttps } from "@/lib/request-security";

const VISIT_COOKIE = "poxiao_visit";
const VISIT_WINDOW_SECONDS = 60 * 60 * 12;

function currentCount() {
  const row = getDb().prepare("SELECT value FROM site_settings WHERE key='visit_count'").get() as
    { value: string } | undefined;
  return Math.max(0, Number.parseInt(row?.value || "0", 10) || 0);
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (cookieStore.get(VISIT_COOKIE)) return Response.json({ count: currentCount() });

  const db = getDb();
  const limit = consumeRateLimit("visit", request, 20, VISIT_WINDOW_SECONDS);
  if (limit.allowed) {
    db.prepare(
      `INSERT INTO site_settings(key,value) VALUES('visit_count','1')
       ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1`,
    ).run();
  }
  cookieStore.set(VISIT_COOKIE, "1", {
    httpOnly: true,
    sameSite: "strict",
    secure: requestIsHttps(request),
    path: "/",
    maxAge: VISIT_WINDOW_SECONDS,
  });
  return Response.json({ count: currentCount() });
}
