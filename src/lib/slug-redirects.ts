import { getDb } from "@/lib/db";

export type SlugKind = "article" | "event";

export function getSlugRedirect(kind: SlugKind, oldSlug: string) {
  return (
    getDb()
      .prepare("SELECT new_slug FROM slug_redirects WHERE kind=? AND old_slug=?")
      .get(kind, oldSlug) as { new_slug: string } | undefined
  )?.new_slug;
}

/** Record a rename and flatten older redirects that pointed at the previous slug. */
export function recordSlugRedirect(kind: SlugKind, oldSlug: string, newSlug: string) {
  if (!oldSlug || oldSlug === newSlug) return;
  const db = getDb();
  db.prepare("UPDATE slug_redirects SET new_slug=? WHERE kind=? AND new_slug=?").run(
    newSlug,
    kind,
    oldSlug,
  );
  db.prepare(
    `INSERT INTO slug_redirects(kind, old_slug, new_slug)
     VALUES (?, ?, ?)
     ON CONFLICT(kind, old_slug) DO UPDATE SET new_slug=excluded.new_slug`,
  ).run(kind, oldSlug, newSlug);
  // A currently valid slug must always win over a historical redirect.
  db.prepare("DELETE FROM slug_redirects WHERE kind=? AND old_slug=? AND new_slug<>?").run(
    kind,
    newSlug,
    newSlug,
  );
}
