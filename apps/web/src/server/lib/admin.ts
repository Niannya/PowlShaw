import { all, get } from "../db/sql";
import { VISUAL_THEMES, type VisualTheme } from "../db/schema";
import { slugify } from "@/lib/content";

export { jsonError } from "./api-response";

/** 文章 / 活动 URL 别名去重：同时避开另一个同名记录和保留中的旧地址跳转。 */
export async function uniqueSlug(table: "articles" | "events", input: string, id?: number) {
  const base = slugify(input, `${table.slice(0, -1)}-${Date.now()}`);
  let value = base;
  let index = 2;
  for (;;) {
    const row = id
      ? await get<{ id: number }>(`SELECT id FROM ${table} WHERE slug=? AND id<>?`, [value, id])
      : await get<{ id: number }>(`SELECT id FROM ${table} WHERE slug=?`, [value]);
    const kind = table.slice(0, -1);
    const reserved = await get<{ one: number }>(
      "SELECT 1 AS one FROM slug_redirects WHERE kind=? AND old_slug=?",
      [kind, value],
    );
    if (!row && !reserved) return value;
    value = `${base}-${index++}`;
  }
}

/** 单活动投稿的默认别名：`<event-slug>-01`、`-02`…… */
export async function nextArticleSlug(eventIds: number[], fallbackTitle: string) {
  if (eventIds.length !== 1) return uniqueSlug("articles", fallbackTitle);
  const event = await get<{ slug: string }>("SELECT slug FROM events WHERE id=?", [eventIds[0]]);
  if (!event) return uniqueSlug("articles", fallbackTitle);
  const pattern = new RegExp(`^${event.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  const rows = await all<{ slug: string }>("SELECT slug FROM articles WHERE slug GLOB ?", [
    `${event.slug}-[0-9]*`,
  ]);
  const largest = rows.reduce((maximum, row) => {
    const number = Number(row.slug.match(pattern)?.[1] || 0);
    return Number.isSafeInteger(number) ? Math.max(maximum, number) : maximum;
  }, 0);
  return uniqueSlug("articles", `${event.slug}-${String(largest + 1).padStart(2, "0")}`);
}

export function ids(value: unknown) {
  return Array.isArray(value) ? value.map(Number).filter(Number.isInteger) : [];
}

/** 站点主题枚举：非法值一律回退 `auto`。 */
export function normalizeVisualTheme(value: unknown): VisualTheme {
  const text = String(value ?? "").trim();
  return (VISUAL_THEMES as readonly string[]).includes(text) ? (text as VisualTheme) : "auto";
}

type NormalizedDate = { ok: true; value: string | null } | { ok: false; error: string };

/** 活动时间精确到月份；`endOfMonth` 时落到当月最后一天的 23:59:59。 */
export function normalizeEventMonth(value: unknown, endOfMonth = false): NormalizedDate {
  const text = String(value || "").trim();
  if (!text) return { ok: true, value: null };
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) return { ok: false, error: "活动时间必须精确到月份。" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12) {
    return { ok: false, error: "活动月份不正确。" };
  }
  if (!endOfMonth) return { ok: true, value: `${text}-01 00:00:00` };
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { ok: true, value: `${text}-${String(lastDay).padStart(2, "0")} 23:59:59` };
}

export function normalizeArticleDate(value: unknown): NormalizedDate {
  const text = String(value || "").trim();
  if (!text) return { ok: true, value: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return { ok: false, error: "发布日期格式不正确。" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (year < 1900 || year > 2200 || day < 1 || day > lastDay) {
    return { ok: false, error: "发布日期格式不正确。" };
  }
  return { ok: true, value: `${text} 00:00:00` };
}
