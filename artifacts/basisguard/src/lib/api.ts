const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?.replace(/\/$/, "") ?? "";

export const API = configuredApiBase;

export function apiUrl(path: string): string {
  return `${API}${path}`;
}