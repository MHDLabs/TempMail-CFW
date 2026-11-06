import { Hono } from "hono";
import type { AppVariables, Env } from "../../types/env";
import { findInboxById } from "../../repositories/inboxRepo";
import { findAttachment, findMessageById, listAttachmentsForMessage } from "../../repositories/messageRepo";
import { extractBearer, verifyInboxAccess } from "../../services/inboxService";
import { getR2 } from "../../storage/r2";
import { Errors } from "../../utils/errors";
import { extractOtp } from "../../services/otpExtractService";

function isExpired(expiresAtIso: string): boolean {
  return Date.parse(expiresAtIso) <= Date.now();
}

export const v1MessageRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function authorizeMessage(
  env: Env,
  messageId: string,
  authHeader: string | undefined,
) {
  const token = extractBearer(authHeader);
  const msg = await findMessageById(env, messageId);
  if (!msg) throw Errors.notFound("Message not found");
  const inbox = await findInboxById(env, msg.inbox_id);
  if (!inbox || isExpired(inbox.expires_at)) throw Errors.inboxNotFound();
  await verifyInboxAccess(env, inbox, token);
  return { msg, inbox };
}

v1MessageRoutes.get("/messages/:id", async (c) => {
  const { msg, inbox } = await authorizeMessage(c.env, c.req.param("id"), c.req.header("Authorization"));
  let html = "";
  if (msg.html_r2_key && c.env.R2) {
    try {
      const obj = await c.env.R2.get(msg.html_r2_key);
      if (obj) html = await obj.text();
    } catch {
      html = "";
    }
  }
  const attachments = await listAttachmentsForMessage(c.env, msg.id);
  const otp = extractOtp({ subject: msg.subject, text: msg.text_body });
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
      html,
      size_bytes: msg.size_bytes ?? 0,
      otp: otp ? { code: otp.code, kind: otp.kind, source: otp.source } : null,
      attachments: attachments.map((a) => ({
        id: a.id,
        filename: a.filename ?? "attachment",
        content_type: a.content_type ?? "application/octet-stream",
        size_bytes: a.size_bytes,
      })),
    },
  });
});

v1MessageRoutes.get("/messages/:id/attachments/:attachmentId", async (c) => {
  const messageId = c.req.param("id");
  const attachmentId = c.req.param("attachmentId");
  await authorizeMessage(c.env, messageId, c.req.header("Authorization"));
  const att = await findAttachment(c.env, messageId, attachmentId);
  if (!att) throw Errors.notFound("Attachment not found");
  const r2 = getR2(c.env);
  const obj = await r2.get(att.r2_key);
  if (!obj) throw Errors.notFound("Attachment object missing");
  const filename = (att.filename || "attachment").replace(/[^\w.\-()+ ]/g, "_");
  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": att.content_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Request-Id": c.get("requestId"),
    },
  });
});
