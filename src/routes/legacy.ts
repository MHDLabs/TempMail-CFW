import { Hono } from "hono";
import type { AppVariables, Env } from "../types/env";
import { Errors } from "../utils/errors";

/**
 * Legacy compatibility routes.
 * Full inbox logic lands in Phase 4; foundation only registers the surface.
 */
export const legacyRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

legacyRoutes.post("/email", async () => {
  throw Errors.serviceUnavailable("Inbox engine not yet enabled in this build phase");
});

legacyRoutes.get("/email/check", async (c) => {
  const name = c.req.query("name") ?? "";
  // Availability requires DB; foundation returns structured not-ready until Phase 4
  throw Errors.serviceUnavailable("Inbox engine not yet enabled in this build phase");
});

legacyRoutes.get("/email/:name", async () => {
  throw Errors.serviceUnavailable("Inbox engine not yet enabled in this build phase");
});

legacyRoutes.delete("/email/:name", async () => {
  throw Errors.serviceUnavailable("Inbox engine not yet enabled in this build phase");
});
