export async function fetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);
    const data = (await response.json().catch(() => ({}))) as T;
    return { response, data, networkError: false as const };
  } catch {
    return { response: null, data: {} as T, networkError: true as const };
  }
}
