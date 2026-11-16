/** Escape user input so SQLite LIKE treats %, _ and the escape character literally. */
export function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export function containsLike(value: string) {
  return `%${escapeLike(value)}%`;
}
