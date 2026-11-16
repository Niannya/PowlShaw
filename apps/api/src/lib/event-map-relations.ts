import { getDb } from "@/lib/db";
import type { EditableEventMapRelation } from "@/lib/event-map-relation-validation";

export type EventMapRelation = EditableEventMapRelation & {
  id: number;
  event_id: number;
  user_id: number;
  owner_name: string;
  source_name: string;
  target_name: string;
  created_at: string;
  updated_at: string;
};

const relationSelect = `
  SELECT r.id, r.event_id, r.user_id, r.source_node_id, r.target_node_id,
         r.name, r.description, r.notes, r.created_at, r.updated_at,
         u.display_name AS owner_name,
         source.name AS source_name, target.name AS target_name
  FROM event_map_relations r
  JOIN users u ON u.id=r.user_id
  JOIN event_map_nodes source
    ON source.id=r.source_node_id AND source.deleted_at IS NULL
  JOIN event_map_nodes target
    ON target.id=r.target_node_id AND target.deleted_at IS NULL
`;

export function getEventMapRelations(eventId: number) {
  return getDb()
    .prepare(
      `${relationSelect}
       WHERE r.event_id=? AND r.deleted_at IS NULL
         AND source.event_id=r.event_id AND target.event_id=r.event_id
       ORDER BY r.created_at, r.id`,
    )
    .all(eventId) as EventMapRelation[];
}

export function getEventMapRelation(relationId: number) {
  return getDb()
    .prepare(
      `${relationSelect}
       WHERE r.id=? AND r.deleted_at IS NULL
         AND source.event_id=r.event_id AND target.event_id=r.event_id`,
    )
    .get(relationId) as EventMapRelation | undefined;
}

export function eventMapRelationNodesExist(
  eventId: number,
  sourceNodeId: number,
  targetNodeId: number,
) {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM event_map_nodes
       WHERE event_id=? AND deleted_at IS NULL AND id IN (?, ?)`,
    )
    .get(eventId, sourceNodeId, targetNodeId) as { count: number };
  return row.count === 2;
}
