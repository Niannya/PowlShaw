import { getDb } from "@/lib/db";
import type { EditableEventMapRegion, EventMapPoint } from "@/lib/event-map-region-validation";

export type EventMapRegion = EditableEventMapRegion & {
  id: number;
  event_id: number;
  user_id: number;
  owner_name: string;
  created_at: string;
  updated_at: string;
};

type RegionRow = Omit<EventMapRegion, "points"> & {
  points_json: string;
};

const regionSelect = `
  SELECT r.id, r.event_id, r.user_id, r.name, r.description, r.notes,
         r.color, r.points_json, r.created_at, r.updated_at,
         u.display_name AS owner_name
  FROM event_map_regions r
  JOIN users u ON u.id=r.user_id
`;

function hydrateRegion(row: RegionRow | undefined) {
  if (!row) return undefined;
  const { points_json: pointsJson, ...region } = row;
  return { ...region, points: JSON.parse(pointsJson) as EventMapPoint[] } satisfies EventMapRegion;
}

export function getEventMapRegions(eventId: number) {
  const rows = getDb()
    .prepare(
      `${regionSelect}
       WHERE r.event_id=? AND r.deleted_at IS NULL
       ORDER BY r.created_at, r.id`,
    )
    .all(eventId) as RegionRow[];
  return rows.map((row) => hydrateRegion(row)!);
}

export function getEventMapRegion(regionId: number) {
  const row = getDb()
    .prepare(`${regionSelect} WHERE r.id=? AND r.deleted_at IS NULL`)
    .get(regionId) as RegionRow | undefined;
  return hydrateRegion(row);
}
