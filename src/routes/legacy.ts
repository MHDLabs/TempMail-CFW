import { Hono } from "hono";
import type { AppVariables, Env } from "../types/env";
import {
  checkNameAvailable,
  createInbox,
  deleteInboxByName,
  extractBearer,
  getInboxByName,
} from "../services/inboxService";
import { Errors } from "../utils/errors";
import { assertRateLimit, clientIp } from "../services/rateLimitService";

/**
 * Legacy compatibility routes — preserve existing public API contract.
 */
export const legacyRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

legacyRoutes.post("/email", async (c) => {
  await assertRateLimit(c.env, "create_inbox", clientIp(c.req.raw));
  const config = c.get("config");
  let body: { name?: string } = {};
  try {
    body = (await c.req.json()) as { name?: string };
  } catch {
    body = {};
  }
  if (body && typeof body !== "object") body = {};

  const result = await createInbox(c.env, config, {
    name: typeof body.name === "string" ? body.name : undefined,
  });

  return c.json(
    {
      success: true,
      email: result.email,
      token: result.token,
      expires_at: result.expires_at,
    },
    201,
  );
});

legacyRoutes.get("/email/check", async (c) => {
  const config = c.get("config");
  const name = c.req.query("name") ?? "";
  if (!name) throw Errors.invalidName();
  const result = await checkNameAvailable(c.env, config, name);
  return c.json({ available: result.available, name: result.name });
});

legacyRoutes.get("/email/:name", async (c) => {
  const config = c.get("config");
  const name = c.req.param("name");
  const token = extractBearer(c.req.header("Authorization"));
  const { inbox, messages } = await getInboxByName(c.env, config, name, token);
  return c.json({
    success: true,
    email: inbox.email,
    messages,
    expires_at: inbox.expires_at,
  });
});

legacyRoutes.delete("/email/:name", async (c) => {
  const config = c.get("config");
  const name = c.req.param("name");
  const token = extractBearer(c.req.header("Authorization"));
  await deleteInboxByName(c.env, config, name, token);
  return c.json({ success: true, deleted: true });
});
