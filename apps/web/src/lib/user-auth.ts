export type { PublicUser } from "@/lib/api/types";

export { getCurrentUser } from "@/lib/api/public";

import type { PublicUser } from "@/lib/api/types";

/** Same rule as the API: forced password changes and active mutes block writing. */
export function userCanPublishContent(user: PublicUser) {
  if (user.must_change_password) return false;
  if (!user.muted_until) return true;
  const mutedUntil = Date.parse(`${user.muted_until.replace(" ", "T")}+08:00`);
  return !Number.isFinite(mutedUntil) || mutedUntil <= Date.now();
}
