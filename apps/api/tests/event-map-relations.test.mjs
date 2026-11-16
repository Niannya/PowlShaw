import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEventMapRelation } from "../src/lib/event-map-relation-validation.ts";

test("map relations normalize endpoints and public text", () => {
  assert.deepEqual(
    normalizeEventMapRelation({
      source_node_id: "12",
      target_node_id: 34,
      name: "  同盟  ",
      description: "  共同抵御北方威胁。  ",
      notes: "  关系并不稳定。  ",
    }),
    {
      ok: true,
      value: {
        source_node_id: 12,
        target_node_id: 34,
        name: "同盟",
        description: "共同抵御北方威胁。",
        notes: "关系并不稳定。",
      },
    },
  );
});

test("map relations require two different nodes and a name", () => {
  assert.deepEqual(
    normalizeEventMapRelation({ source_node_id: 1, target_node_id: 1, name: "自身" }),
    { ok: false, error: "关系不能连接同一个节点。" },
  );
  assert.deepEqual(normalizeEventMapRelation({ source_node_id: 1, target_node_id: 2, name: "" }), {
    ok: false,
    error: "请填写关系名称。",
  });
  assert.deepEqual(normalizeEventMapRelation({ source_node_id: 0, target_node_id: 2 }), {
    ok: false,
    error: "请选择关系连接的两个节点。",
  });
});

test("map relation text limits reject oversized public content", () => {
  const result = normalizeEventMapRelation({
    source_node_id: 1,
    target_node_id: 2,
    name: "关系",
    description: "设".repeat(2001),
    notes: "",
  });
  assert.deepEqual(result, { ok: false, error: "关系描述不能超过 2000 个字符。" });
});
