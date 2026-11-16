import Link from "next/link";
import { formatDate } from "@/lib/content";
import type { ArticleListItem } from "@/lib/queries";

export function ArticleList({
  articles,
  empty = "这里还没有文章。",
}: {
  articles: ArticleListItem[];
  empty?: string;
}) {
  if (!articles.length) return <p className="empty-note">{empty}</p>;
  return (
    <ul className="article-list">
      {articles.map((article) => (
        <li key={article.id}>
          <div>
            {article.is_pinned ? <span className="pin">置顶</span> : null}
            <Link href={`/articles/${article.slug}`}>{article.title}</Link>
          </div>
          <time>{formatDate(article.published_at)}</time>
        </li>
      ))}
    </ul>
  );
}
