import { getDb } from "@/lib/db";

export function auditAdmin(
  action: string,
  targetType: string,
  targetId?: number,
  details: Record<string, unknown> | string = "",
) {
  const text = typeof details === "string" ? details : JSON.stringify(details);
  getDb()
    .prepare(
      `INSERT INTO admin_audit_log(action, target_type, target_id, details)
       VALUES (?, ?, ?, ?)`,
    )
    .run(action, targetType, targetId || null, text.slice(0, 4000));
}

export function recordContentRevision(
  targetType: "article" | "event",
  targetId: number,
  action: "create" | "update" | "delete" | "update-articles",
  snapshot: unknown,
) {
  getDb()
    .prepare(
      `INSERT INTO content_revisions(target_type, target_id, action, snapshot_json)
       VALUES (?, ?, ?, ?)`,
    )
    .run(targetType, targetId, action, JSON.stringify(snapshot));
}
