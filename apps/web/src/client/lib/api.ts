// Centralizes how the browser talks to apps/api.
// `NEXT_PUBLIC_API_URL` is read at build time; defaults to localhost:3001 for
// dev. Always sends cookies (required because api lives on a different origin).

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_URL}${normalized}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: "include",
  });
}
