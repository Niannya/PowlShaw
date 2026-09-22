export type EventTiming = {
  starts_at: string | null;
  ends_at: string | null;
  status_override: "upcoming" | "active" | "ended" | null;
};

export function eventStatus(event: EventTiming) {
  if (event.status_override) return event.status_override;
  const now = Date.now();
  const start = event.starts_at
    ? new Date(event.starts_at.replace(" ", "T") + "+08:00").getTime()
    : undefined;
  const end = event.ends_at
    ? new Date(event.ends_at.replace(" ", "T") + "+08:00").getTime()
    : undefined;
  if (start && now < start) return "upcoming" as const;
  if (end && now > end) return "ended" as const;
  return "active" as const;
}
