import { jsonError, normalizeEventMonth, uniqueSlug } from "@/lib/admin";
import { auditAdmin, recordContentRevision } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { cleanHtml, markdownToHtml } from "@/lib/content";
import {
  MAX_HTML_SIZE,
  MAX_MARKDOWN_SIZE,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
} from "@/lib/content-limits";
import { getDb } from "@/lib/db";
import { isEventGroup } from "@/lib/event-groups";
import { claimUploadedAssets, cleanupUnreferencedUploads } from "@/lib/uploaded-assets";
import { recordSlugRedirect } from "@/lib/slug-redirects";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonError("活动不存在。", 404);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !String(body.title || "").trim()) return jsonError("请填写活动名称。");

  const db = getDb();
  const title = String(body.title).trim();
  const existing = db.prepare("SELECT * FROM events WHERE id=?").get(id) as
    ({ event_group: string } & Record<string, unknown>) | undefined;
  if (!existing) return jsonError("活动不存在。", 404);
  const eventGroup = body.event_group ?? existing.event_group;
  if (!isEventGroup(eventGroup)) return jsonError("请选择有效的活动类型。");
  const startsAt = normalizeEventMonth(body.starts_at);
  const endsAt = normalizeEventMonth(body.ends_at, true);
  if (!startsAt.ok) return jsonError(startsAt.error);
  if (!endsAt.ok) return jsonError(endsAt.error);
  if (startsAt.value && endsAt.value && startsAt.value > endsAt.value) {
    return jsonError("结束月份不能早于开始月份。");
  }
  const markdown = String(body.content_markdown || "");
  const rawHtml = String(body.content_html || "");
  if (markdown.length > MAX_MARKDOWN_SIZE) return jsonError("Markdown 正文过长。");
  if (rawHtml.length > MAX_HTML_SIZE) return jsonError("富文本正文过长。");
  const content = markdown ? markdownToHtml(markdown) : cleanHtml(rawHtml);
  const safeTitle = title.slice(0, MAX_TITLE_LENGTH);
  const slug = uniqueSlug("events", String(body.slug || safeTitle), id);
  const summary = String(body.summary || "").slice(0, MAX_SUMMARY_LENGTH);
  const bannerUrl = String(body.banner_url || "") || null;
  db.transaction(() => {
    recordContentRevision("event", id, "update", existing);
    db.prepare(
      `UPDATE events
       SET slug = ?, title = ?, event_group = ?, summary = ?, content_html = ?, content_markdown = ?,
           starts_at = ?, ends_at = ?, status_override = ?, banner_url = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      slug,
      safeTitle,
      eventGroup,
      summary,
      content,
      markdown,
      startsAt.value,
      endsAt.value,
      ["upcoming", "active", "ended"].includes(String(body.status_override))
        ? String(body.status_override)
        : null,
      bannerUrl,
      id,
    );
    recordSlugRedirect("event", String(existing.slug), slug);
    auditAdmin("update", "event", id, { title: safeTitle, slug });
  })();
  claimUploadedAssets([bannerUrl, content]);
  cleanupUnreferencedUploads();

  return Response.json({ ok: true, id });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonError("活动不存在。", 404);
  const db = getDb();
  const event = db.prepare("SELECT * FROM events WHERE id=?").get(id);
  if (!event) return jsonError("活动不存在。", 404);
  const eventArticles = db.prepare("SELECT * FROM event_articles WHERE event_id=?").all(id);
  const eventSections = db.prepare("SELECT * FROM event_sections WHERE event_id=?").all(id);
  const documents = db.prepare("SELECT * FROM event_documents WHERE event_id=?").all(id);
  const mapSettings = db.prepare("SELECT * FROM event_map_settings WHERE event_id=?").get(id);
  db.transaction(() => {
    recordContentRevision("event", id, "delete", {
      event,
      event_articles: eventArticles,
      event_sections: eventSections,
      documents,
      map_settings: mapSettings || null,
    });
    db.prepare("DELETE FROM events WHERE id=?").run(id);
    auditAdmin("delete", "event", id, {
      title: (event as { title?: string }).title || "",
    });
  })();
  cleanupUnreferencedUploads();

  return Response.json({ ok: true });
}
