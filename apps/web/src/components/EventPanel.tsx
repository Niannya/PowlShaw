import Link from "next/link";
import { GenerativeHeader } from "@/components/visuals/GenerativeHeader";
import { formatMonth } from "@/lib/content";
import { eventStatus } from "@/lib/event-status";
import type { Event } from "@/lib/queries";

const statusName = { upcoming: "即将开始", active: "进行中", ended: "已经结束" };

export function EventPanel({
  event,
  openInNewTab = false,
}: {
  event?: Event;
  openInNewTab?: boolean;
}) {
  const linkTarget = openInNewTab ? "_blank" : undefined;
  const linkRel = openInNewTab ? "noopener noreferrer" : undefined;
  if (!event) {
    return (
      <section className="panel event-panel">
        <h2 className="panel-title coral">正在进行的活动</h2>
        <div className="panel-body">
          <p>目前没有正在进行的活动。</p>
          <Link href="/events" target={linkTarget} rel={linkRel}>
            查看往期活动 →
          </Link>
        </div>
      </section>
    );
  }
  const status = eventStatus(event);
  const panelTitle = status === "ended" ? "往期活动精选" : "正在进行的活动";
  const dateRange =
    event.starts_at || event.ends_at
      ? `${formatMonth(event.starts_at)} — ${formatMonth(event.ends_at)}`
      : "";

  return (
    <section className="panel event-panel">
      <h2 className="panel-title coral">{panelTitle}</h2>
      <div className="panel-body event-panel-body">
        <GenerativeHeader
          slug={event.slug}
          title={
            <Link href={`/events/${event.slug}`} target={linkTarget} rel={linkRel}>
              {event.title}
            </Link>
          }
          subtitle={
            <>
              <span className={`event-status ${status}`}>{statusName[status]}</span>
              {dateRange ? <span className="event-panel-date">　{dateRange}</span> : null}
            </>
          }
          theme={event.visual_theme}
          variant="compact"
          headingLevel={3}
        />
        <p>{event.summary || "点击进入活动页面，查看活动介绍与参与作品。"}</p>
        <Link
          className="old-button"
          href={`/events/${event.slug}`}
          target={linkTarget}
          rel={linkRel}
        >
          进入活动页面
        </Link>
      </div>
    </section>
  );
}
