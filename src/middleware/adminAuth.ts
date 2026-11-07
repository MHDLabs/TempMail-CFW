import type { MiddlewareHandler } from "hono";
import type { AppVariables, Env } from "../types/env";
import { parseSessionCookie, requireAdminSession } from "../services/authService";
import { verifyAdminPassword } from "../security/passwords";
import { Errors } from "../utils/errors";

/**
 * Single-admin auth: valid session cookie OR panel password on each request.
 * Header: X-Admin-Password or Authorization: Bearer <PANEL_PASSWORD>
 */
export const adminAuthMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: AppVariables;
}> = async (c, next) => {
  const config = c.get("config");
  if (!config.panelPassword) {
    throw Errors.serviceUnavailable("Admin password not configured");
  }

  // 1) Session cookie (web panel)
  const raw = parseSessionCookie(c.req.header("Cookie"));
  if (raw) {
    try {
      await requireAdminSession(c.env, raw);
      await next();
      return;
    } catch {
      /* fall through to password */
    }
  }

  // 2) Explicit password each request (API clients)
  const headerPw =
    c.req.header("X-Admin-Password") ||
    extractBearerPassword(c.req.header("Authorization"));
  if (headerPw) {
    const ok = await verifyAdminPassword(headerPw, config.panelPassword);
    if (ok) {
      await next();
      return;
    }
  }

  throw Errors.unauthorized("Admin authentication required");
};

function extractBearerPassword(header: string | undefined): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}
