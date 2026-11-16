import { jsonError } from "@/lib/admin";
import { isAdminRequest } from "@/lib/auth";
import { cleanHtml } from "@/lib/content";
import { MAX_HTML_SIZE } from "@/lib/content-limits";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const body = (await request.json().catch(() => null)) as { content_html?: unknown } | null;
  const content = String(body?.content_html || "");
  if (content.length > MAX_HTML_SIZE) return jsonError("正文过长，无法预览。");
  return Response.json({ ok: true, html: cleanHtml(content) });
}
