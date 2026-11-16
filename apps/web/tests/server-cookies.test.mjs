import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { formRedirect } from "../src/server/lib/api-response.ts";

/**
 * 回归：登录/登出/访问计数都在路由里 setCookie，若直接返回 `new Response` 或
 * `Response.json` 而不是 Hono 的 `c.json` / `c.redirect`，Set-Cookie 会被丢掉。
 * 这里用不依赖数据库的最小 Hono 应用锁住这个行为。
 */
test("cookies survive form redirects generated through the Hono context", async () => {
  const app = new Hono();
  app.get("/redirect", (c) => {
    setCookie(c, "session", "token-value", { path: "/", httpOnly: true });
    return formRedirect(c, "/admin", 303);
  });
  app.get("/json", (c) => {
    setCookie(c, "session", "token-value", { path: "/", httpOnly: true });
    return c.json({ ok: true });
  });
  app.get("/logout", (c) => {
    deleteCookie(c, "session", { path: "/" });
    return c.json({ ok: true });
  });

  const redirect = await app.request("http://localhost/redirect");
  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get("location"), "/admin");
  assert.match(redirect.headers.get("set-cookie") || "", /session=token-value/);

  const json = await app.request("http://localhost/json");
  assert.equal(json.status, 200);
  assert.match(json.headers.get("set-cookie") || "", /session=token-value/);

  const logout = await app.request("http://localhost/logout");
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") || "", /session=.*Max-Age=0/);
});
