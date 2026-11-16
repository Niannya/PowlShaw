import { Hono } from "hono";
import type { AppEnv } from "../middleware/session";
import { apiData, apiError, apiNotFound } from "../lib/api-response";
import { canSubmitExtensions, eventPayload } from "../lib/api-read";
import { getEventById } from "../lib/queries";
import { findExtensionRow, upsertUserExtensionItem } from "../lib/extensions/store";
import { userCanPublishContent } from "../lib/session-tokens";
import { getExtensionDefinition } from "../../lib/extensions/definitions";

/**
 * 活动路由（挂在 `/api/v1/events`）。
 *
 * - `GET /:slug`：固定骨架数据 + 扩展模块（按登录状态合并 `public` / `member`）；
 * - `POST /:id/extensions/:kind/items`：受邀用户提交互动条目，
 *   `itemKey` 由服务端固定为 `u<userId>`，不接受客户端指定。
 */
export const eventRoutes = new Hono<AppEnv>();

eventRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const user = c.get("user");
  const payload = await eventPayload(slug, {
    isMember: Boolean(user),
    canSubmitEnabled: canSubmitExtensions(user),
  });
  if (!payload) return apiNotFound("活动不存在。");
  return apiData(payload);
});

eventRoutes.post("/:id/extensions/:kind/items", async (c) => {
  const user = c.get("user");
  if (!user) return apiError("UNAUTHORIZED", "请先登录账号。", 401);
  if (!userCanPublishContent(user)) {
    if (user.must_change_password) {
      return apiError("PASSWORD_CHANGE_REQUIRED", "请先到账号中心修改初始密码。", 403);
    }
    return apiError(
      "MUTED",
      `账号已被禁言至 ${user.muted_until}${user.mute_reason ? `：${user.mute_reason}` : ""}`,
      403,
    );
  }

  const eventId = Number(c.req.param("id"));
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    return apiError("NOT_FOUND", "活动不存在。", 404);
  }
  const kind = c.req.param("kind");
  const definition = getExtensionDefinition(kind);
  if (!definition) {
    return apiError("UNKNOWN_EXTENSION", `未注册的模块: ${kind}`, 400);
  }

  const extension = await findExtensionRow(eventId, kind);
  if (!extension) {
    const event = await getEventById(eventId);
    if (!event) return apiError("NOT_FOUND", "活动不存在。", 404);
    return apiError("EXTENSION_UNAVAILABLE", "该模块当前不开放提交。", 404);
  }
  if (extension.enabled !== 1) {
    return apiError("EXTENSION_UNAVAILABLE", "该模块当前不开放提交。", 404);
  }
  if (extension.version !== definition.version) {
    return apiError(
      "VERSION_MISMATCH",
      `模块版本不兼容（期望 ${definition.version}，当前 ${extension.version}）。`,
      409,
    );
  }
  if (extension.allowUserItems !== 1 || !definition.itemSchema) {
    return apiError("EXTENSION_READONLY", "该模块不接受用户提交。", 403);
  }

  const body = (await c.req.json().catch(() => null)) as { payload?: unknown } | null;
  if (!body || typeof body !== "object") {
    return apiError("INVALID_PAYLOAD", "请求格式不正确。", 400);
  }
  const parsed = definition.itemSchema.safeParse(body.payload);
  if (!parsed.success) {
    return apiError("INVALID_PAYLOAD", "提交内容校验失败。", 422, parsed.error.issues);
  }

  const itemKey = await upsertUserExtensionItem({
    extensionId: extension.id,
    userId: user.id,
    payloadJson: JSON.stringify(parsed.data),
  });

  return apiData({ itemKey, payload: parsed.data }, { status: 201 });
});
