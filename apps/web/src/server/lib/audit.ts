import { run } from "../db/sql";

/**
 * 后台审计与内容快照。
 *
 * 两个函数都通过 `db/sql.ts` 的异步门面执行，因此可以安全地在 `transaction()` 回调里调用：
 * 事务内的 `run` 会自动落到同一个写事务连接上（见 `db/sql.ts` 的 AsyncLocalStorage）。
 */

export async function auditAdmin(
  action: string,
  targetType: string,
  targetId?: number,
  details: Record<string, unknown> | string = "",
) {
  const text = typeof details === "string" ? details : JSON.stringify(details);
  await run(
    `INSERT INTO admin_audit_log(action, target_type, target_id, details)
     VALUES (?, ?, ?, ?)`,
    [action, targetType, targetId || null, text.slice(0, 4000)],
  );
}

export type RevisionTargetType = "article" | "event" | "category" | "event_extension";

export type RevisionAction = "create" | "update" | "delete" | "update-articles";

/**
 * 覆盖 / 软删前写入完整快照。快照里永远不包含密码字段
 * （调用方传 `SELECT * FROM users` 一类的行时，请自行剔除 `password_hash`）。
 */
export async function recordContentRevision(
  targetType: RevisionTargetType,
  targetId: number,
  action: RevisionAction,
  snapshot: unknown,
) {
  await run(
    `INSERT INTO content_revisions(target_type, target_id, action, snapshot_json)
     VALUES (?, ?, ?, ?)`,
    [targetType, targetId, action, JSON.stringify(snapshot)],
  );
}
