import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTICLE_VISUAL_THEMES,
  createArticleDraft,
  isStoredArticleDraft,
  normalizeArticleVisualTheme,
} from "../src/components/admin/article-draft.ts";
import { VISUAL_THEMES } from "../src/lib/visual-theme.ts";

test("new articles get editable defaults", () => {
  const draft = createArticleDraft({});
  assert.equal("status" in draft, false);
  assert.equal("cover_url" in draft, false);
  assert.equal(draft.comments_mode, "open");
  assert.equal(draft.visual_theme, "auto");
  assert.equal("category_ids" in draft, false);
  assert.match(draft.published_at, /^\d{4}-\d{2}-\d{2}$/);
});

test("existing article dates are normalized to day precision", () => {
  const draft = createArticleDraft({
    title: "旧稿",
    published_at: "2025-06-10 08:30:00",
    visual_theme: "stele",
  });
  assert.equal(draft.title, "旧稿");
  assert.equal(draft.published_at, "2025-06-10");
  assert.equal(draft.visual_theme, "stele");
});

test("the draft theme list stays in sync with the shared visual theme enum", () => {
  assert.deepEqual(
    [...ARTICLE_VISUAL_THEMES].sort(),
    VISUAL_THEMES.map((theme) => theme.value).sort(),
  );
  assert.equal(normalizeArticleVisualTheme("manuscript"), "manuscript");
  assert.equal(normalizeArticleVisualTheme(null), "auto");
});

test("unknown visual themes fall back to auto", () => {
  const draft = createArticleDraft({ visual_theme: "lieguoji" });
  assert.equal(draft.visual_theme, "auto");
});

test("recovery accepts complete drafts but rejects damaged local data", () => {
  const valid = { saved_at: new Date().toISOString(), data: createArticleDraft({ title: "草稿" }) };
  assert.equal(isStoredArticleDraft(valid), true);
  assert.equal(isStoredArticleDraft({ ...valid, data: { title: "残缺草稿" } }), false);
  assert.equal(
    isStoredArticleDraft({ ...valid, data: { ...valid.data, event_ids: ["not an id"] } }),
    false,
  );
  assert.equal(isStoredArticleDraft({ ...valid, saved_at: "invalid date" }), false);
});

test("legacy drafts with cover_url are discarded instead of half-restored", () => {
  const draft = createArticleDraft({ title: "旧草稿" });
  const { visual_theme, ...withoutTheme } = draft;
  assert.equal(visual_theme, "auto");
  assert.equal(
    isStoredArticleDraft({
      saved_at: new Date().toISOString(),
      data: { ...withoutTheme, cover_url: "/uploads/legacy.png" },
    }),
    false,
  );
  assert.equal(
    isStoredArticleDraft({
      saved_at: new Date().toISOString(),
      data: { ...draft, visual_theme: "no-such-theme" },
    }),
    false,
  );
});
