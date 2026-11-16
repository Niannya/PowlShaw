import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDrizzle } from "../../db/client";
import { eventExtensionItems, eventExtensions } from "../../db/schema";
import { transaction } from "../../db/sql";
import { recordContentRevision } from "../audit";
import type { ExtensionVisibility, PublicEventExtension } from "../../../lib/extensions/types";
import {
  buildPublicExtensions,
  visibleExtensionScopes,
  type PublicExtensionItemRow,
  type PublicExtensionRow,
} from "./visibility";

/**
 * 活动扩展的读写。
 *
 * 新表（`event_extensions` / `event_extension_items`）按要求使用 Drizzle 查询；
 * 所有写操作都包在 `transaction()` 里，覆盖 / 软删前先写 `content_revisions` 快照
 * （`target_type = 'event_extension'`，`target_id` 为扩展主键）。
 */

export type ExtensionRow = typeof eventExtensions.$inferSelect;
export type ExtensionItemRow = typeof eventExtensionItems.$inferSelect;

export type AdminExtensionItem = { itemKey: string; payload: unknown };

export type AdminExtensionRecord = {
  id: number;
  eventId: number;
  kind: string;
  version: number;
  enabled: boolean;
  sortOrder: number;
  visibility: ExtensionVisibility;
  allowUserItems: boolean;
  config: unknown;
  items: AdminExtensionItem[];
  updatedAt: string;
};

export type ExtensionItemInput = { itemKey: string; payloadJson: string };

export type SaveExtensionInput = {
  eventId: number;
  kind: string;
  version: number;
  visibility?: ExtensionVisibility;
  sortOrder?: number;
  enabled?: boolean;
  allowUserItems?: boolean;
  configJson: string;
  /** 缺省表示“不改动现有条目”；提供时整组替换（保留同一 itemKey 的 userId）。 */
  items?: ExtensionItemInput[];
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toPublicRow(row: ExtensionRow): PublicExtensionRow {
  return {
    id: row.id,
    eventId: row.eventId,
    kind: row.kind,
    version: row.version,
    visibility: row.visibility,
    allowUserItems: row.allowUserItems,
    sortOrder: row.sortOrder,
    configJson: row.configJson,
  };
}

async function loadPublicItemRows(extensionIds: number[]): Promise<PublicExtensionItemRow[]> {
  if (!extensionIds.length) return [];
  return getDrizzle()
    .select({
      extensionId: eventExtensionItems.extensionId,
      itemKey: eventExtensionItems.itemKey,
      payloadJson: eventExtensionItems.payloadJson,
    })
    .from(eventExtensionItems)
    .where(inArray(eventExtensionItems.extensionId, extensionIds))
    .orderBy(asc(eventExtensionItems.id));
}

/** 管理端 / 快照使用的原始条目（含 userId），按创建顺序。 */
export async function loadExtensionItemRows(extensionId: number): Promise<ExtensionItemRow[]> {
  return getDrizzle()
    .select()
    .from(eventExtensionItems)
    .where(eq(eventExtensionItems.extensionId, extensionId))
    .orderBy(asc(eventExtensionItems.id));
}

function toAdminItems(rows: ExtensionItemRow[]): AdminExtensionItem[] {
  return rows.flatMap((row) => {
    const payload = parseJson(row.payloadJson);
    return payload === undefined ? [] : [{ itemKey: row.itemKey, payload }];
  });
}

function toAdminRecord(row: ExtensionRow, items: AdminExtensionItem[]): AdminExtensionRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    kind: row.kind,
    version: row.version,
    enabled: row.enabled === 1,
    sortOrder: row.sortOrder,
    visibility: row.visibility === "member" ? "member" : "public",
    allowUserItems: row.allowUserItems === 1,
    config: parseJson(row.configJson) ?? {},
    items,
    updatedAt: row.updatedAt,
  };
}

export async function findExtensionRow(eventId: number, kind: string) {
  const rows = await getDrizzle()
    .select()
    .from(eventExtensions)
    .where(and(eq(eventExtensions.eventId, eventId), eq(eventExtensions.kind, kind)))
    .limit(1);
  return rows[0];
}

export async function loadExtensionById(id: number) {
  const rows = await getDrizzle()
    .select()
    .from(eventExtensions)
    .where(eq(eventExtensions.id, id))
    .limit(1);
  return rows[0];
}

/**
 * 公开读取：未登录只含 `public`，携带有效受邀用户会话时并入 `member`。
 * `canSubmit` 仅用于前端决定展示互动表单还是登录链接，安全校验仍由写入端点负责。
 */
export async function listPublicExtensions(
  eventId: number,
  isMember: boolean,
  canSubmitEnabled: boolean,
): Promise<PublicEventExtension[]> {
  const scopes = visibleExtensionScopes(isMember);
  const rows = await getDrizzle()
    .select()
    .from(eventExtensions)
    .where(
      and(
        eq(eventExtensions.eventId, eventId),
        eq(eventExtensions.enabled, 1),
        inArray(eventExtensions.visibility, scopes),
      ),
    )
    .orderBy(asc(eventExtensions.sortOrder), asc(eventExtensions.id));

  const items = await loadPublicItemRows(rows.map((row) => row.id));
  return buildPublicExtensions(rows.map(toPublicRow), items, isMember, canSubmitEnabled);
}

