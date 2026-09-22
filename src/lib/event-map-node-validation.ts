export const EVENT_MAP_NODE_NAME_MAX_LENGTH = 80;
export const EVENT_MAP_NODE_DESCRIPTION_MAX_LENGTH = 2000;
export const EVENT_MAP_NODE_NOTES_MAX_LENGTH = 1000;

export type EditableEventMapNode = {
  name: string;
  description: string;
  notes: string;
  x: number;
  y: number;
};

type ValidationResult = { ok: true; value: EditableEventMapNode } | { ok: false; error: string };

function coordinate(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) return undefined;
  return Math.round(number * 1_000_000) / 1_000_000;
}

export function normalizeEventMapNode(value: unknown): ValidationResult {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "没有收到节点信息。" };
  }

  const input = value as Record<string, unknown>;
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const notes = String(input.notes || "").trim();
  const x = coordinate(input.x);
  const y = coordinate(input.y);

  if (!name) return { ok: false, error: "请填写节点名称。" };
  if (name.length > EVENT_MAP_NODE_NAME_MAX_LENGTH) {
    return { ok: false, error: `节点名称不能超过 ${EVENT_MAP_NODE_NAME_MAX_LENGTH} 个字符。` };
  }
  if (description.length > EVENT_MAP_NODE_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: `节点描述不能超过 ${EVENT_MAP_NODE_DESCRIPTION_MAX_LENGTH} 个字符。`,
    };
  }
  if (notes.length > EVENT_MAP_NODE_NOTES_MAX_LENGTH) {
    return { ok: false, error: `节点备注不能超过 ${EVENT_MAP_NODE_NOTES_MAX_LENGTH} 个字符。` };
  }
  if (x === undefined || y === undefined) {
    return { ok: false, error: "节点位置不正确。" };
  }

  return { ok: true, value: { name, description, notes, x, y } };
}
