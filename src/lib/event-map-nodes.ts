import { getDb } from "@/lib/db";
import type { EditableEventMapNode } from "@/lib/event-map-node-validation";

export type EventMapNode = EditableEventMapNode & {
  id: number;
  event_id: number;
  user_id: number;
  owner_name: string;
  created_at: string;
  updated_at: string;
};

const nodeSelect = `
  SELECT n.id, n.event_id, n.user_id, n.name, n.description, n.notes,
         n.x, n.y, n.created_at, n.updated_at, u.display_name AS owner_name
  FROM event_map_nodes n
  JOIN users u ON u.id=n.user_id
`;

export function getEventMapNodes(eventId: number) {
  return getDb()
    .prepare(
      `${nodeSelect}
       WHERE n.event_id=? AND n.deleted_at IS NULL
       ORDER BY n.created_at, n.id`,
    )
    .all(eventId) as EventMapNode[];
}

export function getEventMapNode(nodeId: number) {
  return getDb().prepare(`${nodeSelect} WHERE n.id=? AND n.deleted_at IS NULL`).get(nodeId) as
    EventMapNode | undefined;
}

export function eventHasEnabledMap(eventId: number) {
  return Boolean(
    getDb()
      .prepare("SELECT 1 FROM event_map_settings WHERE event_id=? AND is_enabled=1")
      .get(eventId),
  );
}
