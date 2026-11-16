import assert from "node:assert/strict";
import test from "node:test";
import { containsLike, escapeLike } from "../src/lib/db-search.ts";
import { relativeRedirect } from "../src/lib/redirect-response.ts";

test("SQL LIKE searches treat wildcard characters literally", () => {
  assert.equal(escapeLike(String.raw`50%_off\today`), String.raw`50\%\_off\\today`);
  assert.equal(containsLike("100%"), String.raw`%100\%%`);
});

test("relative redirects do not expose an internal reverse-proxy origin", () => {
  const response = relativeRedirect("/articles/example");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/articles/example");
  assert.throws(() => relativeRedirect("//evil.example"));
});
