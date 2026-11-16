import type {
  ExtensionVisibility,
  PublicEventExtension,
  PublicExtensionItem,
} from "../../../lib/extensions/types";

/**
 * 公开扩展的纯函数装配层：不碰数据库，便于单元测试。
 * 数据库行 → `PublicEventExtension[]` 的转换全部集中在这里。
 */

/** 未登录只看 `public`；携带有效受邀用户会话时并入 `member`。 */
export function visibleExtensionScopes(isMember: boolean): ExtensionVisibility[] {
  return isMember ? ["public", "member"] : ["public"];
}

export type PublicExtensionRow = {
  id: number;
  eventId: number;
  kind: string;
  version: number;
  visibility: string;
  allowUserItems: number;
  sortOrder: number;
  configJson: string;
};

export type PublicExtensionItemRow = {
  extensionId: number;
  itemKey: string;
  payloadJson: string;
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * 组装公开扩展列表：
 * - 按 `sortOrder`（对应 `sort_order`）升序、再按 `id` 升序；
 * - 未登录时过滤掉 `member`（数据库查询已过滤，这里再兜一层，防止调用方误用）；
 * - `config_json` 解析失败的模块整项跳过（绝不因为一条坏数据白屏）；
 * - `payload_json` 解析失败的条目单独跳过；
 * - `canSubmit` 仅表示“前端可以展示互动表单”：已登录 + 未禁言 + 扩展允许用户条目。
 */
export function buildPublicExtensions(
  rows: PublicExtensionRow[],
  items: PublicExtensionItemRow[],
  isMember: boolean,
  canSubmitEnabled: boolean,
): PublicEventExtension[] {
  const scopes = new Set<string>(visibleExtensionScopes(isMember));
  const itemsByExtension = new Map<number, PublicExtensionItem[]>();
  for (const item of items) {
    const payload = parseJson(item.payloadJson);
    if (payload === undefined) continue;
    const list = itemsByExtension.get(item.extensionId) ?? [];
    list.push({ itemKey: item.itemKey, payload });
    itemsByExtension.set(item.extensionId, list);
  }

  return rows
    .filter((row) => scopes.has(row.visibility))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
    .flatMap((row) => {
      const config = parseJson(row.configJson);
      if (config === undefined) return [];
      const extension: PublicEventExtension = {
        eventId: row.eventId,
        kind: row.kind,
        version: row.version,
        config,
        items: itemsByExtension.get(row.id) ?? [],
        canSubmit: canSubmitEnabled && row.allowUserItems === 1,
      };
      return [extension];
    });
}
