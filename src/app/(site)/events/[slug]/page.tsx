/* eslint-disable @next/next/no-img-element */
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EventArticleDirectory } from "@/components/EventArticleDirectory";
import { EventMapSpecialView } from "@/components/events/EventMapSpecialView";
import { cleanHtml, formatMonth } from "@/lib/content";
import { eventGroupLabel } from "@/lib/event-groups";
import { getEventMapSettingsBySlug } from "@/lib/event-map-settings";
import { eventStatus, getArticlesByEvent, getEvent, getEventDocuments } from "@/lib/queries";
import { getSlugRedirect } from "@/lib/slug-redirects";

const labels = { active: "进行中", upcoming: "即将开始", ended: "已经结束" };
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ snapshot?: string | string[] }>;
}) {
  const requestedSlug = decodeURIComponent((await params).slug);
  const event = getEvent(requestedSlug);
  if (!event) {
    const target = getSlugRedirect("event", requestedSlug);
    if (target) permanentRedirect(`/events/${target}`);
    notFound();
  }
  const eventMap = getEventMapSettingsBySlug(event.slug);
  const snapshotValue = (await searchParams).snapshot;
  const snapshotId = Array.isArray(snapshotValue) ? undefined : Number(snapshotValue);
  if (eventMap) {
    return (
      <EventMapSpecialView
        event={event}
        map={eventMap}
        snapshotId={
          typeof snapshotId === "number" && Number.isSafeInteger(snapshotId) && snapshotId > 0
            ? snapshotId
            : undefined
        }
      />
    );
  }

  const status = eventStatus(event);
  const articles = getArticlesByEvent(event.id);
  const documents = getEventDocuments(event.id);
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
        <header className="article-header">
          {event.banner_url ? <img src={event.banner_url} alt="" /> : null}
          <div className="event-heading-row">
            <h1>{event.title}</h1>
            <span className={`event-status ${status}`}>{labels[status]}</span>
          </div>
          <p>{event.summary}</p>
          {event.starts_at || event.ends_at ? (
            <p className="article-meta">
              活动时间：{formatMonth(event.starts_at)} — {formatMonth(event.ends_at)}
            </p>
          ) : null}
        </header>
        {event.content_html ? (
          <section
            className="article-content"
            dangerouslySetInnerHTML={{ __html: cleanHtml(event.content_html) }}
          />
        ) : null}
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
