import { get, run } from "../db/sql";

export type SlugKind = "article" | "event";

export async function getSlugRedirect(kind: SlugKind, oldSlug: string) {
  const row = await get<{ new_slug: string }>(
    "SELECT new_slug FROM slug_redirects WHERE kind=? AND old_slug=?",
    [kind, oldSlug],
  );
  return row?.new_slug;
}

/** 记录改名，并把指向旧地址的更早跳转压平成指向最新地址。 */
export async function recordSlugRedirect(kind: SlugKind, oldSlug: string, newSlug: string) {
  if (!oldSlug || oldSlug === newSlug) return;
  await run("UPDATE slug_redirects SET new_slug=? WHERE kind=? AND new_slug=?", [
    newSlug,
    kind,
    oldSlug,
  ]);
  await run(
    `INSERT INTO slug_redirects(kind, old_slug, new_slug)
     VALUES (?, ?, ?)
     ON CONFLICT(kind, old_slug) DO UPDATE SET new_slug=excluded.new_slug`,
    [kind, oldSlug, newSlug],
  );
  // 当前有效的别名永远优先于历史跳转。
  await run("DELETE FROM slug_redirects WHERE kind=? AND old_slug=? AND new_slug<>?", [
    kind,
    newSlug,
    newSlug,
  ]);
}
