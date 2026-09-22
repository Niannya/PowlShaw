import { Breadcrumbs } from "@/components/Breadcrumbs";
import { siteConfig } from "@/config/site";

export const metadata = { title: siteConfig.about.title };

export default function AboutPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: siteConfig.about.title }]} />
      <div className="page-pad">
        <h1 className="site-heading">{siteConfig.about.title}</h1>
        <section className="article-content">
          {siteConfig.about.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      </div>
    </>
  );
}
