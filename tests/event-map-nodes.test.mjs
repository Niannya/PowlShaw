import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEventMapNode } from "../src/lib/event-map-node-validation.ts";

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
      },
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
