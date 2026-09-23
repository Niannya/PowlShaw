import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_MAP_NODE_ARTICLES_MAX_COUNT,
  normalizeEventMapNode,
} from "../src/lib/event-map-node-validation.ts";

test("map nodes normalize public text and relative coordinates", () => {
  assert.deepEqual(
    normalizeEventMapNode({
      name: "  北方议会  ",
      description: "  一个抽象势力节点。  ",
      notes: "  尚待补充。  ",
      x: 0.123456789,
      y: 0.75,
    }),
    {
      ok: true,
      value: {
        name: "北方议会",
        description: "一个抽象势力节点。",
        notes: "尚待补充。",
        x: 0.123457,
        y: 0.75,
        article_ids: [],
      },
    },
  );
});

test("map nodes normalize unique article associations in selection order", () => {
  const result = normalizeEventMapNode({
    name: "节点",
    x: 0.5,
    y: 0.5,
    article_ids: [7, "9", 7],
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.article_ids, [7, 9]);
});

test("map nodes reject invalid or excessive article associations", () => {
  assert.deepEqual(normalizeEventMapNode({ name: "节点", x: 0.5, y: 0.5, article_ids: [0] }), {
    ok: false,
    error: "节点关联的文章不正确。",
  });
  assert.deepEqual(
    normalizeEventMapNode({
      name: "节点",
      x: 0.5,
      y: 0.5,
      article_ids: Array.from({ length: EVENT_MAP_NODE_ARTICLES_MAX_COUNT + 1 }, (_, i) => i + 1),
    }),
    {
      ok: false,
      error: `每个节点最多关联 ${EVENT_MAP_NODE_ARTICLES_MAX_COUNT} 篇文章。`,
    },
  );
});

test("map nodes require a name and positions inside the image", () => {
  assert.deepEqual(normalizeEventMapNode({ name: "", x: 0.5, y: 0.5 }), {
    ok: false,
    error: "请填写节点名称。",
  });
  assert.deepEqual(normalizeEventMapNode({ name: "越界", x: 1.01, y: 0.5 }), {
    ok: false,
    error: "节点位置不正确。",
  });
  assert.deepEqual(normalizeEventMapNode({ name: "非法", x: "abc", y: 0.5 }), {
    ok: false,
    error: "节点位置不正确。",
  });
});

test("map node text limits reject oversized public content", () => {
  const result = normalizeEventMapNode({
    name: "节点",
    description: "设".repeat(2001),
    notes: "",
    x: 0.5,
    y: 0.5,
  });
  assert.deepEqual(result, { ok: false, error: "节点描述不能超过 2000 个字符。" });
});
