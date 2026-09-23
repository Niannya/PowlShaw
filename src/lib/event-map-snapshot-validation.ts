export const EVENT_MAP_SNAPSHOT_TITLE_MAX_LENGTH = 80;
export const EVENT_MAP_SNAPSHOT_DESCRIPTION_MAX_LENGTH = 500;

export type EditableEventMapSnapshot = {
  snapshot_date: string;
  title: string;
  description: string;
};

type ValidationResult =
  { ok: true; value: EditableEventMapSnapshot } | { ok: false; error: string };

function calendarDate(value: unknown) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (year < 1900 || year > 2200 || day < 1 || day > lastDay) return undefined;
  return text;
}

export function normalizeEventMapSnapshot(value: unknown): ValidationResult {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "没有收到快照信息。" };
  }

  const input = value as Record<string, unknown>;
  const snapshotDate = calendarDate(input.snapshot_date);
  if (!snapshotDate) return { ok: false, error: "快照日期不正确。" };

  const title = String(input.title || "").trim() || `${snapshotDate} 世界状态`;
  const description = String(input.description || "").trim();
  if (title.length > EVENT_MAP_SNAPSHOT_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      error: `快照名称不能超过 ${EVENT_MAP_SNAPSHOT_TITLE_MAX_LENGTH} 个字符。`,
    };
  }
  if (description.length > EVENT_MAP_SNAPSHOT_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: `快照说明不能超过 ${EVENT_MAP_SNAPSHOT_DESCRIPTION_MAX_LENGTH} 个字符。`,
    };
  }

  return {
    ok: true,
    value: { snapshot_date: snapshotDate, title, description },
  };
}
