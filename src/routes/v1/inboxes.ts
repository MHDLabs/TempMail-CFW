import { Hono } from "hono";
import type { AppVariables, Env } from "../../types/env";
import {
  checkNameAvailable,
  createInbox,
  deleteInboxByIdService,
  extractBearer,
  getInboxById,
  getInboxByName,
} from "../../services/inboxService";
import { Errors } from "../../utils/errors";

export const v1InboxRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

v1InboxRoutes.post("/inboxes", async (c) => {
  const config = c.get("config");
  let body: { name?: string; domain?: string } = {};
  try {
    body = (await c.req.json()) as { name?: string; domain?: string };
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
      id: result.id,
      email: result.email,
      token: result.token,
      expires_at: result.expires_at,
    },
    201,
  );
});

v1InboxRoutes.get("/inboxes/check", async (c) => {
  const config = c.get("config");
  const name = c.req.query("name") ?? "";
  const domain = c.req.query("domain") ?? undefined;
  if (!name) throw Errors.invalidName();
  const result = await checkNameAvailable(c.env, config, name, domain);
  return c.json({
    available: result.available,
    name: result.name,
    domain: result.domain,
  });
});

v1InboxRoutes.get("/inboxes/:id", async (c) => {
  const id = c.req.param("id");
  const token = extractBearer(c.req.header("Authorization"));
  // Support both UUID id and legacy local-part lookup for convenience
  const config = c.get("config");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  if (isUuid) {
    const inbox = await getInboxById(c.env, id, token);
    return c.json({ success: true, inbox });
  }

  const { inbox } = await getInboxByName(c.env, config, id, token);
  return c.json({ success: true, inbox });
});

v1InboxRoutes.get("/inboxes/:id/messages", async (c) => {
  const id = c.req.param("id");
  const token = extractBearer(c.req.header("Authorization"));
  const config = c.get("config");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // For Phase 4, resolve via local-part on default domain when not UUID
  if (!isUuid) {
    const { inbox, messages } = await getInboxByName(c.env, config, id, token);
    return c.json({
      success: true,
      inbox_id: inbox.id,
      email: inbox.email,
      messages,
      expires_at: inbox.expires_at,
      next_cursor: null,
    });
  }

  const inbox = await getInboxById(c.env, id, token);
  // Messages by UUID path — reuse name path via address local part
  const localPart = inbox.email.split("@")[0] ?? "";
  const { messages } = await getInboxByName(c.env, config, localPart, token);
  return c.json({
    success: true,
    inbox_id: inbox.id,
    email: inbox.email,
    messages,
    expires_at: inbox.expires_at,
    next_cursor: null,
  });
});

v1InboxRoutes.delete("/inboxes/:id", async (c) => {
  const id = c.req.param("id");
  const token = extractBearer(c.req.header("Authorization"));
  const config = c.get("config");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  if (isUuid) {
    await deleteInboxByIdService(c.env, id, token);
  } else {
    await deleteInboxByName(c.env, config, id, token);
  }
  return c.json({ success: true, deleted: true });
});
