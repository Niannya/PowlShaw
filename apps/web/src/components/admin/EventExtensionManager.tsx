"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/client-fetch";
import type { AdminEventExtension } from "@/lib/api/types";
import { extensionKindOptions, getExtensionDefinition } from "@/lib/extensions/definitions";
import type { ExtensionVisibility } from "@/lib/extensions/types";

/**
 * 后台活动扩展管理：列表、新增、启停、排序、可见性、配置与条目编辑。
 * 保存走 `PUT /api/v1/admin/events/:id/extensions/:kind`，启停用 `PATCH`，删除为软删。
 */

type ExtensionRow = {
  kind: string;
  version: number;
  enabled: boolean;
  sortOrder: number;
  visibility: ExtensionVisibility;
  allowUserItems: boolean;
  configText: string;
  itemsText: string;
  persisted: boolean;
};

function toText(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function fromAdmin(extension: AdminEventExtension): ExtensionRow {
  return {
    kind: extension.kind,
    version: extension.version,
    enabled: extension.enabled,
    sortOrder: extension.sortOrder,
    visibility: extension.visibility,
    allowUserItems: Boolean(extension.allowUserItems),
    configText: toText(extension.config),
    itemsText: toText(
      (extension.items ?? []).map((item) => ({ itemKey: item.itemKey, payload: item.payload })),
    ),
    persisted: true,
  };
}

function defaultConfigText(kind: string) {
  const definition = getExtensionDefinition(kind);
  if (!definition) return "{}";
  const parsed = definition.configSchema.safeParse({});
  if (parsed.success) return toText(parsed.data);
  // 投票必须至少有一个选项，给一份可直接改的模板，避免一保存就 422。
  if (kind === "ballot") {
    return toText({
      title: "读者投票",
      options: [
        { key: "option-1", label: "选项一" },
        { key: "option-2", label: "选项二" },
      ],
    });
  }
  return "{}";
}

function zodMessage(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "配置"}：${issue.message}`)
    .join("；");
}

/** 解析条目文本：每项必须是 `{ itemKey, payload }`，itemKey 唯一且可原样回传。 */
function parseItems(kind: string, text: string) {
  const definition = getExtensionDefinition(kind);
  if (!definition?.itemSchema)
    return { items: [] as { itemKey: string; payload: unknown }[], error: "" };
  let parsed: unknown;
  try {
    parsed = text.trim() ? JSON.parse(text) : [];
  } catch {
    return { items: [], error: "条目不是合法 JSON。" };
  }
  if (!Array.isArray(parsed)) return { items: [], error: "条目必须是 JSON 数组。" };

  const keys = new Set<string>();
  const items: { itemKey: string; payload: unknown }[] = [];
  for (const [index, entry] of parsed.entries()) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const itemKey = typeof record.itemKey === "string" ? record.itemKey.trim() : "";
    if (!itemKey) {
      return { items: [], error: `第 ${index + 1} 条缺少 itemKey（例如 "r1"）。` };
    }
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(itemKey)) {
      return {
        items: [],
        error: `第 ${index + 1} 条的 itemKey 只能包含字母、数字、下划线与连字符。`,
      };
    }
    if (keys.has(itemKey)) return { items: [], error: `itemKey “${itemKey}” 重复。` };
    keys.add(itemKey);
    const checked = definition.itemSchema.safeParse(record.payload);
    if (!checked.success) {
      return { items: [], error: `第 ${index + 1} 条：${zodMessage(checked.error)}` };
    }
    items.push({ itemKey, payload: checked.data });
  }
  return { items, error: "" };
}

export function EventExtensionManager({
  eventId,
  initialExtensions,
}: {
  eventId: number;
  initialExtensions: AdminEventExtension[];
}) {
  const [rows, setRows] = useState<ExtensionRow[]>((initialExtensions ?? []).map(fromAdmin));
  const [newKind, setNewKind] = useState(
    extensionKindOptions.find(
      (option) => !(initialExtensions ?? []).some((ext) => ext.kind === option.kind),
    )?.kind ||
      extensionKindOptions[0]?.kind ||
      "",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function update(kind: string, patch: Partial<ExtensionRow>) {
    setRows((current) => current.map((row) => (row.kind === kind ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setError("");
    setMessage("");
    if (!newKind) return;
    if (rows.some((row) => row.kind === newKind)) {
      setError("这个模块已经在活动中启用，请直接编辑。");
      return;
    }
    const definition = getExtensionDefinition(newKind);
    if (!definition) {
      setError("未知的扩展模块。");
      return;
    }
    const maxSort = rows.reduce((max, row) => Math.max(max, row.sortOrder), 0);
    setRows((current) => [
      ...current,
      {
        kind: definition.kind,
        version: definition.version,
        enabled: true,
        sortOrder: maxSort + 10,
        visibility: "public",
        allowUserItems: Boolean(definition.allowsUserItems),
        configText: defaultConfigText(definition.kind),
        itemsText: "[]",
        persisted: false,
      },
    ]);
    setMessage(`已添加“${definition.title}”，编辑配置后点保存。`);
  }

  async function save(row: ExtensionRow) {
    const definition = getExtensionDefinition(row.kind);
    if (!definition) {
      setError("未知的扩展模块。");
      return;
    }
    setBusy(`save-${row.kind}`);
    setError("");
    setMessage("");

    let config: unknown;
    try {
      config = row.configText.trim() ? JSON.parse(row.configText) : {};
    } catch {
      setBusy(null);
      setError("配置不是合法 JSON。");
      return;
    }
    const checkedConfig = definition.configSchema.safeParse(config);
    if (!checkedConfig.success) {
      setBusy(null);
      setError(zodMessage(checkedConfig.error));
      return;
    }
    const parsedItems = parseItems(row.kind, row.itemsText);
    if (parsedItems.error) {
      setBusy(null);
      setError(parsedItems.error);
      return;
    }

    const { response, data } = await fetchJson<{
      data?: AdminEventExtension;
      error?: string | { message?: string };
    }>(`/api/v1/admin/events/${eventId}/extensions/${row.kind}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: definition.version,
        visibility: row.visibility,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
        config: checkedConfig.data,
        items: parsedItems.items,
      }),
    });
    setBusy(null);
    if (!response?.ok || !data.data) {
      setError(
        typeof data.error === "string"
          ? data.error
          : data.error?.message || "扩展模块保存失败，请检查网络连接后重试。",
      );
      return;
    }
    const saved = fromAdmin(data.data);
    setRows((current) => current.map((item) => (item.kind === row.kind ? saved : item)));
    setMessage(`“${definition.title}”已保存。`);
  }

  async function toggle(row: ExtensionRow) {
    const definition = getExtensionDefinition(row.kind);
    setBusy(`toggle-${row.kind}`);
    setError("");
    setMessage("");
    const { response, data } = await fetchJson<{
      data?: AdminEventExtension;
      error?: string | { message?: string };
    }>(`/api/v1/admin/events/${eventId}/extensions/${row.kind}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    setBusy(null);
    if (!response?.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : data.error?.message || "启停状态保存失败，请稍后重试。",
      );
      return;
    }
    update(row.kind, { enabled: !row.enabled });
    setMessage(`“${definition?.title || row.kind}”已${row.enabled ? "停用" : "启用"}。`);
  }

  async function remove(row: ExtensionRow) {
    const definition = getExtensionDefinition(row.kind);
    if (
      !window.confirm(`确定下线“${definition?.title || row.kind}”？条目会保留，之后可以重新启用。`)
    ) {
      return;
    }
    setBusy(`delete-${row.kind}`);
    setError("");
    setMessage("");
    const { response, data } = await fetchJson<{
      error?: string | { message?: string };
    }>(`/api/v1/admin/events/${eventId}/extensions/${row.kind}`, { method: "DELETE" });
    setBusy(null);
    if (!response?.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : data.error?.message || "模块下线失败，请稍后重试。",
      );
      return;
    }
    update(row.kind, { enabled: false });
    setMessage(`“${definition?.title || row.kind}”已下线（条目保留）。`);
  }

  return (
    <section className="admin-card event-extension-manager">
      <header className="event-extension-manager-heading">
        <h2>活动模块（扩展插槽）</h2>
        <p>按排序值升序显示在活动页；未注册或配置不兼容的模块会自动隐藏。</p>
      </header>

      <div className="event-extension-create">
        <label>
          新增模块
          <select value={newKind} onChange={(event) => setNewKind(event.target.value)}>
            {extensionKindOptions.map((option) => (
              <option value={option.kind} key={option.kind}>
                {option.title}（{option.kind} · v{option.version}）
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="admin-button" onClick={addRow}>
          添加模块
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      {rows.length ? (
        <div className="event-extension-list">
          {rows.map((row) => {
            const definition = getExtensionDefinition(row.kind);
            return (
              <article className="event-extension-row" data-kind={row.kind} key={row.kind}>
                <h3>
                  {definition?.title || row.kind}
                  <small>
                    {row.kind} · v{row.version}
                    {row.persisted ? "" : " · 未保存"}
                    {row.allowUserItems ? " · 允许登录用户提交" : ""}
                  </small>
                </h3>
                {definition?.description ? <p>{definition.description}</p> : null}

                <div className="event-extension-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(event) => update(row.kind, { enabled: event.target.checked })}
                    />
                    启用
                  </label>
                  <label>
                    排序
                    <input
                      type="number"
                      value={row.sortOrder}
                      min={0}
                      step={10}
                      onChange={(event) =>
                        update(row.kind, { sortOrder: Number(event.target.value) || 0 })
                      }
                    />
                  </label>
                  <label>
                    可见性
                    <select
                      value={row.visibility}
                      onChange={(event) =>
                        update(row.kind, {
                          visibility: event.target.value as ExtensionVisibility,
                        })
                      }
                    >
                      <option value="public">公开</option>
                      <option value="member">仅登录成员</option>
                    </select>
                  </label>
                </div>

                <label>
                  配置（JSON，字段由模块定义校验）
                  <textarea
                    className="extension-json"
                    value={row.configText}
                    spellCheck={false}
                    rows={Math.min(12, Math.max(3, row.configText.split("\n").length))}
                    onChange={(event) => update(row.kind, { configText: event.target.value })}
                  />
                </label>
                <label>
                  条目（JSON 数组，每项 {"{ itemKey, payload }"}，itemKey 唯一且保存后不变）
                  <textarea
                    className="extension-json"
                    value={row.itemsText}
                    spellCheck={false}
                    rows={Math.min(16, Math.max(4, row.itemsText.split("\n").length))}
                    onChange={(event) => update(row.kind, { itemsText: event.target.value })}
                  />
                </label>

                <div className="admin-actions">
                  <button
                    type="button"
                    className="admin-button"
                    disabled={Boolean(busy)}
                    onClick={() => save(row)}
                  >
                    {busy === `save-${row.kind}` ? "保存中……" : "保存模块"}
                  </button>
                  <button
                    type="button"
                    className="admin-button"
                    disabled={Boolean(busy)}
                    onClick={() => toggle(row)}
                  >
                    {busy === `toggle-${row.kind}` ? "处理中……" : row.enabled ? "停用" : "启用"}
                  </button>
                  <button
                    type="button"
                    className="admin-button danger-button"
                    disabled={Boolean(busy)}
                    onClick={() => remove(row)}
                  >
                    {busy === `delete-${row.kind}` ? "下线中……" : "下线"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-note">这个活动还没有配置扩展模块。</p>
      )}
    </section>
  );
}
