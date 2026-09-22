import type { EventGroup } from "./event-groups";

/** Reorder one activity type without changing the other type's positions. */
export function moveWithinEventGroup<T extends { event_group: EventGroup }>(
  rows: readonly T[],
  group: EventGroup,
  sourceIndex: number,
  targetIndex: number,
): T[] | null {
  const positions = rows.flatMap((row, index) => (row.event_group === group ? [index] : []));
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex >= positions.length ||
    targetIndex >= positions.length ||
    sourceIndex === targetIndex
  ) {
    return null;
  }

  const groupRows = positions.map((position) => rows[position]);
  const [selected] = groupRows.splice(sourceIndex, 1);
  groupRows.splice(targetIndex, 0, selected);

  const reordered = [...rows];
  positions.forEach((position, index) => {
    reordered[position] = groupRows[index];
  });
  return reordered;
}
