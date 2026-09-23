import { containsLike } from "@/lib/db-search";
import { getDb } from "@/lib/db";
import type { EditableEventMapNode } from "@/lib/event-map-node-validation";

export type EventMapArticle = {
  id: number;
  slug: string;
  title: string;
};

export type EventMapNode = EditableEventMapNode & {
  id: number;
  event_id: number;
  user_id: number;
  owner_name: string;
  articles: EventMapArticle[];
  created_at: string;
  updated_at: string;
};

type NodeRow = Omit<EventMapNode, "article_ids" | "articles">;
type NodeArticleRow = EventMapArticle & { node_id: number };

const nodeSelect = `
  SELECT n.id, n.event_id, n.user_id, n.name, n.description, n.notes,
         n.x, n.y, n.created_at, n.updated_at, u.display_name AS owner_name
  FROM event_map_nodes n
  JOIN users u ON u.id=n.user_id
`;

function hydrateNodes(rows: NodeRow[]) {
  if (!rows.length) return [];

  const placeholders = rows.map(() => "?").join(", ");
  const linkedArticles = getDb()
    .prepare(
      `SELECT na.node_id, a.id, a.slug, a.title
       FROM event_map_node_articles na
       JOIN articles a ON a.id=na.article_id AND a.status='published'
       WHERE na.node_id IN (${placeholders})
       ORDER BY na.node_id, na.sort_order, a.id`,
    )
    .all(...rows.map((row) => row.id)) as NodeArticleRow[];
  const articlesByNode = new Map<number, EventMapArticle[]>();

  for (const { node_id: nodeId, ...article } of linkedArticles) {
    const articles = articlesByNode.get(nodeId) || [];
    articles.push(article);
    articlesByNode.set(nodeId, articles);
  }

  return rows.map((row) => {
    const articles = articlesByNode.get(row.id) || [];
    return { ...row, articles, article_ids: articles.map((article) => article.id) };
  });
}

export function getEventMapNodes(eventId: number) {
  const rows = getDb()
    .prepare(
      `${nodeSelect}
       WHERE n.event_id=? AND n.deleted_at IS NULL
       ORDER BY n.created_at, n.id`,
    )
    .all(eventId) as NodeRow[];
  return hydrateNodes(rows);
}

export function getEventMapNode(nodeId: number) {
  const row = getDb().prepare(`${nodeSelect} WHERE n.id=? AND n.deleted_at IS NULL`).get(nodeId) as
    NodeRow | undefined;
  return row ? hydrateNodes([row])[0] : undefined;
}

export function searchEventMapArticles(query: string, limit = 20) {
  const value = containsLike(query.trim());
  const safeLimit = Math.min(30, Math.max(1, Math.trunc(limit)));
  return getDb()
    .prepare(
      `SELECT id, slug, title
       FROM articles
       WHERE status='published' AND (title LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')
       ORDER BY published_at DESC, id DESC
       LIMIT ?`,
    )
    .all(value, value, safeLimit) as EventMapArticle[];
}

export function eventMapArticleIdsExist(articleIds: number[]) {
  if (!articleIds.length) return true;
  const placeholders = articleIds.map(() => "?").join(", ");
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM articles
       WHERE status='published' AND id IN (${placeholders})`,
    )
    .get(...articleIds) as { count: number };
  return row.count === articleIds.length;
}

export function replaceEventMapNodeArticles(nodeId: number, articleIds: number[]) {
  const db = getDb();
  db.prepare("DELETE FROM event_map_node_articles WHERE node_id=?").run(nodeId);
  const insert = db.prepare(
    `INSERT INTO event_map_node_articles(node_id, article_id, sort_order)
     VALUES (?, ?, ?)`,
  );
  articleIds.forEach((articleId, index) => insert.run(nodeId, articleId, index));
}

export function eventHasEnabledMap(eventId: number) {
  return Boolean(
    getDb()
      .prepare("SELECT 1 FROM event_map_settings WHERE event_id=? AND is_enabled=1")
      .get(eventId),
  );
}
