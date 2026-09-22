/** The editable fields shared by the article form and its local draft. */
export type ArticleInitial = {
  id?: number;
  title?: string;
  slug?: string;
  content_html?: string;
  content_markdown?: string;
  status?: string;
  published_at?: string | null;
  cover_url?: string | null;
  is_pinned?: number;
  comments_mode?: "open" | "closed" | "hidden";
  event_ids?: number[];
};

export type ArticleDraft = {
  title: string;
  slug: string;
  content_html: string;
  content_markdown: string;
  status: "draft" | "published";
  published_at: string;
  cover_url: string;
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
    status: initial.status === "published" ? "published" : "draft",
    published_at: initial.published_at ? initial.published_at.slice(0, 10) : today,
    cover_url: initial.cover_url || "",
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
    (data.status === "draft" || data.status === "published") &&
    typeof data.published_at === "string" &&
    typeof data.cover_url === "string" &&
    typeof data.is_pinned === "boolean" &&
    (data.comments_mode === "open" ||
      data.comments_mode === "closed" ||
      data.comments_mode === "hidden") &&
    validIds(data.event_ids),
  );
}
