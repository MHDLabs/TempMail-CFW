import type { Env } from "../types/env";
import { getDb } from "../storage/d1";

export interface MessageInsert {
  id: string;
  inbox_id: string;
  message_id_header: string | null;
  from_addr: string;
  to_addr: string;
  subject: string;
  date: string | null;
  text_body: string | null;
  html_r2_key: string | null;
  raw_r2_key: string | null;
  size_bytes: number;
  created_at: string;
}

export interface AttachmentInsert {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  r2_key: string;
  created_at: string;
}

export async function findMessageByMessageId(
  env: Env,
  inboxId: string,
  messageIdHeader: string,
): Promise<{ id: string } | null> {
  const db = getDb(env);
  return (
    (await db
      .prepare(
        `SELECT id FROM messages WHERE inbox_id = ? AND message_id_header = ? LIMIT 1`,
      )
      .bind(inboxId, messageIdHeader)
      .first<{ id: string }>()) ?? null
  );
}

export async function countMessages(env: Env, inboxId: string): Promise<number> {
  const db = getDb(env);
  const row = await db
    .prepare(`SELECT COUNT(*) as c FROM messages WHERE inbox_id = ?`)
    .bind(inboxId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function insertMessage(env: Env, row: MessageInsert): Promise<void> {
  const db = getDb(env);
  await db
    .prepare(
      `INSERT INTO messages
        (id, inbox_id, message_id_header, from_addr, to_addr, subject, date,
         text_body, html_r2_key, raw_r2_key, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.inbox_id,
      row.message_id_header,
      row.from_addr,
      row.to_addr,
      row.subject,
      row.date,
      row.text_body,
      row.html_r2_key,
      row.raw_r2_key,
      row.size_bytes,
      row.created_at,
    )
    .run();
}

export async function insertAttachment(env: Env, row: AttachmentInsert): Promise<void> {
  const db = getDb(env);
  await db
    .prepare(
      `INSERT INTO attachments
        (id, message_id, filename, content_type, size_bytes, r2_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.message_id,
      row.filename,
      row.content_type,
      row.size_bytes,
      row.r2_key,
      row.created_at,
    )
    .run();
}

export async function incrementMessageCount(env: Env, inboxId: string): Promise<void> {
  const db = getDb(env);
  await db
    .prepare(`UPDATE inboxes SET message_count = message_count + 1 WHERE id = ?`)
    .bind(inboxId)
    .run();
}

export async function listAttachmentsForMessage(
  env: Env,
  messageId: string,
): Promise<
  Array<{
    id: string;
    filename: string | null;
    content_type: string | null;
    size_bytes: number;
    r2_key: string;
  }>
> {
  const db = getDb(env);
  const result = await db
    .prepare(
      `SELECT id, filename, content_type, size_bytes, r2_key
       FROM attachments WHERE message_id = ?`,
    )
    .bind(messageId)
    .all<{
      id: string;
      filename: string | null;
      content_type: string | null;
      size_bytes: number;
      r2_key: string;
    }>();
  return result.results ?? [];
}

export async function findAttachment(
  env: Env,
  messageId: string,
  attachmentId: string,
): Promise<{
  id: string;
  filename: string | null;
  content_type: string | null;
  size_bytes: number;
  r2_key: string;
  message_id: string;
} | null> {
  const db = getDb(env);
  return (
    (await db
      .prepare(
        `SELECT id, filename, content_type, size_bytes, r2_key, message_id
         FROM attachments WHERE id = ? AND message_id = ?`,
      )
      .bind(attachmentId, messageId)
      .first()) ?? null
  );
}

export async function findMessageById(
  env: Env,
  messageId: string,
): Promise<{
  id: string;
  inbox_id: string;
  from_addr: string | null;
  to_addr: string | null;
  subject: string | null;
  date: string | null;
  text_body: string | null;
  html_r2_key: string | null;
  size_bytes: number | null;
  created_at: string;
} | null> {
  const db = getDb(env);
  return (
    (await db
      .prepare(
        `SELECT id, inbox_id, from_addr, to_addr, subject, date, text_body,
                html_r2_key, size_bytes, created_at
         FROM messages WHERE id = ?`,
      )
      .bind(messageId)
      .first()) ?? null
  );
}
