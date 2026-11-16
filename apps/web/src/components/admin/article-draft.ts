import type { VisualTheme } from "@/lib/visual-theme";

/**
 * 这里刻意只保留类型导入：`tests/article-draft.test.mjs` 由 Node 直接执行 `.ts`，
 * 无法解析 `@/` 别名或省略扩展名的相对导入。值的完整性由该测试与
 * `VISUAL_THEMES` 逐项比对来保证。
 */
export const ARTICLE_VISUAL_THEMES: VisualTheme[] = [
  "auto",
  "astrolabe",
  "stele",
  "graticule",
  "manuscript",
];

export function normalizeArticleVisualTheme(value: unknown): VisualTheme {
  return typeof value === "string" && ARTICLE_VISUAL_THEMES.includes(value as VisualTheme)
    ? (value as VisualTheme)
    : "auto";
}

/** The editable fields shared by the article form and its local draft. */
export type ArticleInitial = {
  id?: number;
  title?: string;
  slug?: string;
  content_html?: string;
  content_markdown?: string;
  published_at?: string | null;
  visual_theme?: string | null;
  is_pinned?: number;
  comments_mode?: "open" | "closed" | "hidden";
  event_ids?: number[];
};

// 发布状态不属于可编辑草稿；提交到后端时统一公开。
export type ArticleDraft = {
  title: string;
  slug: string;
  content_html: string;
  content_markdown: string;
  published_at: string;
  visual_theme: VisualTheme;
  is_pinned: boolean;
  comments_mode: "open" | "closed" | "hidden";
  event_ids: number[];
};

export type StoredArticleDraft = {
  saved_at: string;
  data: ArticleDraft;
};

export function createArticleDraft(initial: ArticleInitial): ArticleDraft {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return {
    title: initial.title || "",
    slug: initial.slug || "",
    content_html: initial.content_html || "",
    content_markdown: initial.content_markdown || "",
    published_at: initial.published_at ? initial.published_at.slice(0, 10) : today,
    visual_theme: normalizeArticleVisualTheme(initial.visual_theme),
    is_pinned: Boolean(initial.is_pinned),
    comments_mode: initial.comments_mode || "open",
    event_ids: initial.event_ids || [],
  };
}

export function isStoredArticleDraft(value: unknown): value is StoredArticleDraft {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StoredArticleDraft>;
  const data = record.data;
  const validIds = (ids: unknown) =>
    Array.isArray(ids) && ids.every((id) => Number.isSafeInteger(id) && id > 0);

  return Boolean(
    typeof record.saved_at === "string" &&
    !Number.isNaN(Date.parse(record.saved_at)) &&
    data &&
    typeof data.title === "string" &&
    typeof data.slug === "string" &&
    typeof data.content_html === "string" &&
    typeof data.content_markdown === "string" &&
    typeof data.published_at === "string" &&
    // 旧草稿只有封面图片地址、没有题头主题字段，无法安全迁移，直接丢弃。
    typeof data.visual_theme === "string" &&
    normalizeArticleVisualTheme(data.visual_theme) === data.visual_theme &&
    typeof data.is_pinned === "boolean" &&
    (data.comments_mode === "open" ||
      data.comments_mode === "closed" ||
      data.comments_mode === "hidden") &&
    validIds(data.event_ids),
  );
}
