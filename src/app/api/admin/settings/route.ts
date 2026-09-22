import { jsonError } from "@/lib/admin";
import { auditAdmin } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

function validLink(url: string) {
  if (!url) return true;
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function PUT(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("没有收到站点设置。");

  const values = {
    welcome_title: String(body.welcome_title || "")
      .trim()
      .slice(0, 50),
    welcome_opening: String(body.welcome_opening || "")
      .trim()
      .slice(0, 200),
    welcome_about_link: String(body.welcome_about_link || "")
      .trim()
      .slice(0, 80),
    welcome_random_link: String(body.welcome_random_link || "")
      .trim()
      .slice(0, 80),
    welcome_treat_prefix: String(body.welcome_treat_prefix || "")
      .trim()
      .slice(0, 80),
    welcome_cookie_button: String(body.welcome_cookie_button || "")
      .trim()
      .slice(0, 40),
    welcome_tea_button: String(body.welcome_tea_button || "")
      .trim()
      .slice(0, 40),
    welcome_treat_suffix: String(body.welcome_treat_suffix || "")
      .trim()
      .slice(0, 40),
    welcome_closing: String(body.welcome_closing || "")
      .trim()
      .slice(0, 300),
    welcome_visit_prefix: String(body.welcome_visit_prefix || "").slice(0, 100),
    welcome_visit_suffix: String(body.welcome_visit_suffix || "").slice(0, 100),
    announcement_enabled: body.announcement_enabled === "1" ? "1" : "0",
    announcement_title: String(body.announcement_title || "")
      .trim()
      .slice(0, 50),
    announcement_body: String(body.announcement_body || "")
      .trim()
      .slice(0, 1000),
    announcement_link_label: String(body.announcement_link_label || "")
      .trim()
      .slice(0, 50),
    announcement_link_url: String(body.announcement_link_url || "")
      .trim()
      .slice(0, 300),
  };
  if (!validLink(values.announcement_link_url)) {
    return jsonError("公告链接必须是站内路径，或以 http://、https:// 开头。");
  }

  const db = getDb();
  const save = db.prepare(
    `INSERT INTO site_settings(key,value) VALUES(?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(values)) save.run(key, value);
  })();
  auditAdmin("update", "site_settings", undefined, { keys: Object.keys(values) });
  return Response.json({ ok: true });
}
