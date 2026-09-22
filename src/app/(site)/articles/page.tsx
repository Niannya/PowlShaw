import Link from "next/link";
import { ArticleList } from "@/components/ArticleList";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getArticles } from "@/lib/queries";

export const metadata = { title: "全部文章" };

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number(rawPage || 1) || 1);
  const result = getArticles(page, 30);
  return (
    <>
      <Breadcrumbs items={[{ label: "全部文章" }]} />
      <div className="page-pad">
        <h1 className="site-heading">全部文章</h1>
        <p className="site-subheading">现存档案共 {result.total} 篇，按发布日期排列。</p>
        <section className="panel">
          <div className="panel-body">
            <ArticleList articles={result.items} />
          </div>
        </section>
        {result.pages > 1 && (
          <nav className="pagination">
            {result.page > 1 ? (
              <Link href={`/articles?page=${result.page - 1}`}>← 上一页</Link>
            ) : (
              <span />
            )}
            <span>
              第 {result.page} / {result.pages} 页
            </span>
            {result.page < result.pages ? (
              <Link href={`/articles?page=${result.page + 1}`}>下一页 →</Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </>
  );
}
