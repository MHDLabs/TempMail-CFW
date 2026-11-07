import { Hono } from "hono";
import type { AppVariables, Env } from "../../types/env";
import {
  checkNameAvailable,
  createInbox,
  deleteInboxByIdService,
  deleteInboxByName,
  getInboxById,
  getInboxByName,
} from "../../services/inboxService";
import { findInboxById, findInboxByLocalPart, ensureDomain } from "../../repositories/inboxRepo";
import { listMessagesPage } from "../../repositories/messageRepo";
import { adminAuthMiddleware } from "../../middleware/adminAuth";
import { assertRateLimit, clientIp } from "../../services/rateLimitService";
import { Errors } from "../../utils/errors";

export const v1InboxRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

v1InboxRoutes.use("/inboxes", adminAuthMiddleware);
v1InboxRoutes.use("/inboxes/*", adminAuthMiddleware);

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function encodeCursor(c: { created_at: string; id: string }): string {
  const json = JSON.stringify(c);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(raw: string | undefined): { created_at: string; id: string } | null {
  if (!raw) return null;
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded + "=".repeat((4 - (padded.length % 4)) % 4);
    const obj = JSON.parse(atob(pad)) as { created_at?: string; id?: string };
    if (typeof obj.created_at === "string" && typeof obj.id === "string") {
      return { created_at: obj.created_at, id: obj.id };
    }
  } catch {
    /* invalid */
  }
  throw Errors.invalidRequest("Malformed cursor");
}

v1InboxRoutes.post("/inboxes", async (c) => {
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
      id: result.id,
      email: result.email,
      expires_at: result.expires_at,
    },
    201,
  );
});

v1InboxRoutes.get("/inboxes/check", async (c) => {
  await assertRateLimit(c.env, "read_inbox", clientIp(c.req.raw));
  const config = c.get("config");
  const name = c.req.query("name") ?? "";
  if (!name) throw Errors.invalidName();
  const result = await checkNameAvailable(
    c.env,
    config,
    name,
    c.req.query("domain") ?? undefined,
  );
  return c.json({
    available: result.available,
    name: result.name,
    domain: result.domain,
  });
});

v1InboxRoutes.get("/inboxes/:id", async (c) => {
  await assertRateLimit(c.env, "read_inbox", clientIp(c.req.raw));
  const id = c.req.param("id");
  const config = c.get("config");
  if (isUuid(id)) {
    const inbox = await getInboxById(c.env, id);
    return c.json({ success: true, inbox });
  }
  const { inbox } = await getInboxByName(c.env, config, id);
  return c.json({ success: true, inbox });
});

v1InboxRoutes.get("/inboxes/:id/messages", async (c) => {
  await assertRateLimit(c.env, "read_inbox", clientIp(c.req.raw));
  const id = c.req.param("id");
  const config = c.get("config");
  const limitRaw = Number.parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
  const cursor = decodeCursor(c.req.query("cursor") ?? undefined);

  let inboxRow;
  if (isUuid(id)) {
    inboxRow = await findInboxById(c.env, id);
  } else {
    const domain = await ensureDomain(c.env, config.defaultDomain);
    inboxRow = await findInboxByLocalPart(c.env, domain.id, id.toLowerCase());
  }
  if (!inboxRow) throw Errors.notFound("Inbox not found");

  const { rows, nextCursor } = await listMessagesPage(c.env, inboxRow.id, {
    limit,
    cursor,
  });

  return c.json({
    success: true,
    inbox_id: inboxRow.id,
    email: inboxRow.address,
    messages: rows.map((m) => ({
      id: m.id,
      from: m.from_addr ?? "",
      to: m.to_addr ?? inboxRow.address,
      subject: m.subject ?? "",
      date: m.date ?? m.created_at,
      text: m.text_body ?? "",
      html: m.html_body ?? "",
      otp: m.otp_code
        ? { code: m.otp_code, kind: m.otp_kind, source: m.otp_source }
        : null,
    })),
    expires_at: inboxRow.expires_at,
    next_cursor: nextCursor ? encodeCursor(nextCursor) : null,
  });
});

v1InboxRoutes.delete("/inboxes/:id", async (c) => {
  const id = c.req.param("id");
  const config = c.get("config");
  if (isUuid(id)) {
    await deleteInboxByIdService(c.env, id);
  } else {
    await deleteInboxByName(c.env, config, id);
  }
  return c.json({ success: true, deleted: true });
});
