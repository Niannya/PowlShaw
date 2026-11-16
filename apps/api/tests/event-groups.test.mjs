import assert from "node:assert/strict";
import test from "node:test";
import { EVENT_GROUPS, eventGroupLabel, isEventGroup } from "../src/lib/event-groups.ts";
import { moveWithinEventGroup } from "../src/lib/event-order.ts";

test("activity types have stable labels and reject unknown values", () => {
  assert.deepEqual(
    EVENT_GROUPS.map((group) => group.id),
    ["poxiao", "other"],
  );
  assert.equal(eventGroupLabel("poxiao"), "破晓");
  assert.equal(eventGroupLabel("other"), "其他");
  assert.equal(isEventGroup("poxiao"), true);
  assert.equal(isEventGroup("archived"), false);
});

test("reordering one activity type leaves the other type in place", () => {
  const rows = [
    { id: 1, event_group: "other" },
    { id: 2, event_group: "poxiao" },
    { id: 3, event_group: "other" },
    { id: 4, event_group: "poxiao" },
  ];
  const reordered = moveWithinEventGroup(rows, "poxiao", 0, 1);
  assert.deepEqual(
    reordered?.map((row) => row.id),
    [1, 4, 3, 2],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    [1, 2, 3, 4],
  );
  assert.equal(moveWithinEventGroup(rows, "poxiao", 0, 2), null);
  assert.equal(moveWithinEventGroup(rows, "other", 1, 1), null);
});
