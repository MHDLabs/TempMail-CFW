import { Hono } from "hono";
import type { AppVariables, Env } from "../types/env";
import {
  buildSessionCookie,
  clearSessionCookie,
  loginAdmin,
  logoutAdmin,
  parseSessionCookie,
} from "../services/authService";
import { assertRateLimit, clientIp } from "../services/rateLimitService";
import { Errors } from "../utils/errors";

/** Legacy panel auth paths used by the existing web UI. */
export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

authRoutes.post("/auth/login", async (c) => {
  await assertRateLimit(c.env, "login", clientIp(c.req.raw));
  let body: { password?: string } = {};
  try {
    body = (await c.req.json()) as { password?: string };
  } catch {
    throw Errors.invalidRequest("JSON body required");
  }
  if (typeof body.password !== "string" || !body.password) {
    throw Errors.invalidRequest("password required");
  }
  const { sessionId, expiresAt } = await loginAdmin(c.env, c.get("config"), body.password);
  c.header("Set-Cookie", buildSessionCookie(sessionId, expiresAt));
  return c.json({ success: true, expires_at: expiresAt });
});

authRoutes.post("/auth/logout", async (c) => {
  const raw = parseSessionCookie(c.req.header("Cookie"));
  await logoutAdmin(c.env, raw);
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ success: true });
});