/** 管理端读取：包含已停用（`enabled = 0`）的模块与其全部条目。 */
export async function listAdminExtensions(eventId: number): Promise<AdminExtensionRecord[]> {
  const rows = await getDrizzle()
    .select()
    .from(eventExtensions)
    .where(eq(eventExtensions.eventId, eventId))
    .orderBy(asc(eventExtensions.sortOrder), asc(eventExtensions.id));

  const records: AdminExtensionRecord[] = [];
  for (const row of rows) {
    records.push(toAdminRecord(row, toAdminItems(await loadExtensionItemRows(row.id))));
  }
  return records;
}

export async function findAdminExtension(eventId: number, kind: string) {
  const row = await findExtensionRow(eventId, kind);
  if (!row) return undefined;
  return toAdminRecord(row, toAdminItems(await loadExtensionItemRows(row.id)));
}

async function replaceItems(extensionId: number, items: ExtensionItemInput[]) {
  const db = getDrizzle();
  const keys = items.map((item) => item.itemKey);
  if (keys.length) {
    await db
      .delete(eventExtensionItems)
      .where(
        and(
          eq(eventExtensionItems.extensionId, extensionId),
          notInArray(eventExtensionItems.itemKey, keys),
        ),
      );
  } else {
    await db.delete(eventExtensionItems).where(eq(eventExtensionItems.extensionId, extensionId));
  }

  for (const item of items) {
    await db
      .insert(eventExtensionItems)
      .values({
        extensionId,
        itemKey: item.itemKey,
        payloadJson: item.payloadJson,
      })
      .onConflictDoUpdate({
        target: [eventExtensionItems.extensionId, eventExtensionItems.itemKey],
        set: { payloadJson: item.payloadJson, updatedAt: sql`CURRENT_TIMESTAMP` },
      });
  }
}

async function snapshotExtension(row: ExtensionRow, action: "update" | "delete") {
  await recordContentRevision("event_extension", row.id, action, {
    extension: row,
    items: await loadExtensionItemRows(row.id),
  });
}

/** 新建或更新扩展；已存在时先写历史快照。 */
export async function saveExtension(input: SaveExtensionInput): Promise<AdminExtensionRecord> {
  return transaction(async () => {
    const db = getDrizzle();
    const existing = await findExtensionRow(input.eventId, input.kind);

    if (existing) {
      await snapshotExtension(existing, "update");
      await db
        .update(eventExtensions)
        .set({
          version: input.version,
          enabled: input.enabled === false ? 0 : 1,
          ...(input.visibility ? { visibility: input.visibility } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.allowUserItems !== undefined
            ? { allowUserItems: input.allowUserItems ? 1 : 0 }
            : {}),
          configJson: input.configJson,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(eventExtensions.id, existing.id));
    } else {
      await db.insert(eventExtensions).values({
        eventId: input.eventId,
        kind: input.kind,
        version: input.version,
        enabled: input.enabled === false ? 0 : 1,
        sortOrder: input.sortOrder ?? 0,
        visibility: input.visibility ?? "public",
        allowUserItems: input.allowUserItems ? 1 : 0,
        configJson: input.configJson,
      });
    }

    const row = await findExtensionRow(input.eventId, input.kind);
    if (!row) throw new Error("活动扩展保存失败。");
    if (input.items) await replaceItems(row.id, input.items);
    return toAdminRecord(row, toAdminItems(await loadExtensionItemRows(row.id)));
  });
}

export type PatchExtensionInput = {
  enabled?: boolean;
  sortOrder?: number;
  visibility?: ExtensionVisibility;
};

/** 只切换启停 / 排序 / 可见性；同样先写快照。 */
export async function patchExtension(
  eventId: number,
  kind: string,
  patch: PatchExtensionInput,
): Promise<AdminExtensionRecord | undefined> {
  return transaction(async () => {
    const existing = await findExtensionRow(eventId, kind);
    if (!existing) return undefined;
    await snapshotExtension(existing, "update");
    await getDrizzle()
      .update(eventExtensions)
      .set({
        ...(patch.enabled !== undefined ? { enabled: patch.enabled ? 1 : 0 } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.visibility ? { visibility: patch.visibility } : {}),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(eventExtensions.id, existing.id));
    const row = await findExtensionRow(eventId, kind);
    if (!row) return undefined;
    return toAdminRecord(row, toAdminItems(await loadExtensionItemRows(row.id)));
  });
}

/** 软删：`enabled = 0` + 历史快照；条目全部保留，公开页立即隐藏。 */
export async function softDeleteExtension(eventId: number, kind: string) {
  return transaction(async () => {
    const existing = await findExtensionRow(eventId, kind);
    if (!existing) return undefined;
    await snapshotExtension(existing, "delete");
    await getDrizzle()
      .update(eventExtensions)
      .set({ enabled: 0, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(eventExtensions.id, existing.id));
    return { kind, enabled: false };
  });
}

/** 受邀用户互动条目：`itemKey` 由服务端固定为 `u<userId>`，同一用户重复提交即更新。 */
export async function upsertUserExtensionItem(input: {
  extensionId: number;
  userId: number;
  payloadJson: string;
}) {
  const itemKey = `u${input.userId}`;
  await getDrizzle()
    .insert(eventExtensionItems)
    .values({
      extensionId: input.extensionId,
      userId: input.userId,
      itemKey,
      payloadJson: input.payloadJson,
    })
    .onConflictDoUpdate({
      target: [eventExtensionItems.extensionId, eventExtensionItems.itemKey],
      set: {
        payloadJson: input.payloadJson,
        userId: input.userId,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });
  return itemKey;
}
