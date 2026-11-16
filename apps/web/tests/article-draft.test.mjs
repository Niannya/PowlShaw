import assert from "node:assert/strict";
import test from "node:test";
import { createArticleDraft, isStoredArticleDraft } from "../src/components/admin/article-draft.ts";

test("new articles get editable defaults", () => {
  const draft = createArticleDraft({});
  assert.equal("status" in draft, false);
  assert.equal(draft.comments_mode, "open");
  assert.equal("category_ids" in draft, false);
  assert.match(draft.published_at, /^\d{4}-\d{2}-\d{2}$/);
});

test("existing article dates are normalized to day precision", () => {
  const draft = createArticleDraft({
    title: "旧稿",
    published_at: "2025-06-10 08:30:00",
  });
  assert.equal(draft.title, "旧稿");
  assert.equal(draft.published_at, "2025-06-10");
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
