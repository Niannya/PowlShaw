import { ids, jsonError, nextArticleSlug, normalizeArticleDate } from "@/lib/admin";
import { auditAdmin, recordContentRevision } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { cleanHtml, markdownToHtml, textExcerpt } from "@/lib/content";
import { MAX_HTML_SIZE, MAX_MARKDOWN_SIZE, MAX_TITLE_LENGTH } from "@/lib/content-limits";
import { getDb } from "@/lib/db";
import { claimUploadedAssets, cleanupUnreferencedUploads } from "@/lib/uploaded-assets";

function validEventIds(values: number[]) {
  if (!values.length) return true;
  const placeholders = values.map(() => "?").join(",");
  const count = (
    getDb()
      .prepare(`SELECT COUNT(*) AS count FROM events WHERE id IN (${placeholders})`)
      .get(...values) as {
      count: number;
    }
  ).count;
  return count === values.length;
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return jsonError("请填写文章标题。");
  }

  const db = getDb();
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
  if (!validEventIds(eventIds)) return jsonError("选择的活动已经不存在，请刷新页面。");
  const slug = nextArticleSlug(eventIds, title);
  const coverUrl = String(body.cover_url || "") || null;
  let articleId = 0;
  db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO articles (
           slug, title, excerpt, content_html, content_markdown, status,
           published_at, cover_url, is_pinned, comments_mode
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
      );
    articleId = Number(result.lastInsertRowid);
    const addEvent = db.prepare(
      `INSERT INTO event_articles(event_id,article_id,sort_order)
       SELECT ?, ?, COALESCE(MAX(sort_order), -1) + 1
       FROM event_articles WHERE event_id=?`,
    );
    for (const eventId of eventIds) addEvent.run(eventId, articleId, eventId);
    const snapshot = db.prepare("SELECT * FROM articles WHERE id=?").get(articleId);
    recordContentRevision("article", articleId, "create", {
      article: snapshot,
      event_ids: eventIds,
    });
    auditAdmin("create", "article", articleId, { title, slug });
  })();
  claimUploadedAssets([coverUrl, content]);
  cleanupUnreferencedUploads();

  return Response.json({ ok: true, id: articleId, slug });
}
