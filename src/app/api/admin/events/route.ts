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

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !String(body.title || "").trim()) return jsonError("请填写活动名称。");

  const db = getDb();
  const title = String(body.title).trim();
  const eventGroup = body.event_group ?? "other";
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
  const sortOrder = (
    db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 10 AS value FROM events").get() as {
      value: number;
    }
  ).value;

  const safeTitle = title.slice(0, MAX_TITLE_LENGTH);
  const slug = uniqueSlug("events", String(body.slug || safeTitle));
  const summary = String(body.summary || "").slice(0, MAX_SUMMARY_LENGTH);
  const bannerUrl = String(body.banner_url || "") || null;
  let eventId = 0;
  db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO events (
           slug, title, event_group, summary, content_html, content_markdown, starts_at,
           ends_at, status_override, banner_url, is_featured, sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
        0,
        sortOrder,
      );
    eventId = Number(result.lastInsertRowid);
    recordContentRevision(
      "event",
      eventId,
      "create",
      db.prepare("SELECT * FROM events WHERE id=?").get(eventId),
    );
    auditAdmin("create", "event", eventId, { title: safeTitle, slug });
  })();
  claimUploadedAssets([bannerUrl, content]);
  cleanupUnreferencedUploads();
  return Response.json({ ok: true, id: eventId });
}
