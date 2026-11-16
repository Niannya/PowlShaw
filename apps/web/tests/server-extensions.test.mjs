import assert from "node:assert/strict";
import test from "node:test";

const { ballotExtension, extensionDefinitions, getExtensionDefinition } =
  await import("../src/lib/extensions/definitions.ts");
const { buildPublicExtensions, visibleExtensionScopes } =
  await import("../src/server/lib/extensions/visibility.ts");

/* ------------------------------------------------------- 扩展定义与 Zod */

test("all four built-in extension kinds are registered with version 1", () => {
  assert.deepEqual(Object.keys(extensionDefinitions).sort(), [
    "ballot",
    "gallery",
    "ranking",
    "timeline",
  ]);
  for (const definition of Object.values(extensionDefinitions)) {
    assert.equal(definition.version, 1);
    assert.ok(definition.itemSchema, `${definition.kind} 应有 itemSchema`);
  }
  assert.equal(getExtensionDefinition("ranking")?.title, "晋级名单");
  assert.equal(getExtensionDefinition("unknown-kind"), undefined);
});

test("config schemas accept defaults and reject invalid payloads", () => {
  const ranking = getExtensionDefinition("ranking").configSchema.safeParse({});
  assert.equal(ranking.success, true);
  assert.equal(ranking.data.title, "晋级名单");
  assert.deepEqual(ranking.data.columns, []);

  assert.equal(
    getExtensionDefinition("ranking").configSchema.safeParse({ title: "" }).success,
    false,
  );
  assert.equal(
    getExtensionDefinition("gallery").configSchema.safeParse({ columns: 5 }).success,
    false,
  );

  const ballotConfig = ballotExtension.configSchema.safeParse({
    options: [
      { key: "a", label: "选项 A" },
      { key: "b", label: "选项 B" },
    ],
  });
  assert.equal(ballotConfig.success, true);
  assert.equal(ballotExtension.configSchema.safeParse({ options: [] }).success, false);
  assert.equal(ballotExtension.allowsUserItems, true);
});

test("item schemas validate the growable collections and user ballots", () => {
  const rankingItem = getExtensionDefinition("ranking").itemSchema;
  assert.equal(rankingItem.safeParse({ rank: 1, name: "甲" }).success, true);
  assert.equal(rankingItem.safeParse({ rank: 0, name: "甲" }).success, false);
  assert.equal(rankingItem.safeParse({ rank: 1, name: "" }).success, false);

  const timelineItem = getExtensionDefinition("timeline").itemSchema;
  assert.equal(timelineItem.safeParse({ date: "2026-09", title: "征稿" }).success, true);
  assert.equal(timelineItem.safeParse({ date: "", title: "征稿" }).success, false);

  const ballotItem = ballotExtension.itemSchema;
  assert.equal(ballotItem.safeParse({ choice: "a" }).success, true);
  assert.equal(ballotItem.safeParse({ choice: ["a", "b"] }).success, true);
  assert.equal(ballotItem.safeParse({ choice: "" }).success, false);
});

/* ------------------------------------------------------------ 可见性合并 */

function row(overrides) {
  return {
    id: 1,
    eventId: 9,
    kind: "ranking",
    version: 1,
    visibility: "public",
    allowUserItems: 0,
    sortOrder: 0,
    configJson: JSON.stringify({ title: "晋级名单" }),
    ...overrides,
  };
}

const items = [
  { extensionId: 1, itemKey: "r1", payloadJson: JSON.stringify({ rank: 1, name: "甲" }) },
  { extensionId: 2, itemKey: "u7", payloadJson: JSON.stringify({ choice: "a" }) },
  { extensionId: 1, itemKey: "broken", payloadJson: "{not json" },
];

test("anonymous readers only see public extensions, members also see member ones", () => {
  assert.deepEqual(visibleExtensionScopes(false), ["public"]);
  assert.deepEqual(visibleExtensionScopes(true), ["public", "member"]);

  const rows = [
    row({ id: 2, kind: "ballot", visibility: "member", allowUserItems: 1, sortOrder: 10 }),
    row({ id: 1, kind: "ranking", sortOrder: 0 }),
    row({ id: 3, kind: "gallery", visibility: "member", sortOrder: 20 }),
  ];

  const anonymous = buildPublicExtensions(rows, items, false, false);
  assert.deepEqual(
    anonymous.map((extension) => extension.kind),
    ["ranking"],
  );

  const member = buildPublicExtensions(rows, items, true, true);
  assert.deepEqual(
    member.map((extension) => extension.kind),
    ["ranking", "ballot", "gallery"],
  );
  // 条目按扩展归组，损坏的 payload 被跳过。
  assert.deepEqual(member[0].items, [{ itemKey: "r1", payload: { rank: 1, name: "甲" } }]);
  assert.deepEqual(member[1].items, [{ itemKey: "u7", payload: { choice: "a" } }]);
});

test("extensions are sorted by sortOrder then id and carry eventId", () => {
  const rows = [
    row({ id: 5, kind: "timeline", sortOrder: 20 }),
    row({ id: 4, kind: "gallery", sortOrder: 10 }),
    row({ id: 3, kind: "ranking", sortOrder: 10 }),
  ];
  const result = buildPublicExtensions(rows, [], false, false);
  assert.deepEqual(
    result.map((extension) => extension.kind),
    ["ranking", "gallery", "timeline"],
  );
  assert.equal(result[0].eventId, 9);
  assert.deepEqual(result[0].items, []);
});

test("broken config JSON hides the whole module instead of throwing", () => {
  const rows = [
    row({ id: 1, kind: "ranking", configJson: "{ oops" }),
    row({ id: 2, kind: "gallery", sortOrder: 1 }),
  ];
  const result = buildPublicExtensions(rows, [], false, false);
  assert.deepEqual(
    result.map((extension) => extension.kind),
    ["gallery"],
  );
});

test("canSubmit requires an enabled user-item module and a writable session", () => {
  const rows = [
    row({ id: 1, kind: "ballot", allowUserItems: 1 }),
    row({ id: 2, kind: "ranking", allowUserItems: 0, sortOrder: 1 }),
  ];

  const withoutSession = buildPublicExtensions(rows, [], true, false);
  assert.deepEqual(
    withoutSession.map((extension) => extension.canSubmit),
    [false, false],
  );

  const withSession = buildPublicExtensions(rows, [], true, true);
  assert.deepEqual(
    withSession.map((extension) => extension.canSubmit),
    [true, false],
  );
});
