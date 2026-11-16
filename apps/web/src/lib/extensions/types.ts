import type { ZodType } from "zod";

/**
 * 活动扩展模块的前后端共享契约。
 *
 * 一个 `kind` 对应一个模块定义：配置 `config` 由 Zod schema 校验，
 * 可增长集合（晋级名单、时间线节点等）以及受邀用户互动内容存放在 `items` 中。
 * 本文件必须保持“无 React / 无数据库副作用”，可同时被 RSC、浏览器与 Hono 使用。
 */

export type ExtensionVisibility = "public" | "member";

export type PublicExtensionItem<TItem = unknown> = {
  itemKey: string;
  payload: TItem;
};

/** `GET /api/v1/events/:slug` 返回的扩展摘要，只包含公开字段。 */
export type PublicEventExtension<TConfig = unknown, TItem = unknown> = {
  /** 所属活动 id，便于客户端互动组件提交条目。 */
  eventId: number;
  kind: string;
  version: number;
  config: TConfig;
  items?: Array<PublicExtensionItem<TItem>>;
  /**
   * 当前请求者能否提交互动条目（已登录、未禁言、未强制改密且模块开启 allow_user_items）。
   * 未登录时为 false；前端据此决定显示投票表单还是登录链接。
   */
  canSubmit?: boolean;
};

/** 管理端读取的完整扩展记录。 */
export type EventExtensionRecord<TConfig = unknown> = {
  id: number;
  eventId: number;
  kind: string;
  version: number;
  enabled: boolean;
  sortOrder: number;
  visibility: ExtensionVisibility;
  allowUserItems: boolean;
  config: TConfig;
  updatedAt: string;
};

export type EventExtensionItemRecord<TItem = unknown> = {
  id: number;
  itemKey: string;
  userId: number | null;
  payload: TItem;
  createdAt: string;
};

/**
 * 服务端与前端共享的模块定义（不含渲染组件）。
 * 渲染组件在 `registry.tsx` 中按 `kind` 注册，避免服务端打包 React 视图。
 */
export type ExtensionDefinition<TConfig = unknown, TItem = unknown> = {
  kind: string;
  version: number;
  title: string;
  description: string;
  configSchema: ZodType<TConfig>;
  itemSchema?: ZodType<TItem>;
  /** 是否允许受邀登录用户提交互动条目（写入 event_extension_items）。 */
  allowsUserItems?: boolean;
};

export type ExtensionKind = string;

export function isExtensionVisibility(value: unknown): value is ExtensionVisibility {
  return value === "public" || value === "member";
}
