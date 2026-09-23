import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EventArticleDirectory } from "@/components/EventArticleDirectory";
import { ImageMapViewer } from "@/components/maps/ImageMapViewer";
import { EventMapSnapshotSelector } from "@/components/maps/EventMapSnapshotSelector";
import { cleanHtml, formatMonth } from "@/lib/content";
import { eventGroupLabel } from "@/lib/event-groups";
import type { EventMapSettings } from "@/lib/event-map-settings";
import { getEventMapNodes } from "@/lib/event-map-nodes";
import { getEventMapRegions } from "@/lib/event-map-regions";
import { getEventMapRelations } from "@/lib/event-map-relations";
import { getEventMapSnapshot, getEventMapSnapshots } from "@/lib/event-map-snapshots";
import { eventStatus, getArticlesByEvent, getEventDocuments, type Event } from "@/lib/queries";
import { getCurrentUser, userCanPublishContent } from "@/lib/user-auth";

const labels = { active: "进行中", upcoming: "即将开始", ended: "已经结束" };

export async function EventMapSpecialView({
  event,
  map,
  snapshotId,
}: {
  event: Event;
  map: EventMapSettings;
  snapshotId?: number;
}) {
  const status = eventStatus(event);
  const articles = getArticlesByEvent(event.id);
  const documents = getEventDocuments(event.id);
  const snapshot = snapshotId ? getEventMapSnapshot(event.id, snapshotId) : undefined;
  const snapshots = getEventMapSnapshots(event.id);
  const nodes = snapshot?.nodes || getEventMapNodes(event.id);
  const regions = snapshot?.regions || getEventMapRegions(event.id);
  const relations = snapshot?.relations || getEventMapRelations(event.id);
  const displayMap = snapshot?.map || map;
  const user = snapshot ? undefined : await getCurrentUser();
  const mapUser = user
    ? {
        id: user.id,
        displayName: user.display_name,
        canEdit: userCanPublishContent(user),
      }
    : undefined;

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

      <div className="page-pad lieguoji-special-page">
        <header className="lieguoji-hero">
          {map.hero_kicker ? <p className="lieguoji-kicker">{map.hero_kicker}</p> : null}
          <div className="lieguoji-title-row">
            <h1>{event.title}</h1>
          </div>
          <p className="lieguoji-summary">{event.summary}</p>
          {event.starts_at || event.ends_at ? (
            <p className="lieguoji-date">
              <span>
                活动时间：{formatMonth(event.starts_at)} — {formatMonth(event.ends_at)}
              </span>
              <span className={`event-status ${status}`}>{labels[status]}</span>
            </p>
          ) : null}
          <nav className="lieguoji-jump-links" aria-label="专题页目录">
            {map.is_enabled && map.image_url ? <a href="#world-map">世界地图</a> : null}
            {event.content_html ? <a href="#event-introduction">活动介绍</a> : null}
            <a href="#event-works">参与作品</a>
          </nav>
        </header>

        {map.is_enabled && map.image_url ? (
          <section className="lieguoji-map-feature" id="world-map">
            <div className="lieguoji-section-heading">
              <div>
                {map.map_eyebrow ? <p>{map.map_eyebrow}</p> : null}
                <h2>{map.map_section_title}</h2>
              </div>
              <Link
                href={
                  snapshot
                    ? `/events/${event.slug}/map?snapshot=${snapshot.id}`
                    : `/events/${event.slug}/map`
                }
              >
                在独立页面打开
              </Link>
            </div>
            <EventMapSnapshotSelector
              snapshots={snapshots}
              selectedSnapshot={snapshot}
              basePath={`/events/${event.slug}`}
              anchor="#world-map"
            />
            <ImageMapViewer
              key={snapshot ? `snapshot-${snapshot.id}` : "current"}
              src={displayMap.image_url}
              alt={displayMap.image_alt}
              width={displayMap.image_width}
              height={displayMap.image_height}
              eventId={snapshot ? undefined : event.id}
              initialNodes={nodes}
              initialRegions={regions}
              initialRelations={relations}
              currentUser={snapshot ? undefined : mapUser}
              loginPath={`/login?next=${encodeURIComponent(`/events/${event.slug}#world-map`)}`}
            />
          </section>
        ) : null}

        {event.content_html ? (
          <section className="lieguoji-copy-section" id="event-introduction">
            <div className="lieguoji-section-heading">
              <div>
                {map.introduction_eyebrow ? <p>{map.introduction_eyebrow}</p> : null}
                <h2>{map.introduction_title}</h2>
              </div>
            </div>
            <div
              className="article-content lieguoji-article-content"
              dangerouslySetInnerHTML={{ __html: cleanHtml(event.content_html) }}
            />
          </section>
        ) : null}

        {documents.length > 0 ? (
          <section className="panel event-documents-panel">
            <h2 className="panel-title blue">活动资料下载</h2>
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

        <section className="lieguoji-works-section" id="event-works">
          <div className="lieguoji-section-heading">
            <div>
              {map.works_eyebrow ? <p>{map.works_eyebrow}</p> : null}
              <h2>{map.works_title}</h2>
            </div>
            <small>{articles.length} 篇</small>
          </div>
          <div className="lieguoji-works-body">
            <EventArticleDirectory articles={articles} />
          </div>
        </section>
      </div>
    </>
  );
}
