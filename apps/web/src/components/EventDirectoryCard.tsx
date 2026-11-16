import Link from "next/link";

export type EventCardStatus = "active" | "upcoming" | "ended";

export type EventCardData = {
  id: number;
  title: string;
  slug: string;
  summary: string;
  article_count?: number;
};

const statusLabels: Record<EventCardStatus, string> = {
  active: "进行中",
  upcoming: "即将开始",
  ended: "已经结束",
};

export function EventDirectoryCard({
  event,
  status,
  openInNewTab = false,
  headingLevel = 3,
}: {
  event: EventCardData;
  status: EventCardStatus;
  openInNewTab?: boolean;
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="directory-card">
      <div className="event-heading-row">
        <Heading>
          <Link
            href={`/events/${event.slug}`}
            target={openInNewTab ? "_blank" : undefined}
            rel={openInNewTab ? "noopener noreferrer" : undefined}
          >
            {event.title}
          </Link>
        </Heading>
        <span className={`event-status ${status}`}>{statusLabels[status]}</span>
      </div>
      <p>{event.summary || "暂无活动简介。"}</p>
      <p className="count">{event.article_count || 0} 篇参与作品</p>
    </section>
  );
}
