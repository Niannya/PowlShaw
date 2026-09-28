import { getDb } from "@/lib/db";
import { relativeRedirect } from "@/lib/redirect-response";

export function GET() {
  const article = getDb()
    .prepare("SELECT slug FROM articles WHERE status='published' ORDER BY RANDOM() LIMIT 1")
    .get() as { slug: string } | undefined;

  const destination = article ? `/articles/${encodeURIComponent(article.slug)}` : "/articles";
  // Keep Location relative so an internal reverse-proxy origin such as localhost:3000
  // can never leak into the visitor-facing redirect.
  return relativeRedirect(destination);
}
