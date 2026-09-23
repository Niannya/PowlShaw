import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { EventMapSpecialView } from "@/components/events/EventMapSpecialView";
import { getEventMapSettingsBySlug } from "@/lib/event-map-settings";
import { getEvent } from "@/lib/queries";
import { getSlugRedirect } from "@/lib/slug-redirects";

const slug = "the-legends-of-countries";

export const metadata: Metadata = {
  title: "列国纪",
  description: "在共同书写的世界中，浏览地图、设定与故事。",
};

export default async function LegendsOfCountriesPage({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string | string[] }>;
}) {
  const event = getEvent(slug);
  if (!event) {
    const target = getSlugRedirect("event", slug);
    if (target) permanentRedirect(`/events/${target}`);
    notFound();
  }
  const map = getEventMapSettingsBySlug(slug);
  if (!map) notFound();

  const snapshotValue = (await searchParams).snapshot;
  const snapshotId = Array.isArray(snapshotValue) ? undefined : Number(snapshotValue);

  return (
    <EventMapSpecialView
      event={event}
      map={map}
      snapshotId={
        typeof snapshotId === "number" && Number.isSafeInteger(snapshotId) && snapshotId > 0
          ? snapshotId
          : undefined
      }
    />
  );
}
