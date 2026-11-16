import assert from "node:assert/strict";
import test from "node:test";
import {
  RESOLVED_VISUAL_THEMES,
  VISUAL_THEMES,
  hashSlug,
  normalizeVisualTheme,
  resolveVisualTheme,
  visualThemeLabel,
} from "../src/lib/visual-theme.ts";

test("FNV-1a slug hashing matches the reference implementation", () => {
  assert.equal(hashSlug("hello"), 1335831723);
  assert.equal(hashSlug("2026-spring"), 2227104311);
  assert.equal(hashSlug(""), 2166136261);
  assert.equal(hashSlug("同一个别名"), hashSlug("同一个别名"));
});

test("unknown or legacy visual themes fall back to auto", () => {
  assert.equal(normalizeVisualTheme("auto"), "auto");
  assert.equal(normalizeVisualTheme("manuscript"), "manuscript");
  assert.equal(normalizeVisualTheme("lieguoji"), "auto");
  assert.equal(normalizeVisualTheme(undefined), "auto");
  assert.equal(normalizeVisualTheme(null), "auto");
  assert.equal(normalizeVisualTheme(42), "auto");
  assert.equal(visualThemeLabel("nope"), "自动（按网址别名生成）");
});

test("auto resolves deterministically to one of the four concrete themes", () => {
  const first = resolveVisualTheme("auto", "2026-spring");
  assert.equal(first, "manuscript");
  assert.equal(resolveVisualTheme("auto", "2026-spring"), first);
  assert.equal(resolveVisualTheme("stele", "2026-spring"), "stele");

  for (const slug of ["a", "b", "c", "d", "e", "f", "g", "h", "破晓", "other-event"]) {
    const resolved = resolveVisualTheme("auto", slug);
    assert.ok(
      RESOLVED_VISUAL_THEMES.includes(resolved),
      `${slug} 解析成了未注册的主题 ${resolved}`,
    );
  }
});

test("theme labels cover every enum value", () => {
  assert.deepEqual(
    VISUAL_THEMES.map((theme) => theme.value),
    ["auto", ...RESOLVED_VISUAL_THEMES],
  );
  for (const theme of VISUAL_THEMES) assert.ok(theme.label.length > 0);
});
