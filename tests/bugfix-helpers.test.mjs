import assert from "node:assert/strict";
import test from "node:test";
import { cleanHtml } from "../src/lib/content.ts";
import { normalizeLocalDateTime } from "../src/lib/date-time.ts";
import { containsLike, escapeLike } from "../src/lib/db-search.ts";
import { safeInternalPath } from "../src/lib/safe-path.ts";

test("SQL LIKE searches treat wildcard characters literally", () => {
  assert.equal(escapeLike(String.raw`50%_off\today`), String.raw`50\%\_off\\today`);
  assert.equal(containsLike("100%"), String.raw`%100\%%`);
});

test("internal return paths reject protocol-relative and backslash redirects", () => {
  assert.equal(safeInternalPath("/articles/example"), "/articles/example");
  assert.equal(safeInternalPath("//evil.example"), "/");
  assert.equal(safeInternalPath(String.raw`/\evil.example`), "/");
  assert.equal(safeInternalPath("https://evil.example"), "/");
});

test("admin mute time accepts real local minutes and rejects impossible dates", () => {
  assert.deepEqual(normalizeLocalDateTime("2026-09-20T14:30"), {
    ok: true,
    value: "2026-09-20 14:30:00",
  });
  assert.equal(normalizeLocalDateTime("2026-02-30T14:30").ok, false);
  assert.equal(normalizeLocalDateTime("not-a-date").ok, false);
  assert.deepEqual(normalizeLocalDateTime(""), { ok: true, value: null });
});

test("saved HTML strips scripts and protocol-relative external links", () => {
  const html = cleanHtml('<script>alert(1)</script><a href="//evil.example">bad</a>');
  assert.doesNotMatch(html, /script|\/\/evil\.example/i);
  assert.match(html, />bad<\/a>/);
});
