import { Hono } from "hono";
import type { AppVariables, Env } from "../types/env";
import {
  checkNameAvailable,
  createInbox,
  deleteInboxByName,
  getInboxByName,
} from "../services/inboxService";
import { adminAuthMiddleware } from "../middleware/adminAuth";
import { assertRateLimit, clientIp } from "../services/rateLimitService";
import { Errors } from "../utils/errors";

/**
 * Legacy compatibility routes — admin auth required; no inbox tokens.
 */
export const legacyRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

legacyRoutes.use("/email", adminAuthMiddleware);
legacyRoutes.use("/email/*", adminAuthMiddleware);

legacyRoutes.post("/email", async (c) => {
  await assertRateLimit(c.env, "create_inbox", clientIp(c.req.raw));
  const config = c.get("config");
  let body: { name?: string; domain?: string } = {};
  try {
    const raw = await c.req.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      body = raw as { name?: string; domain?: string };
    }
  } catch {
    body = {};
  }

  const result = await createInbox(c.env, config, {
    name: typeof body.name === "string" ? body.name : undefined,
    domain: typeof body.domain === "string" ? body.domain : undefined,
  });

  return c.json(
    {
      success: true,
      email: result.email,
      expires_at: result.expires_at,
    },
    201,
  );
});

legacyRoutes.get("/email/check", async (c) => {
  await assertRateLimit(c.env, "read_inbox", clientIp(c.req.raw));
  const config = c.get("config");
  const name = c.req.query("name") ?? "";
  if (!name) throw Errors.invalidName();
  const result = await checkNameAvailable(c.env, config, name, c.req.query("domain") ?? undefined);
  return c.json({ available: result.available, name: result.name });
});

legacyRoutes.get("/email/:name", async (c) => {
  await assertRateLimit(c.env, "read_inbox", clientIp(c.req.raw));
  const config = c.get("config");
  const name = c.req.param("name");
  const { inbox, messages } = await getInboxByName(c.env, config, name);
  return c.json({
    success: true,
    email: inbox.email,
    messages,
    expires_at: inbox.expires_at,
  });
});

legacyRoutes.delete("/email/:name", async (c) => {
  await assertRateLimit(c.env, "create_inbox", clientIp(c.req.raw));
  const config = c.get("config");
  await deleteInboxByName(c.env, config, c.req.param("name"));
  return c.json({ success: true, deleted: true });
});
