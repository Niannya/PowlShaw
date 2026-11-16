import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { EventMapSpecialView } from "@/components/events/EventMapSpecialView";
import { getEventDetail } from "@/lib/queries";
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
  const snapshotValue = (await searchParams).snapshot;
  const snapshotId = Array.isArray(snapshotValue) ? undefined : Number(snapshotValue);
  const validSnapshotId =
    typeof snapshotId === "number" && Number.isSafeInteger(snapshotId) && snapshotId > 0
      ? snapshotId
      : undefined;

  const data = await getEventDetail(slug, validSnapshotId);
  if (!data) {
    const target = await getSlugRedirect("event", slug);
    if (target) permanentRedirect(`/events/${target}`);
    notFound();
  }
  if (!data.map) notFound();

  return <EventMapSpecialView data={data} />;
}
