import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

// 会话签名只依赖 HMAC；测试里给一个足够长的固定密钥即可，不连接数据库。
process.env.SESSION_SECRET = "server-test-secret-value-at-least-32-chars";

const {
  createAdminSessionToken,
  createUserSessionToken,
  hashPassword,
  userCanPublishContent,
  validateAdminNote,
  validateDisplayName,
  validatePassword,
  validateUsername,
  verifyAdminSessionToken,
  verifyLoginPassword,
  verifyPassword,
  verifyUserSessionToken,
} = await import("../src/server/lib/session-tokens.ts");

const SECRET = process.env.SESSION_SECRET;

function signUser(payload) {
  return crypto.createHmac("sha256", SECRET).update(`user-session:${payload}`).digest("base64url");
}

function signAdmin(payload) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

test("user session token keeps the 5-segment userId.sessionVersion.expires.nonce.hmac format", () => {
  const token = createUserSessionToken(42, 7);
  const parts = token.split(".");
  assert.equal(parts.length, 5);
  assert.equal(parts[0], "42");
  assert.equal(parts[1], "7");

  const session = verifyUserSessionToken(token);
  assert.deepEqual(session, { userId: 42, sessionVersion: 7 });
});

test("tampered user tokens are rejected (payload, signature, secret rotation)", () => {
  const token = createUserSessionToken(42, 7);
  const parts = token.split(".");

  const raisedVersion = [parts[0], "8", parts[2], parts[3], parts[4]].join(".");
  assert.equal(verifyUserSessionToken(raisedVersion), undefined);

  const forgedSignature = [parts[0], parts[1], parts[2], parts[3], `${parts[4]}x`].join(".");
  assert.equal(verifyUserSessionToken(forgedSignature), undefined);

  assert.equal(verifyUserSessionToken("not-a-token"), undefined);
  assert.equal(verifyUserSessionToken(""), undefined);

  process.env.SESSION_SECRET = `${SECRET}-rotated`;
  assert.equal(verifyUserSessionToken(token), undefined);
  process.env.SESSION_SECRET = SECRET;
});

test("expired user tokens are rejected even with a valid signature", () => {
  const userId = 5;
  const sessionVersion = 1;
  const expires = Math.floor(Date.now() / 1000) - 60;
  const payload = `${userId}.${sessionVersion}.${expires}.${crypto.randomBytes(8).toString("base64url")}`;
  const token = `${payload}.${signUser(payload)}`;
  assert.equal(verifyUserSessionToken(token), undefined);
});

test("admin session token keeps the 4-segment version.expires.nonce.hmac format", () => {
  const token = createAdminSessionToken(3);
  const parts = token.split(".");
  assert.equal(parts.length, 4);
  assert.equal(verifyAdminSessionToken(token), 3);

  const forged = [parts[0], parts[1], parts[2], `${parts[3]}0`].join(".");
  assert.equal(verifyAdminSessionToken(forged), undefined);
  assert.equal(verifyAdminSessionToken(undefined), undefined);
});

test("expired admin tokens are rejected even with a valid signature", () => {
  const expires = Math.floor(Date.now() / 1000) - 1;
  const payload = `1.${expires}.${crypto.randomBytes(8).toString("base64url")}`;
  const token = `${payload}.${signAdmin(payload)}`;
  assert.equal(verifyAdminSessionToken(token), undefined);
});

test("scrypt password hashing round-trips and rejects wrong input", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.match(stored, /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(verifyPassword("correct horse battery staple", stored), true);
  assert.equal(verifyPassword("wrong password", stored), false);
  assert.equal(verifyPassword("anything", "sha256$broken"), false);

  // 用户不存在时也走一次 scrypt（防用户名枚举的响应时间差）。
  assert.equal(verifyLoginPassword("whatever", undefined), false);
  assert.equal(verifyLoginPassword("", stored), false);
});

test("user validators keep the legacy Chinese limits", () => {
  assert.deepEqual(validateUsername("  editor_01 "), { ok: true, value: "editor_01" });
  assert.equal(validateUsername("ab").ok, false);
  assert.equal(validateUsername("bad name").ok, false);
  assert.equal(validateDisplayName("").ok, false);
  assert.equal(validateDisplayName("破晓").ok, true);
  assert.equal(validateAdminNote("x".repeat(501)).ok, false);
  assert.equal(validatePassword("short").ok, false);
  assert.deepEqual(validatePassword("", false), { ok: true, value: "" });
});

test("userCanPublishContent blocks first-login password change and active mutes", () => {
  const base = {
    id: 1,
    username: "editor",
    display_name: "编辑",
    is_active: 1,
    must_change_password: 0,
    session_version: 1,
    muted_until: null,
    mute_reason: "",
  };
  assert.equal(userCanPublishContent(base), true);
  assert.equal(userCanPublishContent({ ...base, must_change_password: 1 }), false);

  // 禁言时间是“中国本地墙上时间”，因此构造时先按 +08:00 换算。
  const chinaWallClock = (offsetMs) =>
    new Date(Date.now() + offsetMs + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

  assert.equal(
    userCanPublishContent({ ...base, muted_until: chinaWallClock(60 * 60 * 1000) }),
    false,
  );
  assert.equal(
    userCanPublishContent({ ...base, muted_until: chinaWallClock(-60 * 60 * 1000) }),
    true,
  );
});
