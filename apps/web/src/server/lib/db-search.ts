/** 转义用户输入，让 SQLite 的 LIKE 把 `%`、`_` 和转义符当作普通字符。 */
export function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export function containsLike(value: string) {
  return `%${escapeLike(value)}%`;
}
