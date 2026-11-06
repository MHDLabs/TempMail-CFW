import { loadConfig } from "../config";
import { parseMime, readStreamBounded } from "../email/parse";
import { sanitizeHtml } from "../email/sanitizeHtml";
import {
  countMessages,
  findMessageByMessageId,
  incrementMessageCount,
  insertAttachment,
  insertMessage,
} from "../repositories/messageRepo";
import { findInboxByAddress } from "../repositories/inboxRepo";
import { getR2 } from "../storage/r2";
import type { Env } from "../types/env";
import { extractOtp } from "./otpExtractService";
import { dispatchMessageWebhook } from "./webhookService";
import { log } from "../utils/log";

function isExpired(expiresAtIso: string): boolean {
  return Date.parse(expiresAtIso) <= Date.now();
}

function parseRecipientLocal(to: string): { local: string; domain: string } | null {
  // Cloudflare passes the envelope recipient; may be bare email
  const cleaned = to.trim().toLowerCase();
  const m = cleaned.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  return { local: m[1]!, domain: m[2]! };
}

/**
 * Ingest a Cloudflare Email Routing message into D1 + R2.
 * Rejects unknown/expired inboxes; skips duplicates by Message-ID.
 */
export async function ingestEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<{ status: "stored" | "duplicate" | "rejected"; reason?: string }> {
  const config = loadConfig(env);

  if (message.rawSize > config.maxMessageSizeBytes) {
    message.setReject("Message too large");
    return { status: "rejected", reason: "too_large" };
  }

  const recipient = parseRecipientLocal(message.to);
  if (!recipient) {
    message.setReject("Invalid recipient");
    return { status: "rejected", reason: "invalid_recipient" };
  }

  if (!config.domains.includes(recipient.domain)) {
    message.setReject("Unknown domain");
    return { status: "rejected", reason: "unknown_domain" };
  }

  const address = `${recipient.local}@${recipient.domain}`;
  const inbox = await findInboxByAddress(env, address);
  if (!inbox || isExpired(inbox.expires_at)) {
    message.setReject("Mailbox does not exist");
    return { status: "rejected", reason: "inbox_not_found" };
  }

  const count = await countMessages(env, inbox.id);
  if (count >= config.maxMessagesPerInbox) {
    message.setReject("Mailbox full");
    return { status: "rejected", reason: "mailbox_full" };
  }

  let raw: ArrayBuffer;
  try {
    raw = await readStreamBounded(message.raw, config.maxMessageSizeBytes);
  } catch {
    message.setReject("Message too large");
    return { status: "rejected", reason: "too_large" };
  }

  let parsed;
  try {
    parsed = await parseMime(raw, {
      maxAttachmentSizeBytes: config.maxAttachmentSizeBytes,
    });
  } catch (err) {
    log("error", "MIME parse failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    message.setReject("Unable to parse message");
    return { status: "rejected", reason: "parse_error" };
  }

  if (parsed.messageId) {
    const dup = await findMessageByMessageId(env, inbox.id, parsed.messageId);
    if (dup) {
      log("info", "duplicate message skipped", { inboxId: inbox.id });
      return { status: "duplicate" };
    }
  }

  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();
  const r2 = getR2(env);

  let htmlKey: string | null = null;
  const safeHtml = sanitizeHtml(parsed.html);
  if (safeHtml && safeHtml.length > 0) {
    // Store HTML in R2 when large; small bodies can stay only in R2 for consistency
    htmlKey = `html/${inbox.id}/${messageId}`;
    await r2.put(htmlKey, safeHtml, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
  }

  // Optional raw archive for debugging/forensics (bounded size already)
  const rawKey = `raw/${inbox.id}/${messageId}`;
  try {
    await r2.put(rawKey, raw, {
      httpMetadata: { contentType: "message/rfc822" },
    });
  } catch (err) {
    log("warn", "raw R2 put failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  // Cap text body stored in D1
  const textBody =
    parsed.text.length > 100_000 ? parsed.text.slice(0, 100_000) : parsed.text || null;

  try {
    await insertMessage(env, {
      id: messageId,
      inbox_id: inbox.id,
      message_id_header: parsed.messageId,
      from_addr: parsed.from || message.from || "",
      to_addr: parsed.to || address,
      subject: parsed.subject,
      date: parsed.date,
      text_body: textBody,
      html_r2_key: htmlKey,
      raw_r2_key: rawKey,
      size_bytes: parsed.sizeBytes,
      created_at: now,
    });
  } catch (err) {
    // Unique constraint on message_id → treat as duplicate
    log("warn", "message insert failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return { status: "duplicate" };
  }

  for (const att of parsed.attachments) {
    const attId = crypto.randomUUID();
    const key = `att/${inbox.id}/${messageId}/${attId}`;
    try {
      await r2.put(key, att.content, {
        httpMetadata: { contentType: att.contentType },
        customMetadata: { filename: att.filename.slice(0, 200) },
      });
      await insertAttachment(env, {
        id: attId,
        message_id: messageId,
        filename: att.filename.slice(0, 255),
        content_type: att.contentType.slice(0, 127),
        size_bytes: att.size,
        r2_key: key,
        created_at: now,
      });
    } catch (err) {
      log("warn", "attachment store failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  await incrementMessageCount(env, inbox.id);

  const otp = extractOtp({ subject: parsed.subject, text: parsed.text });

  log("info", "email stored", {
    inboxId: inbox.id,
    messageId,
    attachments: parsed.attachments.length,
    hasOtp: Boolean(otp),
  });

  // Fire-and-forget webhook (errors swallowed inside)
  await dispatchMessageWebhook(env, {
    event: "message.received",
    inbox: address,
    message_id: messageId,
    from: parsed.from || message.from || "",
    subject: parsed.subject,
    date: parsed.date,
    otp: otp ? { code: otp.code, kind: otp.kind } : null,
    received_at: now,
  });

  return { status: "stored" };
}
