/**
 * Accept only a local, root-relative path. Backslashes are rejected because
 * browsers and proxies can normalize them into a protocol-relative redirect.
 */
export function safeInternalPath(value: unknown, fallback = "/") {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : fallback;
}
