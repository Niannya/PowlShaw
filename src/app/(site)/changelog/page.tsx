import { Breadcrumbs } from "@/components/Breadcrumbs";
import { siteConfig } from "@/config/site";

export const metadata = { title: siteConfig.changelog.title };

export default function ChangelogPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: siteConfig.changelog.title }]} />
      <div className="page-pad">
        <h1 className="site-heading">{siteConfig.changelog.title}</h1>
        <section className="panel">
          <h2 className="panel-title green">{siteConfig.changelog.entryTitle}</h2>
          <div className="panel-body">
            <p>{siteConfig.changelog.entryText}</p>
          </div>
        </section>
      </div>
    </>
  );
}
