/** Activity types shown in both the archive and the admin editor. */
export const EVENT_GROUPS = [
  { id: "poxiao", label: "破晓", tone: "yellow" },
  { id: "other", label: "其他", tone: "blue" },
] as const;

export type EventGroup = (typeof EVENT_GROUPS)[number]["id"];

export function isEventGroup(value: unknown): value is EventGroup {
  return value === "poxiao" || value === "other";
}

export function eventGroupLabel(group: EventGroup) {
  return EVENT_GROUPS.find((item) => item.id === group)?.label ?? "其他";
}
