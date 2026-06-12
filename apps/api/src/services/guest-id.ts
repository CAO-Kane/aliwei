const COOKIE_NAME = "guest_id";
const MAX_AGE = 60 * 60 * 24 * 365;

export function readUserIdFromCookieHeader(cookieHeader: string | undefined): {
  userId: string;
  isNew: boolean;
} {
  const header = cookieHeader ?? "";
  const match = header.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  if (match) {
    return { userId: match[1], isNew: false };
  }
  return { userId: crypto.randomUUID(), isNew: true };
}

export function buildSetCookieHeader(userId: string): string {
  // SameSite=None + Secure are required when web and api live on different
  // origins. In dev (http://localhost) browsers tolerate SameSite=Lax for
  // same-site-different-port; flip to None;Secure in production.
  const sameSite = process.env.NODE_ENV === "production" ? "None" : "Lax";
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${userId}; Path=/; HttpOnly; SameSite=${sameSite}${secure}; Max-Age=${MAX_AGE}`;
}
