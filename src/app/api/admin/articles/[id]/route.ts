import { ids, jsonError, nextArticleSlug, normalizeArticleDate } from "@/lib/admin";
import { auditAdmin, recordContentRevision } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { cleanHtml, markdownToHtml, textExcerpt } from "@/lib/content";
import { MAX_HTML_SIZE, MAX_MARKDOWN_SIZE, MAX_TITLE_LENGTH } from "@/lib/content-limits";
import { getDb } from "@/lib/db";
import { claimUploadedAssets, cleanupUnreferencedUploads } from "@/lib/uploaded-assets";
import { recordSlugRedirect } from "@/lib/slug-redirects";

function existingEventIds(values: number[]) {
  if (!values.length) return true;
  const placeholders = values.map(() => "?").join(",");
  return (
    (
      getDb()
        .prepare(`SELECT COUNT(*) AS count FROM events WHERE id IN (${placeholders})`)
        .get(...values) as {
        count: number;
      }
    ).count === values.length
  );
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonError("无效文章编号。");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return jsonError("请填写文章标题。");
  }

  const db = getDb();
  const previous = db.prepare("SELECT * FROM articles WHERE id=?").get(id);
  if (!previous) return jsonError("文章不存在。", 404);
  const previousEvents = db
    .prepare("SELECT * FROM event_articles WHERE article_id=? ORDER BY event_id")
    .all(id);
  const title = body.title.trim().slice(0, MAX_TITLE_LENGTH);
  const markdown = String(body.content_markdown || "");
  const rawHtml = String(body.content_html || "");
  if (markdown.length > MAX_MARKDOWN_SIZE) return jsonError("Markdown 正文过长。");
  if (rawHtml.length > MAX_HTML_SIZE) return jsonError("富文本正文过长。");
  const content = markdown ? markdownToHtml(markdown) : cleanHtml(rawHtml);
  const publishedAt = normalizeArticleDate(body.published_at);
  if (!publishedAt.ok) return jsonError(publishedAt.error);

  const eventIds = [...new Set(ids(body.event_ids))];
  if (eventIds.length !== 1) return jsonError("每篇文章必须选择一个所属活动。");
  if (!existingEventIds(eventIds)) {
    return jsonError("选择的活动已经不存在，请刷新页面。");
  }
  const previousEventIds = previousEvents.map((event) =>
    Number((event as { event_id: number }).event_id),
  );
  const stayedInSameEvent = previousEventIds.length === 1 && previousEventIds[0] === eventIds[0];
  const slug = stayedInSameEvent
    ? String((previous as { slug: string }).slug)
    : nextArticleSlug(eventIds, title);
  const coverUrl = String(body.cover_url || "") || null;
  db.transaction(() => {
    recordContentRevision("article", id, "update", {
      article: previous,
      event_articles: previousEvents,
    });
    db.prepare(
      `UPDATE articles
       SET slug = ?, title = ?, excerpt = ?, content_html = ?, content_markdown = ?,
           status = ?, published_at = ?, cover_url = ?, is_pinned = ?,
           comments_mode = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      slug,
      title,
      textExcerpt(content, 180),
      content,
      markdown,
      "published",
      publishedAt.value,
      coverUrl,
      body.is_pinned ? 1 : 0,
      ["open", "closed", "hidden"].includes(String(body.comments_mode))
        ? String(body.comments_mode)
        : "open",
      id,
    );
    // 只移除真正取消关联的活动，避免普通文章编辑把活动栏目路径和排序清空。
    if (eventIds.length) {
      const placeholders = eventIds.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM event_articles
         WHERE article_id=? AND event_id NOT IN (${placeholders})`,
      ).run(id, ...eventIds);
    } else {
      db.prepare("DELETE FROM event_articles WHERE article_id=?").run(id);
    }
    const addEvent = db.prepare(
      `INSERT OR IGNORE INTO event_articles(event_id,article_id,sort_order)
       SELECT ?, ?, COALESCE(MAX(sort_order), -1) + 1
       FROM event_articles WHERE event_id=?`,
    );
    for (const eventId of eventIds) addEvent.run(eventId, id, eventId);
    recordSlugRedirect("article", String((previous as { slug: string }).slug), slug);
    auditAdmin("update", "article", id, { title, slug });
  })();
  claimUploadedAssets([coverUrl, content]);
  cleanupUnreferencedUploads();

  return Response.json({ ok: true, id, slug });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonError("文章不存在。", 404);
  const db = getDb();
  const article = db.prepare("SELECT * FROM articles WHERE id=?").get(id);
  if (!article) return jsonError("文章不存在。", 404);
  const eventArticles = db.prepare("SELECT * FROM event_articles WHERE article_id=?").all(id);
  db.transaction(() => {
    recordContentRevision("article", id, "delete", {
      article,
      event_articles: eventArticles,
    });
    db.prepare("DELETE FROM articles WHERE id=?").run(id);
    auditAdmin("delete", "article", id, {
      title: (article as { title?: string }).title || "",
    });
  })();
  cleanupUnreferencedUploads();

  return Response.json({ ok: true });
}
