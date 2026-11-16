export function relativeRedirect(location: string, status = 307) {
  if (!location.startsWith("/") || location.startsWith("//") || /[\r\n]/.test(location)) {
    throw new Error("Redirect location must be a safe root-relative path.");
  }
  return new Response(null, { status, headers: { Location: location } });
}
