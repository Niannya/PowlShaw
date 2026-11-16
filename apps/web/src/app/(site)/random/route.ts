import { getRandomArticleSlug } from "@/lib/api/public";

export async function GET() {
  const slug = await getRandomArticleSlug();

  const destination = slug ? `/articles/${encodeURIComponent(slug)}` : "/articles";
  // Keep Location relative so an internal reverse-proxy origin such as localhost:3000
  // can never leak into the visitor-facing redirect.
  return new Response(null, { status: 307, headers: { Location: destination } });
}
