import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EventArticleDirectory } from "@/components/EventArticleDirectory";
import { EventExtensionSlot } from "@/components/events/EventExtensionSlot";
import { GenerativeHeader } from "@/components/visuals/GenerativeHeader";
import { cleanHtml, formatMonth } from "@/lib/content";
import { eventGroupLabel } from "@/lib/event-groups";
import { eventStatus, getEventDetail } from "@/lib/queries";
import { getSlugRedirect } from "@/lib/slug-redirects";

const labels = { active: "进行中", upcoming: "即将开始", ended: "已经结束" };

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const requestedSlug = decodeURIComponent((await params).slug);
  const data = await getEventDetail(requestedSlug);
  if (!data) {
    const target = await getSlugRedirect("event", requestedSlug);
    if (target) permanentRedirect(`/events/${target}`);
    notFound();
  }

  const { event, documents, articles, extensions } = data;
  const status = eventStatus(event);
  const dateRange =
    event.starts_at || event.ends_at
      ? `${formatMonth(event.starts_at)} — ${formatMonth(event.ends_at)}`
      : "";

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "活动专题", href: "/events" },
          {
            label: eventGroupLabel(event.event_group),
            href: `/events#event-group-${event.event_group}`,
          },
          { label: event.title },
        ]}
      />
      <div className="page-pad">
        <GenerativeHeader
          slug={event.slug}
          title={event.title}
          subtitle={event.summary || undefined}
          theme={event.visual_theme}
          variant="banner"
          headingLevel={1}
        >
          <span className={`event-status ${status}`}>{labels[status]}</span>
          {dateRange ? <span className="article-meta">活动时间：{dateRange}</span> : null}
        </GenerativeHeader>
        {event.content_html ? (
          <section
            className="article-content event-intro-panel"
            dangerouslySetInnerHTML={{ __html: cleanHtml(event.content_html) }}
          />
        ) : null}
        <EventExtensionSlot extensions={extensions} />
        {documents.length > 0 ? (
          <section className="panel event-documents-panel">
            <h2 className="panel-title blue">评议资料下载</h2>
            <div className="panel-body">
              <ul className="event-documents">
                {documents.map((document) => (
                  <li key={document.id}>
                    <a href={document.file_url} download={document.display_name}>
                      {document.display_name}
                    </a>
                    <small>
                      {document.context_label ? `${document.context_label} · ` : ""}
                      {document.display_name.split(".").at(-1)?.toUpperCase()} ·{" "}
                      {Math.ceil(document.file_size / 1024)} KB
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
        <section className="panel" style={{ marginTop: 14 }}>
          <h2 className="panel-title coral">参与作品</h2>
          <div className="panel-body">
            <EventArticleDirectory articles={articles} />
          </div>
        </section>
      </div>
    </>
  );
}
