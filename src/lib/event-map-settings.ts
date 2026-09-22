import { getDefaultEventMapConfig, type EventMapConfig } from "@/config/event-maps";
import { getDb } from "@/lib/db";
export {
  normalizeEventMapSettings,
  validEventMapImageUrl,
  type EditableEventMapSettings,
} from "@/lib/event-map-validation";

export type EventMapSettings = EventMapConfig & {
  event_id: number;
  is_enabled: number;
};

export function getEventMapSettings(eventId: number) {
  return getDb()
    .prepare(
      `SELECT event_id, is_enabled, map_title, map_description,
              image_url, image_alt, image_width, image_height,
              hero_kicker, map_eyebrow, map_section_title,
              introduction_eyebrow, introduction_title,
              works_eyebrow, works_title
       FROM event_map_settings WHERE event_id=?`,
    )
    .get(eventId) as EventMapSettings | undefined;
}

export function getEventMapSettingsBySlug(slug: string) {
  const row = getDb()
    .prepare(
      `SELECT m.event_id, m.is_enabled, m.map_title, m.map_description,
              m.image_url, m.image_alt, m.image_width, m.image_height,
              m.hero_kicker, m.map_eyebrow, m.map_section_title,
              m.introduction_eyebrow, m.introduction_title,
              m.works_eyebrow, m.works_title
       FROM event_map_settings m
       JOIN events e ON e.id=m.event_id
       WHERE e.slug=?`,
    )
    .get(slug) as EventMapSettings | undefined;

  if (row) return row;
  const defaults = getDefaultEventMapConfig(slug);
  if (!defaults) return undefined;
  const event = getDb().prepare("SELECT id FROM events WHERE slug=?").get(slug) as
    { id: number } | undefined;
  return event ? { event_id: event.id, is_enabled: 1, ...defaults } : undefined;
}
