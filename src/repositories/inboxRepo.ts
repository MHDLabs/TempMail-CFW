import type { Env } from "../types/env";
import type { DomainRow, InboxRow } from "../types/inbox";
import { getDb } from "../storage/d1";

export async function ensureDomain(env: Env, domainName: string): Promise<DomainRow> {
  const db = getDb(env);
  const existing = await db
    .prepare("SELECT id, name, created_at FROM domains WHERE name = ?")
    .bind(domainName)
    .first<DomainRow>();
  if (existing) return existing;

  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  try {
    await db
      .prepare("INSERT INTO domains (id, name, created_at) VALUES (?, ?, ?)")
      .bind(id, domainName, created_at)
      .run();
  } catch {
    // Race: another request inserted the same domain
    const again = await db
      .prepare("SELECT id, name, created_at FROM domains WHERE name = ?")
      .bind(domainName)
      .first<DomainRow>();
    if (again) return again;
    throw new Error("Failed to ensure domain");
  }
  return { id, name: domainName, created_at };
}

export async function findInboxByLocalPart(
  env: Env,
  domainId: string,
  localPart: string,
): Promise<InboxRow | null> {
  const db = getDb(env);
  return (
    (await db
      .prepare(
        `SELECT id, domain_id, local_part, address, token_hash, created_at, expires_at, message_count
         FROM inboxes WHERE domain_id = ? AND local_part = ?`,
      )
      .bind(domainId, localPart)
      .first<InboxRow>()) ?? null
  );
}

export async function findInboxByAddress(env: Env, address: string): Promise<InboxRow | null> {
  const db = getDb(env);
  return (
    (await db
      .prepare(
        `SELECT id, domain_id, local_part, address, token_hash, created_at, expires_at, message_count
         FROM inboxes WHERE address = ?`,
      )
      .bind(address)
      .first<InboxRow>()) ?? null
  );
}

export async function findInboxById(env: Env, id: string): Promise<InboxRow | null> {
  const db = getDb(env);
  return (
    (await db
      .prepare(
        `SELECT id, domain_id, local_part, address, token_hash, created_at, expires_at, message_count
         FROM inboxes WHERE id = ?`,
      )
      .bind(id)
      .first<InboxRow>()) ?? null
  );
}

export async function insertInbox(
  env: Env,
  row: Omit<InboxRow, "message_count"> & { message_count?: number },
): Promise<void> {
  const db = getDb(env);
  await db
    .prepare(
      `INSERT INTO inboxes
        (id, domain_id, local_part, address, token_hash, created_at, expires_at, message_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.domain_id,
      row.local_part,
      row.address,
      row.token_hash,
      row.created_at,
      row.expires_at,
      row.message_count ?? 0,
    )
    .run();
}

export async function deleteInboxById(env: Env, id: string): Promise<void> {
  const db = getDb(env);
  // messages/attachments cascade via FK when supported; also explicit for safety
  await db.prepare("DELETE FROM messages WHERE inbox_id = ?").bind(id).run();
  await db.prepare("DELETE FROM inboxes WHERE id = ?").bind(id).run();
}

export async function listMessagesForInbox(
  env: Env,
  inboxId: string,
): Promise<
  Array<{
    id: string;
    from_addr: string | null;
    to_addr: string | null;
    subject: string | null;
    date: string | null;
    text_body: string | null;
    html_body: string | null;
    otp_code: string | null;
    otp_kind: string | null;
    otp_source: string | null;
    created_at: string;
  }>
> {
  const db = getDb(env);
  const result = await db
    .prepare(
      `SELECT id, from_addr, to_addr, subject, date, text_body, html_body, otp_code, otp_kind, otp_source, created_at
       FROM messages WHERE inbox_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(inboxId)
    .all<{
      id: string;
      from_addr: string | null;
      to_addr: string | null;
      subject: string | null;
      date: string | null;
      text_body: string | null;
      html_body: string | null;
      otp_code: string | null;
      otp_kind: string | null;
      otp_source: string | null;
      created_at: string;
    }>();
  return result.results ?? [];
}
