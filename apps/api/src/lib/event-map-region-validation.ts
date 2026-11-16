export const EVENT_MAP_REGION_NAME_MAX_LENGTH = 80;
export const EVENT_MAP_REGION_DESCRIPTION_MAX_LENGTH = 2000;
export const EVENT_MAP_REGION_NOTES_MAX_LENGTH = 1000;
export const EVENT_MAP_REGION_MAX_POINTS = 64;
export const DEFAULT_EVENT_MAP_REGION_COLOR = "#b56d3a";

export type EventMapPoint = {
  x: number;
  y: number;
};

export type EditableEventMapRegion = {
  name: string;
  description: string;
  notes: string;
  color: string;
  points: EventMapPoint[];
};

type ValidationResult = { ok: true; value: EditableEventMapRegion } | { ok: false; error: string };

function coordinate(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) return undefined;
  return Math.round(number * 1_000_000) / 1_000_000;
}

function normalizePoints(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const points: EventMapPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const point = item as Record<string, unknown>;
    const x = coordinate(point.x);
    const y = coordinate(point.y);
    if (x === undefined || y === undefined) return undefined;

    const previous = points.at(-1);
    if (!previous || previous.x !== x || previous.y !== y) points.push({ x, y });
  }

  const first = points[0];
  const last = points.at(-1);
  if (points.length > 3 && first && last && first.x === last.x && first.y === last.y) {
    points.pop();
  }
  return points;
}

function polygonArea(points: EventMapPoint[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function normalizeEventMapRegion(value: unknown): ValidationResult {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "没有收到区域信息。" };
  }

  const input = value as Record<string, unknown>;
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const notes = String(input.notes || "").trim();
  const color = String(input.color || "")
    .trim()
    .toLowerCase();
  const points = normalizePoints(input.points);

  if (!name) return { ok: false, error: "请填写区域名称。" };
  if (name.length > EVENT_MAP_REGION_NAME_MAX_LENGTH) {
    return { ok: false, error: `区域名称不能超过 ${EVENT_MAP_REGION_NAME_MAX_LENGTH} 个字符。` };
  }
  if (description.length > EVENT_MAP_REGION_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: `区域描述不能超过 ${EVENT_MAP_REGION_DESCRIPTION_MAX_LENGTH} 个字符。`,
    };
  }
  if (notes.length > EVENT_MAP_REGION_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: `区域备注不能超过 ${EVENT_MAP_REGION_NOTES_MAX_LENGTH} 个字符。`,
    };
  }
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    return { ok: false, error: "区域颜色不正确。" };
  }
  if (!points || points.length < 3) {
    return { ok: false, error: "区域至少需要三个不同的顶点。" };
  }
  if (points.length > EVENT_MAP_REGION_MAX_POINTS) {
    return { ok: false, error: `区域不能超过 ${EVENT_MAP_REGION_MAX_POINTS} 个顶点。` };
  }
  if (polygonArea(points) < 0.000001) {
    return { ok: false, error: "区域范围过小或顶点位于同一直线上。" };
  }

  return { ok: true, value: { name, description, notes, color, points } };
}
