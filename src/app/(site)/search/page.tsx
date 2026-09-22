import Link from "next/link";
import { ArticleList } from "@/components/ArticleList";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getArticlesByYear, searchArticles } from "@/lib/queries";

export const metadata = { title: "搜索" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; year?: string; page?: string }>;
}) {
  const { q = "", year = "", page: rawPage = "1" } = await searchParams;
  const requestedPage = Math.max(1, Number(rawPage) || 1);
  let result = { items: [], total: 0, page: 1, pages: 1 } as ReturnType<typeof searchArticles>;
  if (q.trim()) {
    result = searchArticles(q.trim(), requestedPage);
  } else if (/^\d{4}$/.test(year)) {
    result = getArticlesByYear(year, requestedPage);
  }
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    else if (year) params.set("year", year);
    params.set("page", String(target));
    return `/search?${params}`;
  };
  return (
    <>
      <Breadcrumbs items={[{ label: "搜索" }]} />
      <div className="page-pad">
        <h1 className="site-heading">文章搜索</h1>
        <form className="search-form">
          <input
            name="q"
            defaultValue={q}
            placeholder="输入标题或正文中的词语"
            aria-label="搜索词"
          />
          <button type="submit">搜索</button>
        </form>
        {q || year ? (
          <>
            <section className="panel" style={{ marginTop: 15 }}>
              <h2 className="panel-title blue">{year ? `${year} 年文章` : `“${q}”的搜索结果`}</h2>
              <div className="panel-body">
                <ArticleList articles={result.items} empty="没有找到相符的文章。" />
              </div>
            </section>
            {result.pages > 1 ? (
              <nav className="pagination">
                {result.page > 1 ? (
                  <Link href={pageHref(result.page - 1)}>← 上一页</Link>
                ) : (
                  <span />
                )}
                <span>
                  第 {result.page} / {result.pages} 页 · 共 {result.total} 篇
                </span>
                {result.page < result.pages ? (
                  <Link href={pageHref(result.page + 1)}>下一页 →</Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </>
        ) : (
          <p>输入词语后即可搜索文章标题和正文。</p>
        )}
      </div>
    </>
  );
}
