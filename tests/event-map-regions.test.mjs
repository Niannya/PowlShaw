import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEventMapRegion } from "../src/lib/event-map-region-validation.ts";

test("map regions normalize text, color and relative polygon points", () => {
  assert.deepEqual(
    normalizeEventMapRegion({
      name: "  北境  ",
      description: "  寒冷地区。  ",
      notes: "  边界仍会变化。  ",
      color: "#A46C3B",
      points: [
        { x: 0.123456789, y: 0.2 },
        { x: 0.5, y: 0.2 },
        { x: 0.4, y: 0.7 },
      ],
    }),
    {
      ok: true,
      value: {
        name: "北境",
        description: "寒冷地区。",
        notes: "边界仍会变化。",
        color: "#a46c3b",
        points: [
          { x: 0.123457, y: 0.2 },
          { x: 0.5, y: 0.2 },
          { x: 0.4, y: 0.7 },
        ],
      },
    },
  );
});

test("map regions require a real polygon and valid color", () => {
  assert.deepEqual(
    normalizeEventMapRegion({
      name: "直线",
      color: "#123456",
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.3 },
      ],
    }),
    { ok: false, error: "区域范围过小或顶点位于同一直线上。" },
  );
  assert.deepEqual(
    normalizeEventMapRegion({
      name: "颜色错误",
      color: "red",
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.3, y: 0.5 },
      ],
    }),
    { ok: false, error: "区域颜色不正确。" },
  );
});

test("map regions reject oversized public content and too many points", () => {
  const oversized = normalizeEventMapRegion({
    name: "区域",
    description: "设".repeat(2001),
    color: "#123456",
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.3, y: 0.5 },
    ],
  });
  assert.deepEqual(oversized, { ok: false, error: "区域描述不能超过 2000 个字符。" });

  const tooMany = Array.from({ length: 65 }, (_, index) => ({
    x: 0.5 + Math.cos((index / 65) * Math.PI * 2) * 0.3,
    y: 0.5 + Math.sin((index / 65) * Math.PI * 2) * 0.3,
  }));
  assert.deepEqual(
    normalizeEventMapRegion({ name: "过多顶点", color: "#123456", points: tooMany }),
    { ok: false, error: "区域不能超过 64 个顶点。" },
  );
});
