import assert from "node:assert/strict";
import test from "node:test";
import { displayDateFilter, normalizeDateFilter } from "../src/lib/date-filter.ts";

test("admin date filters accept clear year-month-day forms", () => {
  assert.equal(normalizeDateFilter("2026 / 9 / 20"), "2026-09-20");
  assert.equal(normalizeDateFilter("2026年9月20日"), "2026-09-20");
  assert.equal(normalizeDateFilter("2026-09-20"), "2026-09-20");
  assert.equal(displayDateFilter("2026-09-20"), "2026 / 09 / 20");
});

test("admin date filters reject impossible or incomplete dates", () => {
  assert.equal(normalizeDateFilter("2026/02/30"), "");
  assert.equal(normalizeDateFilter("2026/09"), "");
  assert.equal(normalizeDateFilter("not-a-date"), "");
});
