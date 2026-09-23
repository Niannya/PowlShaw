import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_MAP_SNAPSHOT_DESCRIPTION_MAX_LENGTH,
  EVENT_MAP_SNAPSHOT_TITLE_MAX_LENGTH,
  normalizeEventMapSnapshot,
} from "../src/lib/event-map-snapshot-validation.ts";

test("map snapshots normalize a manual date, title and description", () => {
  assert.deepEqual(
    normalizeEventMapSnapshot({
      snapshot_date: "2026-09-23",
      title: "  第一阶段结束  ",
      description: "  记录本阶段的世界状态。  ",
    }),
    {
      ok: true,
      value: {
        snapshot_date: "2026-09-23",
        title: "第一阶段结束",
        description: "记录本阶段的世界状态。",
      },
    },
  );
});

test("map snapshots use the date when the optional title is blank", () => {
  assert.deepEqual(
    normalizeEventMapSnapshot({ snapshot_date: "2026-09-23", title: "", description: "" }),
    {
      ok: true,
      value: {
        snapshot_date: "2026-09-23",
        title: "2026-09-23 世界状态",
        description: "",
      },
    },
  );
});

test("map snapshots reject impossible dates and oversized public text", () => {
  assert.deepEqual(normalizeEventMapSnapshot({ snapshot_date: "2026-02-30" }), {
    ok: false,
    error: "快照日期不正确。",
  });
  assert.deepEqual(
    normalizeEventMapSnapshot({
      snapshot_date: "2026-09-23",
      title: "名".repeat(EVENT_MAP_SNAPSHOT_TITLE_MAX_LENGTH + 1),
    }),
    {
      ok: false,
      error: `快照名称不能超过 ${EVENT_MAP_SNAPSHOT_TITLE_MAX_LENGTH} 个字符。`,
    },
  );
  assert.deepEqual(
    normalizeEventMapSnapshot({
      snapshot_date: "2026-09-23",
      description: "说".repeat(EVENT_MAP_SNAPSHOT_DESCRIPTION_MAX_LENGTH + 1),
    }),
    {
      ok: false,
      error: `快照说明不能超过 ${EVENT_MAP_SNAPSHOT_DESCRIPTION_MAX_LENGTH} 个字符。`,
    },
  );
});
