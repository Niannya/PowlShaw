/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CommentSection } from "@/components/comments/CommentSection";
import { commentPageForId, getCommentsPage } from "@/lib/comments";
import { cleanHtml, formatDate } from "@/lib/content";
import { getArticle, getArticleNeighbors } from "@/lib/queries";
import { getSlugRedirect } from "@/lib/slug-redirects";
import { getCurrentUser } from "@/lib/user-auth";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ commentPage?: string; commentSort?: string; commentId?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const requestedSlug = decodeURIComponent((await params).slug);
  const article =
    getArticle(requestedSlug) ||
    (getSlugRedirect("article", requestedSlug)
      ? getArticle(getSlugRedirect("article", requestedSlug)!)
      : undefined);
  return article ? { title: article.title, description: article.excerpt } : { title: "文章不存在" };
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const requestedSlug = decodeURIComponent((await params).slug);
  const article = getArticle(requestedSlug);
  if (!article) {
    const target = getSlugRedirect("article", requestedSlug);
    if (target) {
      const query = await searchParams;
      const suffix = new URLSearchParams(
        Object.entries(query).filter(([, value]) => value) as [string, string][],
      ).toString();
      permanentRedirect(`/articles/${target}${suffix ? `?${suffix}` : ""}`);
    }
    notFound();
  }
  const neighbors = getArticleNeighbors(article.published_at, article.id);
  const query = await searchParams;
  const sort = query.commentSort === "newest" ? "newest" : "oldest";
  const requestedCommentId = Number(query.commentId || 0);
  const requestedPage = requestedCommentId
    ? commentPageForId(article.id, requestedCommentId, sort)
    : Math.max(1, Number(query.commentPage) || 1);
  const commentData = getCommentsPage(article.id, requestedPage, sort);
  const user = await getCurrentUser();
  return (
    <>
      <Breadcrumbs items={[{ label: "全部文章", href: "/articles" }, { label: article.title }]} />
      <div className="page-pad">
        <header className="article-header">
          <h1>{article.title}</h1>
          <p className="article-meta">发布：{formatDate(article.published_at)}</p>
          {article.events.length ? (
            <p className="article-meta">
              所属活动：
              {article.events.map((event, index) => (
                <span key={event.id}>
                  {index ? "、" : ""}
                  <Link href={`/events/${event.slug}`}>{event.title}</Link>
                </span>
              ))}
            </p>
          ) : null}
        </header>
        {article.cover_url ? (
          <img className="article-cover" src={article.cover_url} alt="" />
        ) : null}
        <article
          className="article-content"
          dangerouslySetInnerHTML={{ __html: cleanHtml(article.content_html) }}
        />
        {article.comments_mode !== "hidden" ? (
          <CommentSection
            articleId={article.id}
            articleSlug={article.slug}
            comments={commentData.comments}
            totalComments={commentData.totalComments}
            page={commentData.page}
            pages={commentData.pages}
            sort={commentData.sort}
            mode={article.comments_mode}
            user={user}
          />
        ) : null}
        <nav className="article-neighbors">
          <div>
            {neighbors.previous ? (
              <>
                上一篇：
                <Link href={`/articles/${neighbors.previous.slug}`}>
                  {neighbors.previous.title}
                </Link>
              </>
            ) : (
              "已经是最早一篇"
            )}
          </div>
          <div>
            {neighbors.next ? (
              <>
                下一篇：
                <Link href={`/articles/${neighbors.next.slug}`}>{neighbors.next.title}</Link>
              </>
            ) : (
              "已经是最新一篇"
            )}
          </div>
        </nav>
      </div>
    </>
  );
}
