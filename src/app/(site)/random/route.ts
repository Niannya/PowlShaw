import { getDb } from "@/lib/db";

export function GET(request: Request) {
  const article = getDb()
    .prepare("SELECT slug FROM articles WHERE status='published' ORDER BY RANDOM() LIMIT 1")
    .get() as { slug: string } | undefined;

  const destination = article ? `/articles/${encodeURIComponent(article.slug)}` : "/articles";
  return Response.redirect(new URL(destination, request.url), 307);
}
