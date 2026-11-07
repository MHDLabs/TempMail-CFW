import { getDb } from "../storage/d1";
import type { Env } from "../types/env";

export type MessageRow = {
  id: string;
  inbox_id: string;
  message_id: string | null;
  from_addr: string | null;
  to_addr: string | null;
  subject: string | null;
  date: string | null;
  text_body: string | null;
  html_body: string | null;
  otp_code: string | null;
  otp_kind: string | null;
  otp_source: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type AttachmentMetaRow = {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  content_disposition: string | null;
  content_id: string | null;
  is_inline: number;
  created_at: string;
};

export async function findMessageByMessageId(
  env: Env,
  inboxId: string,
  messageId: string,
): Promise<{ id: string } | null> {
  const db = getDb(env);
  return db
    .prepare(`SELECT id FROM messages WHERE inbox_id = ? AND message_id = ?`)
    .bind(inboxId, messageId)
    .first<{ id: string }>();
}

export async function countMessages(env: Env, inboxId: string): Promise<number> {
  const db = getDb(env);
  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM messages WHERE inbox_id = ?`)
    .bind(inboxId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/**
 * Atomically reserve one message slot. Returns false if quota full or inbox missing/expired.
 */
export async function tryReserveMessageSlot(
  env: Env,
  inboxId: string,
  maxMessages: number,
  nowIso: string,
): Promise<boolean> {
  const db = getDb(env);
  const result = await db
    .prepare(
      `UPDATE inboxes
       SET message_count = message_count + 1
       WHERE id = ? AND message_count < ? AND expires_at > ?`,
    )
    .bind(inboxId, maxMessages, nowIso)
    .run();
  const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  return changes > 0;
}

export async function releaseMessageSlot(env: Env, inboxId: string): Promise<void> {
  const db = getDb(env);
  await db
    .prepare(
      `UPDATE inboxes SET message_count = CASE WHEN message_count > 0 THEN message_count - 1 ELSE 0 END WHERE id = ?`,
    )
    .bind(inboxId)
    .run();
}

export async function insertMessage(env: Env, row: MessageRow): Promise<void> {
  const db = getDb(env);
  await db
    .prepare(
      `INSERT INTO messages
        (id, inbox_id, message_id, from_addr, to_addr, subject, date,
         text_body, html_body, otp_code, otp_kind, otp_source, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.inbox_id,
      row.message_id,
      row.from_addr,
      row.to_addr,
      row.subject,
      row.date,
      row.text_body,
      row.html_body,
      row.otp_code,
      row.otp_kind,
      row.otp_source,
      row.size_bytes,
      row.created_at,
    )
    .run();
}

export async function insertAttachmentMeta(env: Env, row: AttachmentMetaRow): Promise<void> {
  const db = getDb(env);
  await db
    .prepare(
      `INSERT INTO attachments
        (id, message_id, filename, content_type, size_bytes, r2_key,
         content_disposition, content_id, is_inline, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.message_id,
      row.filename,
      row.content_type,
      row.size_bytes,
      // legacy NOT NULL column from 0001 — placeholder unique key, not an object store path
      `meta:${row.id}`,
      row.content_disposition,
      row.content_id,
      row.is_inline,
      row.created_at,
    )
    .run();
}

export async function listAttachmentsForMessage(
  env: Env,
  messageId: string,
): Promise<AttachmentMetaRow[]> {
  const db = getDb(env);
  const result = await db
    .prepare(
      `SELECT id, message_id, filename, content_type, size_bytes,
              content_disposition, content_id, is_inline, created_at
       FROM attachments WHERE message_id = ? ORDER BY created_at ASC`,
    )
    .bind(messageId)
    .all<AttachmentMetaRow>();
  return result.results ?? [];
}

export async function findMessageById(env: Env, id: string): Promise<MessageRow | null> {
  const db = getDb(env);
  return db
    .prepare(
      `SELECT id, inbox_id, message_id, from_addr, to_addr, subject, date,
              text_body, html_body, otp_code, otp_kind, otp_source, size_bytes, created_at
       FROM messages WHERE id = ?`,
    )
    .bind(id)
    .first<MessageRow>();
}

export type MessagePageCursor = { created_at: string; id: string };

export async function listMessagesPage(
  env: Env,
  inboxId: string,
  opts: { limit: number; cursor?: MessagePageCursor | null },
): Promise<{ rows: MessageRow[]; nextCursor: MessagePageCursor | null }> {
  const db = getDb(env);
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  let result;
  if (opts.cursor) {
    result = await db
      .prepare(
        `SELECT id, inbox_id, message_id, from_addr, to_addr, subject, date,
                text_body, html_body, otp_code, otp_kind, otp_source, size_bytes, created_at
         FROM messages
         WHERE inbox_id = ?
           AND (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(inboxId, opts.cursor.created_at, opts.cursor.created_at, opts.cursor.id, limit + 1)
      .all<MessageRow>();
  } else {
    result = await db
      .prepare(
        `SELECT id, inbox_id, message_id, from_addr, to_addr, subject, date,
                text_body, html_body, otp_code, otp_kind, otp_source, size_bytes, created_at
         FROM messages
         WHERE inbox_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(inboxId, limit + 1)
      .all<MessageRow>();
  }
  const rows = result.results ?? [];
  let nextCursor: MessagePageCursor | null = null;
  if (rows.length > limit) {
    const last = rows[limit - 1]!;
    nextCursor = { created_at: last.created_at, id: last.id };
    rows.length = limit;
  }
  return { rows, nextCursor };
}
