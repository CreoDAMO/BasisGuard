/**
 * API base URL for cross-origin requests to the Express backend.
 *
 * In production (separate Render static site + API service) all /api/* calls
 * must go to the API service's origin, not the static site.  Set
 * VITE_API_BASE_URL=https://basisguard-api.onrender.com in the Render
 * dashboard for the static site service.
 *
 * In development (same origin, Vite dev server) this is an empty string so
 * /api/* calls resolve to localhost without a prefix.
 *
 * Import from here instead of "@/App" to avoid circular dependencies when
 * the value is needed at module initialisation time (e.g. top-level consts).
 */
export const API =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
