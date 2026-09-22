import { Breadcrumbs } from "@/components/Breadcrumbs";

const pageTitle = "关于破晓";
const paragraphs = [
  "破晓是写作组所举办的一系列小说比赛以及相关活动。",
  "而此网站则为了记录破晓而设立。",
  "网站目前提供作品展示与受邀账号评论，不开放公开注册或公众投稿。",
];

export const metadata = { title: pageTitle };

export default function AboutPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: pageTitle }]} />
      <div className="page-pad">
        <h1 className="site-heading">{pageTitle}</h1>
        <section className="article-content">
          {/* 本页固定内容放在文件顶部，调整文字时不会影响页面结构。 */}
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      </div>
    </>
  );
}
