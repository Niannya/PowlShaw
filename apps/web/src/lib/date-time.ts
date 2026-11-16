const SITE_TIME_ZONE = "Asia/Shanghai";

/** SQLite CURRENT_TIMESTAMP values are UTC and must be converted before display. */
export function formatUtcDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SITE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Convert a China-local calendar day boundary to SQLite's UTC timestamp format. */
export function localDayBoundaryUtc(date: string, endOfDay = false) {
  const timestamp = Date.parse(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}+08:00`);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().slice(0, 19).replace("T", " ");
}

/** Normalize a datetime-local control value for storage as China-local wall time. */
export function normalizeLocalDateTime(value: unknown) {
  if (value === null || value === undefined || value === "")
    return { ok: true as const, value: null };
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return { ok: false as const, error: "禁言截止时间格式不正确。" };
  const [, year, month, day, hour, minute] = match;
  const timestamp = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:00+08:00`);
  if (!Number.isFinite(timestamp)) {
    return { ok: false as const, error: "禁言截止时间不是有效日期。" };
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SITE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  if (
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour !== hour ||
    parts.minute !== minute
  ) {
    return { ok: false as const, error: "禁言截止时间不是有效日期。" };
  }
  return { ok: true as const, value: `${year}-${month}-${day} ${hour}:${minute}:00` };
}
