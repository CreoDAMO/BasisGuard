import { authFetch } from "@/lib/auth-fetch";

/**
 * Coerce an API payload into an array. Error objects ({error, status}) and
 * wrapped list envelopes must never reach .map / .filter — optional chaining
 * does not guard a truthy non-array.
 */
export function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    for (const key of ["items", "chains", "protocols", "data", "results"]) {
      if (Array.isArray(rec[key])) return rec[key] as T[];
    }
  }
  return [];
}

export async function fetchJsonList<T>(url: string): Promise<T[]> {
  const r = await authFetch(url);
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const msg =
      body && typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return asArray<T>(body);
}
