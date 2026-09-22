import { AnnouncementPanel } from "@/components/AnnouncementPanel";
import { ArticleList } from "@/components/ArticleList";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EventPanel } from "@/components/EventPanel";
import { WelcomePanel } from "@/components/WelcomePanel";
import { getFeaturedEvent, getRecentArticles } from "@/lib/queries";
import { getSiteSettings } from "@/lib/site-settings";

export default function HomePage() {
  const articles = getRecentArticles(15);
  const event = getFeaturedEvent();
  const settings = getSiteSettings();
  const visitCount = Math.max(0, Number.parseInt(settings.visit_count, 10) || 0);
  return (
    <>
      <Breadcrumbs items={[]} />
      <div className="page-pad">
        <WelcomePanel
          initialVisits={visitCount}
          welcome={{
            title: settings.welcome_title,
            opening: settings.welcome_opening,
            aboutLink: settings.welcome_about_link,
            randomLink: settings.welcome_random_link,
            treatPrefix: settings.welcome_treat_prefix,
            cookieButton: settings.welcome_cookie_button,
            teaButton: settings.welcome_tea_button,
            treatSuffix: settings.welcome_treat_suffix,
            closing: settings.welcome_closing,
            visitPrefix: settings.welcome_visit_prefix,
            visitSuffix: settings.welcome_visit_suffix,
          }}
        />
        {settings.announcement_enabled === "1" && settings.announcement_body ? (
          <AnnouncementPanel
            title={settings.announcement_title}
            body={settings.announcement_body}
            linkLabel={settings.announcement_link_label}
            linkUrl={settings.announcement_link_url}
          />
        ) : null}
        <EventPanel event={event} />
        <section className="panel">
          <h2 className="panel-title blue">最近更新</h2>
          <div className="panel-body">
            <ArticleList articles={articles} />
          </div>
        </section>
      </div>
    </>
  );
}
