import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EventDirectoryCard } from "@/components/EventDirectoryCard";
import { EVENT_GROUPS } from "@/lib/event-groups";
import { eventStatus, getEvents } from "@/lib/queries";

export const metadata = { title: "活动专题" };

export default function EventsPage() {
  const events = getEvents();
  return (
    <>
      <Breadcrumbs items={[{ label: "活动专题" }]} />
      <div className="page-pad">
        <h1 className="site-heading">活动专题</h1>
        <p className="site-subheading">写作组历来举办过的活动！暂分为破晓和其他。</p>
        <nav className="event-directory-index" aria-label="活动类型">
          <strong>活动类型</strong>
          {EVENT_GROUPS.map((group) => (
            <a href={`#event-group-${group.id}`} key={group.id}>
              {group.label}
            </a>
          ))}
        </nav>
        {EVENT_GROUPS.map((group) => {
          const groupEvents = events.filter((event) => event.event_group === group.id);
          return (
            <section
              className="panel event-group-section"
              id={`event-group-${group.id}`}
              key={group.id}
            >
              <h2 className={`panel-title ${group.tone} event-group-heading`}>
                {group.label} <small>（{groupEvents.length} 个活动）</small>
              </h2>
              <div className="panel-body">
                {groupEvents.length ? (
                  <div className="directory-grid">
                    {groupEvents.map((event) => (
                      <EventDirectoryCard
                        event={event}
                        status={eventStatus(event)}
                        key={event.id}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="empty-note">暂无活动。</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
