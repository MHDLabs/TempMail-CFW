import type { MiddlewareHandler } from "hono";
import type { AppVariables, Env } from "../types/env";

/**
 * Baseline hardening headers for API and HTML responses.
 */
export const securityHeadersMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: AppVariables;
}> = async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Referrer-Policy", "no-referrer");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // API is not intended for arbitrary cross-origin credentialed embedding
  if (!c.res.headers.has("Cache-Control")) {
    const path = c.req.path;
    if (path.startsWith("/api") || path.startsWith("/email") || path.startsWith("/auth")) {
      c.res.headers.set("Cache-Control", "no-store");
    }
  }
};
