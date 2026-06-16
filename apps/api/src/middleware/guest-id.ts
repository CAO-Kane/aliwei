import type { MiddlewareHandler } from "hono";
import { buildSetCookieHeader, readUserIdFromCookieHeader } from "@/services/guest-id";

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}

/**
 * Reads guest_id from the request cookie (or mints a new one). Stores the
 * resolved userId on `c.var.userId` for handlers. If newly minted, sets the
 * cookie on the outgoing response.
 */
export const guestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const { userId, isNew } = readUserIdFromCookieHeader(c.req.header("cookie"));
  c.set("userId", userId);
  await next();
  if (isNew) {
    c.header("Set-Cookie", buildSetCookieHeader(userId), { append: true });
  }
};
