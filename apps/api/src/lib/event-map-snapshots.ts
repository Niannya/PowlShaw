import { getDb } from "@/lib/db";
import type { EditableEventMapSnapshot } from "@/lib/event-map-snapshot-validation";
import { getEventMapNodes, type EventMapNode } from "@/lib/event-map-nodes";
import { getEventMapRegions, type EventMapRegion } from "@/lib/event-map-regions";
import { getEventMapRelations, type EventMapRelation } from "@/lib/event-map-relations";
import { getEventMapSettings } from "@/lib/event-map-settings";

export type EventMapSnapshotMap = {
  image_url: string;
  image_alt: string;
  image_width: number;
  image_height: number;
};

export type EventMapSnapshotPayload = {
  version: 1;
  map: EventMapSnapshotMap;
  nodes: EventMapNode[];
  regions: EventMapRegion[];
  relations: EventMapRelation[];
};

export type EventMapSnapshotSummary = {
  id: number;
  event_id: number;
  snapshot_date: string;
  title: string;
  description: string;
  node_count: number;
  region_count: number;
  relation_count: number;
  created_at: string;
};

export type EventMapSnapshot = EventMapSnapshotSummary & EventMapSnapshotPayload;

type SnapshotRow = Omit<
  EventMapSnapshotSummary,
  "node_count" | "region_count" | "relation_count"
> & {
  snapshot_json: string;
};

function parsePayload(value: string) {
  try {
    const payload = JSON.parse(value) as Partial<EventMapSnapshotPayload>;
    if (
      payload.version !== 1 ||
      !payload.map ||
      !Array.isArray(payload.nodes) ||
      !Array.isArray(payload.regions) ||
      !Array.isArray(payload.relations)
    ) {
      return undefined;
    }
    return payload as EventMapSnapshotPayload;
  } catch {
    return undefined;
  }
}

function hydrateSnapshot(row: SnapshotRow | undefined) {
  if (!row) return undefined;
  const payload = parsePayload(row.snapshot_json);
  if (!payload) return undefined;
  return {
    id: row.id,
    event_id: row.event_id,
    snapshot_date: row.snapshot_date,
    title: row.title,
    description: row.description,
    node_count: payload.nodes.length,
    region_count: payload.regions.length,
    relation_count: payload.relations.length,
    created_at: row.created_at,
    ...payload,
  } satisfies EventMapSnapshot;
}

export function eventMapSnapshotSummary(snapshot: EventMapSnapshot): EventMapSnapshotSummary {
  return {
    id: snapshot.id,
    event_id: snapshot.event_id,
    snapshot_date: snapshot.snapshot_date,
    title: snapshot.title,
    description: snapshot.description,
    node_count: snapshot.node_count,
    region_count: snapshot.region_count,
    relation_count: snapshot.relation_count,
    created_at: snapshot.created_at,
  };
}

export function getEventMapSnapshots(eventId: number) {
  const rows = getDb()
    .prepare(
      `SELECT id, event_id, snapshot_date, title, description, snapshot_json, created_at
       FROM event_map_snapshots
       WHERE event_id=?
       ORDER BY snapshot_date DESC, id DESC`,
    )
    .all(eventId) as SnapshotRow[];
  return rows.flatMap((row) => {
    const snapshot = hydrateSnapshot(row);
    if (!snapshot) return [];
    return [eventMapSnapshotSummary(snapshot)];
  });
}

export function getEventMapSnapshot(eventId: number, snapshotId: number) {
  const row = getDb()
    .prepare(
      `SELECT id, event_id, snapshot_date, title, description, snapshot_json, created_at
       FROM event_map_snapshots
       WHERE id=? AND event_id=?`,
    )
    .get(snapshotId, eventId) as SnapshotRow | undefined;
  return hydrateSnapshot(row);
}

export function createEventMapSnapshot(eventId: number, value: EditableEventMapSnapshot) {
  const db = getDb();
  return db.transaction(() => {
    const duplicate = db
      .prepare("SELECT 1 FROM event_map_snapshots WHERE event_id=? AND snapshot_date=?")
      .get(eventId, value.snapshot_date);
    if (duplicate) {
      return { ok: false, error: "这个日期已经有世界快照。" } as const;
    }

    const settings = getEventMapSettings(eventId);
    if (!settings?.image_url) {
      return { ok: false, error: "请先保存专题地图，再创建世界快照。" } as const;
    }
    const payload: EventMapSnapshotPayload = {
      version: 1,
      map: {
        image_url: settings.image_url,
        image_alt: settings.image_alt,
        image_width: settings.image_width,
        image_height: settings.image_height,
      },
      nodes: getEventMapNodes(eventId),
      regions: getEventMapRegions(eventId),
      relations: getEventMapRelations(eventId),
    };
    const result = db
      .prepare(
        `INSERT INTO event_map_snapshots(
           event_id, snapshot_date, title, description, snapshot_json
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(eventId, value.snapshot_date, value.title, value.description, JSON.stringify(payload));
    const snapshot = getEventMapSnapshot(eventId, Number(result.lastInsertRowid));
    if (!snapshot) throw new Error("The newly created map snapshot could not be read.");
    return { ok: true, snapshot } as const;
  })();
}

export function deleteEventMapSnapshot(eventId: number, snapshotId: number) {
  return getDb()
    .prepare("DELETE FROM event_map_snapshots WHERE id=? AND event_id=?")
    .run(snapshotId, eventId).changes;
}
