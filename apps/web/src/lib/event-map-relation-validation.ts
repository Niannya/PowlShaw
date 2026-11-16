export const EVENT_MAP_RELATION_NAME_MAX_LENGTH = 80;
export const EVENT_MAP_RELATION_DESCRIPTION_MAX_LENGTH = 2000;
export const EVENT_MAP_RELATION_NOTES_MAX_LENGTH = 1000;

export type EditableEventMapRelation = {
  source_node_id: number;
  target_node_id: number;
  name: string;
  description: string;
  notes: string;
};

type ValidationResult =
  { ok: true; value: EditableEventMapRelation } | { ok: false; error: string };

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function normalizeEventMapRelation(value: unknown): ValidationResult {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "没有收到关系信息。" };
  }

  const input = value as Record<string, unknown>;
  const sourceNodeId = positiveInteger(input.source_node_id);
  const targetNodeId = positiveInteger(input.target_node_id);
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const notes = String(input.notes || "").trim();

  if (!sourceNodeId || !targetNodeId) {
    return { ok: false, error: "请选择关系连接的两个节点。" };
  }
  if (sourceNodeId === targetNodeId) {
    return { ok: false, error: "关系不能连接同一个节点。" };
  }
  if (!name) return { ok: false, error: "请填写关系名称。" };
  if (name.length > EVENT_MAP_RELATION_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `关系名称不能超过 ${EVENT_MAP_RELATION_NAME_MAX_LENGTH} 个字符。`,
    };
  }
  if (description.length > EVENT_MAP_RELATION_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: `关系描述不能超过 ${EVENT_MAP_RELATION_DESCRIPTION_MAX_LENGTH} 个字符。`,
    };
  }
  if (notes.length > EVENT_MAP_RELATION_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: `关系备注不能超过 ${EVENT_MAP_RELATION_NOTES_MAX_LENGTH} 个字符。`,
    };
  }

  return {
    ok: true,
    value: {
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      name,
      description,
      notes,
    },
  };
}
