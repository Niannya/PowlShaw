/**
 * 纯代码视觉主题：全站不再引用任何光栅图片，
 * 活动题头与文章封面统一由 `slug` 的 FNV-1a 哈希确定性生成 SVG 版画。
 *
 * 本文件必须保持“无 React / 无副作用”，可同时被服务端组件、后台表单与
 * 浏览器端组件导入。
 */

export type VisualTheme = "auto" | "astrolabe" | "stele" | "graticule" | "manuscript";

/** `auto` 之外的四种可渲染主题。 */
export type ResolvedVisualTheme = Exclude<VisualTheme, "auto">;

export const VISUAL_THEMES: { value: VisualTheme; label: string }[] = [
  { value: "auto", label: "自动（按网址别名生成）" },
  { value: "astrolabe", label: "星轨图" },
  { value: "stele", label: "碑刻" },
  { value: "graticule", label: "经纬网" },
  { value: "manuscript", label: "稿纸" },
];

export const RESOLVED_VISUAL_THEMES: ResolvedVisualTheme[] = [
  "astrolabe",
  "stele",
  "graticule",
  "manuscript",
];

/** 非法值（旧数据、空串、未知枚举）一律回退到 `auto`。 */
export function normalizeVisualTheme(value: unknown): VisualTheme {
  if (typeof value !== "string") return "auto";
  const candidate = value.trim() as VisualTheme;
  return VISUAL_THEMES.some((theme) => theme.value === candidate) ? candidate : "auto";
}

/** FNV-1a 32 位哈希：同一个 slug 永远得到同一幅题头。 */
export function hashSlug(slug: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < slug.length; index += 1) {
    hash ^= slug.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 把 `auto` 按 slug 哈希解析成具体的四种主题之一。 */
export function resolveVisualTheme(theme: unknown, slug: string): ResolvedVisualTheme {
  const normalized = normalizeVisualTheme(theme);
  if (normalized !== "auto") return normalized;
  return RESOLVED_VISUAL_THEMES[hashSlug(slug) % RESOLVED_VISUAL_THEMES.length];
}

export function visualThemeLabel(value: unknown): string {
  const normalized = normalizeVisualTheme(value);
  return VISUAL_THEMES.find((theme) => theme.value === normalized)?.label || "自动";
}
