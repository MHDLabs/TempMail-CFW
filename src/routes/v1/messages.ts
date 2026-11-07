import { Hono } from "hono";
import type { AppVariables, Env } from "../../types/env";
import { findMessageById, listAttachmentsForMessage } from "../../repositories/messageRepo";
import { findInboxById } from "../../repositories/inboxRepo";
import { adminAuthMiddleware } from "../../middleware/adminAuth";
import { assertRateLimit, clientIp } from "../../services/rateLimitService";
import { Errors } from "../../utils/errors";

export const v1MessageRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

v1MessageRoutes.use("/messages", adminAuthMiddleware);
v1MessageRoutes.use("/messages/*", adminAuthMiddleware);

v1MessageRoutes.get("/messages/:id", async (c) => {
  await assertRateLimit(c.env, "read_inbox", clientIp(c.req.raw));
  const id = c.req.param("id");
  const msg = await findMessageById(c.env, id);
  if (!msg) throw Errors.notFound("Message not found");
  const inbox = await findInboxById(c.env, msg.inbox_id);
  if (!inbox) throw Errors.notFound("Inbox not found");
  const attachments = await listAttachmentsForMessage(c.env, msg.id);
  return c.json({
    success: true,
    message: {
      id: msg.id,
      inbox_id: msg.inbox_id,
      email: inbox.address,
      from: msg.from_addr ?? "",
      to: msg.to_addr ?? inbox.address,
      subject: msg.subject ?? "",
      date: msg.date ?? msg.created_at,
      text: msg.text_body ?? "",
      html: msg.html_body ?? "",
      size_bytes: msg.size_bytes ?? 0,
      otp: msg.otp_code
        ? { code: msg.otp_code, kind: msg.otp_kind, source: msg.otp_source }
        : null,
      attachments: attachments.map((a) => ({
        id: a.id,
        filename: a.filename ?? "attachment",
        content_type: a.content_type ?? "application/octet-stream",
        size_bytes: a.size_bytes,
        downloadable: false,
      })),
    },
  });
});

v1MessageRoutes.get("/messages/:id/attachments/:attachmentId", async (c) => {
  throw Errors.notFound("Attachment content is not stored");
});
