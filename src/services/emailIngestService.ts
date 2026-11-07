import { loadConfig } from "../config";
import { parseMime, readStreamBounded } from "../email/parse";
import { sanitizeHtml } from "../email/sanitizeHtml";
import {
  findMessageByMessageId,
  insertAttachmentMeta,
  insertMessage,
  releaseMessageSlot,
  tryReserveMessageSlot,
} from "../repositories/messageRepo";
import { findInboxByAddress } from "../repositories/inboxRepo";
import type { Env } from "../types/env";
import { log } from "../utils/log";
import { extractOtp } from "./otpExtractService";
import { dispatchMessageWebhook } from "./webhookService";

function isExpired(expiresAtIso: string): boolean {
  return Date.parse(expiresAtIso) <= Date.now();
}

function parseRecipientLocal(to: string): { local: string; domain: string } | null {
  const cleaned = to.trim().toLowerCase();
  const m = cleaned.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  return { local: m[1]!, domain: m[2]! };
}

function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /unique constraint|SQLITE_CONSTRAINT|constraint failed/i.test(msg);
}

/**
 * Ingest a Cloudflare Email Routing message into D1 only.
 * Raw MIME is parsed then discarded. Attachment bytes are not stored.
 */
export async function ingestEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<{ status: "stored" | "duplicate" | "rejected" | "failed"; reason?: string }> {
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

  let raw: ArrayBuffer;
  try {
    raw = await readStreamBounded(message.raw, config.maxMessageSizeBytes);
  } catch {
    message.setReject("Message too large");
    return { status: "rejected", reason: "too_large" };
  }

  let parsed;
  try {
    // maxAttachmentSizeBytes still used to bound parser memory while discarding bytes
    parsed = await parseMime(raw, {
      maxAttachmentSizeBytes: Math.min(config.maxMessageSizeBytes, 512_000),
    });
  } catch (err) {
    log("error", "MIME parse failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    message.setReject("Unable to parse message");
    return { status: "rejected", reason: "parse_error" };
  }

  // Drop raw buffer reference ASAP
  raw = new ArrayBuffer(0);

  if (parsed.messageId) {
    const dup = await findMessageByMessageId(env, inbox.id, parsed.messageId);
    if (dup) {
      log("info", "duplicate message skipped", { inboxId: inbox.id });
      return { status: "duplicate" };
    }
  }

  const now = new Date().toISOString();
  const reserved = await tryReserveMessageSlot(
    env,
    inbox.id,
    config.maxMessagesPerInbox,
    now,
  );
  if (!reserved) {
    message.setReject("Mailbox full");
    return { status: "rejected", reason: "mailbox_full" };
  }

  const messageId = crypto.randomUUID();
  const textBody = (parsed.text || "").slice(0, config.maxBodyChars);
  const htmlBody = parsed.html
    ? sanitizeHtml(parsed.html, config.maxBodyChars)
    : null;
  const otp = extractOtp({ subject: parsed.subject, text: textBody });

  try {
    await insertMessage(env, {
      id: messageId,
      inbox_id: inbox.id,
      message_id: parsed.messageId,
      from_addr: parsed.from || message.from || null,
      to_addr: address,
      subject: (parsed.subject || "").slice(0, 998),
      date: parsed.date,
      text_body: textBody,
      html_body: htmlBody,
      otp_code: otp?.code ?? null,
      otp_kind: otp?.kind ?? null,
      otp_source: otp?.source ?? null,
      size_bytes: message.rawSize,
      created_at: now,
    });
  } catch (err) {
    await releaseMessageSlot(env, inbox.id).catch(() => undefined);
    if (isUniqueConstraintError(err)) {
      log("info", "duplicate on insert", { inboxId: inbox.id });
      return { status: "duplicate" };
    }
    log("error", "message insert failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    // Do not acknowledge successful processing
    message.setReject("Temporary failure");
    return { status: "failed", reason: "persist_error" };
  }

  for (const att of parsed.attachments.slice(0, 20)) {
    try {
      await insertAttachmentMeta(env, {
        id: crypto.randomUUID(),
        message_id: messageId,
        filename: (att.filename || "attachment").slice(0, 255),
        content_type: (att.contentType || "application/octet-stream").slice(0, 127),
        size_bytes: att.size,
        content_disposition: null,
        content_id: null,
        is_inline: 0,
        created_at: now,
      });
    } catch (err) {
      log("warn", "attachment meta insert failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  log("info", "email stored", {
    inboxId: inbox.id,
    messageId,
    attachmentMeta: Math.min(parsed.attachments.length, 20),
    hasOtp: Boolean(otp),
  });

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
