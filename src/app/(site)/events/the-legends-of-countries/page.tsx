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

export default function LegendsOfCountriesPage() {
  const event = getEvent(slug);
  if (!event) {
    const target = getSlugRedirect("event", slug);
    if (target) permanentRedirect(`/events/${target}`);
    notFound();
  }
  const map = getEventMapSettingsBySlug(slug);
  if (!map) notFound();

  return <EventMapSpecialView event={event} map={map} />;
}
