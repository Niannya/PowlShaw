import { jsonError } from "@/lib/admin";
import { auditAdmin } from "@/lib/audit";
import { isAdminRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { normalizeEventMapSettings } from "@/lib/event-map-settings";
import { claimUploadedAssets, cleanupUnreferencedUploads } from "@/lib/uploaded-assets";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const eventId = Number((await params).id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return jsonError("活动不存在。", 404);
  const db = getDb();
  const event = db.prepare("SELECT id, slug FROM events WHERE id=?").get(eventId) as
    { id: number; slug: string } | undefined;
  if (!event) return jsonError("活动不存在。", 404);

  const settings = normalizeEventMapSettings(await request.json().catch(() => null));
  if (!settings.ok) return jsonError(settings.error);
  const value = settings.value;

  db.prepare(
    `INSERT INTO event_map_settings(
       event_id, is_enabled, map_title, map_description,
       image_url, image_alt, image_width, image_height,
       hero_kicker, map_eyebrow, map_section_title,
       introduction_eyebrow, introduction_title, works_eyebrow, works_title,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(event_id) DO UPDATE SET
       is_enabled=excluded.is_enabled,
       map_title=excluded.map_title,
       map_description=excluded.map_description,
       image_url=excluded.image_url,
       image_alt=excluded.image_alt,
       image_width=excluded.image_width,
       image_height=excluded.image_height,
       hero_kicker=excluded.hero_kicker,
       map_eyebrow=excluded.map_eyebrow,
       map_section_title=excluded.map_section_title,
       introduction_eyebrow=excluded.introduction_eyebrow,
       introduction_title=excluded.introduction_title,
       works_eyebrow=excluded.works_eyebrow,
       works_title=excluded.works_title,
       updated_at=CURRENT_TIMESTAMP`,
  ).run(
    eventId,
    value.is_enabled ? 1 : 0,
    value.map_title,
    value.map_description,
    value.image_url,
    value.image_alt,
    value.image_width,
    value.image_height,
    value.hero_kicker,
    value.map_eyebrow,
    value.map_section_title,
    value.introduction_eyebrow,
    value.introduction_title,
    value.works_eyebrow,
    value.works_title,
  );
  claimUploadedAssets([value.image_url]);
  cleanupUnreferencedUploads();
  auditAdmin("update", "event_map", eventId, {
    event_slug: event.slug,
    is_enabled: value.is_enabled,
    image_url: value.image_url,
  });

  return Response.json({ ok: true });
}
