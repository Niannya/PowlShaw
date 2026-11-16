/**
 * 后台日期筛选使用明确的“年 / 月 / 日”文本框，避免不同浏览器把
 * `<input type="date">` 混合显示为 `yyyy/mm/日`。
 */
export function normalizeDateFilter(value?: string | null) {
  const input = String(value || "").trim();
  if (!input) return "";
  const match = input.match(
    /^(\d{4})\s*(?:[-/.]|年)\s*(\d{1,2})\s*(?:[-/.]|月)\s*(\d{1,2})\s*日?$/,
  );
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function displayDateFilter(value?: string | null) {
  const normalized = normalizeDateFilter(value);
  return normalized ? normalized.replaceAll("-", " / ") : String(value || "");
}
