import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ImageMapViewer } from "@/components/maps/ImageMapViewer";
import { EventMapSnapshotSelector } from "@/components/maps/EventMapSnapshotSelector";
import { getEventMapSettingsBySlug } from "@/lib/event-map-settings";
import { getEventMapNodes } from "@/lib/event-map-nodes";
import { getEventMapRegions } from "@/lib/event-map-regions";
import { getEventMapRelations } from "@/lib/event-map-relations";
import { getEventMapSnapshot, getEventMapSnapshots } from "@/lib/event-map-snapshots";
import { getEvent } from "@/lib/queries";
import { getCurrentUser, userCanPublishContent } from "@/lib/user-auth";

type MapPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ snapshot?: string | string[] }>;
};

export async function generateMetadata({ params }: MapPageProps): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug);
  const map = getEventMapSettingsBySlug(slug);

  return map?.is_enabled ? { title: map.map_title, description: map.map_description } : {};
}

export default async function EventMapPage({ params, searchParams }: MapPageProps) {
  const slug = decodeURIComponent((await params).slug);
  const event = getEvent(slug);
  const map = getEventMapSettingsBySlug(slug);

  if (!event || !map?.is_enabled || !map.image_url) notFound();

  const snapshotValue = (await searchParams).snapshot;
  const requestedSnapshot = Array.isArray(snapshotValue) ? undefined : Number(snapshotValue);
  const snapshot =
    typeof requestedSnapshot === "number" &&
    Number.isSafeInteger(requestedSnapshot) &&
    requestedSnapshot > 0
      ? getEventMapSnapshot(event.id, requestedSnapshot)
      : undefined;
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
          { label: event.title, href: `/events/${event.slug}` },
          { label: "世界地图" },
        ]}
      />
      <div className="page-pad lieguoji-special-page event-map-page">
        <header className="article-header">
          <div className="event-heading-row">
            <h1>{map.map_title}</h1>
            <span className="event-status active">{snapshot ? "历史快照" : "当前世界"}</span>
          </div>
          {map.map_description ? <p>{map.map_description}</p> : null}
        </header>
        <EventMapSnapshotSelector
          snapshots={snapshots}
          selectedSnapshot={snapshot}
          basePath={`/events/${event.slug}/map`}
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
          loginPath={`/login?next=${encodeURIComponent(`/events/${event.slug}/map`)}`}
        />
      </div>
    </>
  );
}
