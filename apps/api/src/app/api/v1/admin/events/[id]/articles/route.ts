import { jsonError } from "@/lib/admin";
import { auditAdmin, recordContentRevision } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const eventId = Number((await params).id);
  if (!Number.isSafeInteger(eventId)) return jsonError("活动不存在。", 404);
  const body = (await request.json().catch(() => null)) as {
    articles?: unknown[];
    article_ids?: unknown[];
    sections?: unknown[];
  } | null;
  const source = Array.isArray(body?.articles)
    ? body.articles
    : Array.isArray(body?.article_ids)
      ? body.article_ids.map((id) => ({ id }))
      : [];
  const seen = new Set<number>();
  const articles = source.flatMap((value) => {
    const item = typeof value === "object" && value !== null ? value : { id: value };
    const id = Number((item as { id?: unknown }).id);
    if (!Number.isSafeInteger(id) || seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        sectionPath: String(
          (item as { section_path?: unknown }).section_path ||
            [
              (item as { group_name?: unknown }).group_name,
              (item as { stage_name?: unknown }).stage_name,
            ]
              .filter(Boolean)
              .join(" / "),
        )
          .trim()
          .slice(0, 160),
      },
    ];
  });
  const suppliedSections = Array.isArray(body?.sections) ? body.sections : [];
  const sectionNames: string[] = [];
  const seenSectionNames = new Set<string>();
  for (const value of suppliedSections) {
    const rawName =
      typeof value === "object" && value !== null
        ? (value as { path_name?: unknown }).path_name
        : value;
    const pathName = normalizeSectionPath(rawName);
    if (!pathName) return jsonError("分组名称不能为空。");
    const compareName = pathName.toLocaleLowerCase("zh-CN");
    if (seenSectionNames.has(compareName)) return jsonError(`分组“${pathName}”重复了。`);
    seenSectionNames.add(compareName);
    sectionNames.push(pathName);
  }

  // 兼容旧客户端：没有单独提交分组时，按文章第一次出现的栏目路径建立分组。
  if (!Array.isArray(body?.sections)) {
    for (const article of articles) {
      const compareName = article.sectionPath.toLocaleLowerCase("zh-CN");
      if (!article.sectionPath || seenSectionNames.has(compareName)) continue;
      seenSectionNames.add(compareName);
      sectionNames.push(article.sectionPath);
    }
  }
  const knownSections = new Set(sectionNames.map((name) => name.toLocaleLowerCase("zh-CN")));
  if (
    articles.some(
      (article) =>
        article.sectionPath && !knownSections.has(article.sectionPath.toLocaleLowerCase("zh-CN")),
    )
  ) {
    return jsonError("有文章被放入了不存在的分组，请刷新页面后重试。");
  }
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM events WHERE id=?").get(eventId)) {
    return jsonError("活动不存在。", 404);
  }
  if (articles.length) {
    const placeholders = articles.map(() => "?").join(",");
    const found = (
      db
        .prepare(`SELECT COUNT(*) AS count FROM articles WHERE id IN (${placeholders})`)
        .get(...articles.map((article) => article.id)) as { count: number }
    ).count;
    if (found !== articles.length) return jsonError("部分文章已经不存在，请刷新页面。", 409);
  }
  const previous = {
    event_articles: db
      .prepare("SELECT * FROM event_articles WHERE event_id=? ORDER BY sort_order, article_id")
      .all(eventId),
    event_sections: db
      .prepare("SELECT * FROM event_sections WHERE event_id=? ORDER BY sort_order, id")
      .all(eventId),
  };
  const replace = db.transaction(() => {
    recordContentRevision("event", eventId, "update-articles", previous);
    db.prepare("DELETE FROM event_articles WHERE event_id=?").run(eventId);
    db.prepare("DELETE FROM event_sections WHERE event_id=?").run(eventId);
    const insertSection = db.prepare(
      `INSERT INTO event_sections(event_id,path_name,sort_order)
       VALUES(?,?,?)`,
    );
    sectionNames.forEach((pathName, index) => insertSection.run(eventId, pathName, index));
    const insert = db.prepare(
      `INSERT INTO event_articles(event_id,article_id,section_path,sort_order)
       VALUES(?,?,?,?)`,
    );
    articles.forEach((article, index) =>
      insert.run(eventId, article.id, article.sectionPath, index),
    );
    auditAdmin("update-articles", "event", eventId, {
      count: articles.length,
      sections: sectionNames.length,
    });
  });
  replace();
  return Response.json({ ok: true, count: articles.length, sectionCount: sectionNames.length });
}

function normalizeSectionPath(value: unknown) {
  return String(value || "")
    .split(/\s*(?:\/|／|>|＞)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ")
    .slice(0, 160);
}
