import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ImageMapViewer } from "@/components/maps/ImageMapViewer";
import { getEventMapSettingsBySlug } from "@/lib/event-map-settings";
import { getEventMapNodes } from "@/lib/event-map-nodes";
import { getEventMapRelations } from "@/lib/event-map-relations";
import { getEvent } from "@/lib/queries";
import { getCurrentUser, userCanPublishContent } from "@/lib/user-auth";

type MapPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: MapPageProps): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug);
  const map = getEventMapSettingsBySlug(slug);

  return map?.is_enabled ? { title: map.map_title, description: map.map_description } : {};
}

export default async function EventMapPage({ params }: MapPageProps) {
  const slug = decodeURIComponent((await params).slug);
  const event = getEvent(slug);
  const map = getEventMapSettingsBySlug(slug);

  if (!event || !map?.is_enabled || !map.image_url) notFound();

  const nodes = getEventMapNodes(event.id);
  const relations = getEventMapRelations(event.id);
  const user = await getCurrentUser();
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
          { label: event.title, href: `/events/${event.slug}` },
          { label: "世界地图" },
        ]}
      />
      <div className="page-pad lieguoji-special-page event-map-page">
        <header className="article-header">
          <div className="event-heading-row">
            <h1>{map.map_title}</h1>
            <span className="event-status active">展示版</span>
          </div>
          {map.map_description ? <p>{map.map_description}</p> : null}
        </header>
        <ImageMapViewer
          src={map.image_url}
          alt={map.image_alt}
          width={map.image_width}
          height={map.image_height}
          eventId={event.id}
          initialNodes={nodes}
          initialRelations={relations}
          currentUser={mapUser}
          loginPath={`/login?next=${encodeURIComponent(`/events/${event.slug}/map`)}`}
        />
      </div>
    </>
  );
}
