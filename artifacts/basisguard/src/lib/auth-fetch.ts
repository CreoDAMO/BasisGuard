/**
 * Module-level auth fetch utility.
 *
 * Call registerTokenGetter() once at app startup (inside a component that has
 * access to Clerk's useAuth). Every subsequent authFetch() call will
 * automatically attach an Authorization: Bearer <token> header.
 *
 * Required for cross-origin requests where Clerk session cookies are not
 * forwarded by the browser (basisguard.site → basisguard-api.onrender.com).
 */

let _tokenGetter: (() => Promise<string | null>) | null = null;

export function registerTokenGetter(
  getter: (() => Promise<string | null>) | null,
): void {
  _tokenGetter = getter;
}

/**
 * Drop-in replacement for fetch that:
 *  - Always adds credentials: "include"
 *  - Attaches Authorization: Bearer <token> when a token getter is registered
 *
 * Caller-supplied headers are merged after the auth header so an explicit
 * Authorization override is still respected.
 */
export async function authFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = _tokenGetter ? await _tokenGetter() : null;
  const headers = new Headers(init?.headers);
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return fetch(input, { credentials: "include", ...init, headers });
}
