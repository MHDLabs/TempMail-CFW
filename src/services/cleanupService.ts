import type { Env } from "../types/env";
import { getDb } from "../storage/d1";
import { getR2 } from "../storage/r2";
import { log } from "../utils/log";

const DEFAULT_BATCH = 25;

/**
 * Idempotent cleanup of expired inboxes and related storage.
 * Order: list R2 keys → delete R2 → delete messages/attachments → delete inbox.
 */
export async function runCleanup(
  env: Env,
  options: { batchSize?: number } = {},
): Promise<{ inboxesDeleted: number; sessionsDeleted: number }> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const db = getDb(env);
  const now = new Date().toISOString();

  const expired = await db
    .prepare(
      `SELECT id FROM inboxes WHERE expires_at < ? ORDER BY expires_at ASC LIMIT ?`,
    )
    .bind(now, batchSize)
    .all<{ id: string }>();

  const inboxIds = expired.results?.map((r) => r.id) ?? [];
  let inboxesDeleted = 0;

  for (const inboxId of inboxIds) {
    try {
      await purgeInbox(env, inboxId);
      inboxesDeleted += 1;
    } catch (err) {
      log("error", "cleanup inbox failed", {
        inboxId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // Expired sessions
  const sess = await db
    .prepare(`DELETE FROM sessions WHERE expires_at < ?`)
    .bind(now)
    .run();
  const sessionsDeleted = (sess.meta as { changes?: number } | undefined)?.changes ?? 0;

  log("info", "cleanup complete", { inboxesDeleted, sessionsDeleted });
  return { inboxesDeleted, sessionsDeleted };
}

/** Full inbox purge including R2 objects. Used by cleanup and explicit delete. */
export async function purgeInbox(env: Env, inboxId: string): Promise<void> {
  const db = getDb(env);
  let r2: R2Bucket | null = null;
  try {
    r2 = getR2(env);
  } catch {
    r2 = null;
  }

  // Collect attachment keys and message html/raw keys
  const messages = await db
    .prepare(`SELECT id, html_r2_key, raw_r2_key FROM messages WHERE inbox_id = ?`)
    .bind(inboxId)
    .all<{ id: string; html_r2_key: string | null; raw_r2_key: string | null }>();

  const keys: string[] = [];
  for (const m of messages.results ?? []) {
    if (m.html_r2_key) keys.push(m.html_r2_key);
    if (m.raw_r2_key) keys.push(m.raw_r2_key);
    const atts = await db
      .prepare(`SELECT r2_key FROM attachments WHERE message_id = ?`)
      .bind(m.id)
      .all<{ r2_key: string }>();
    for (const a of atts.results ?? []) {
      keys.push(a.r2_key);
    }
  }

  if (r2 && keys.length) {
    // R2 delete accepts array; chunk if needed
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100);
      try {
        await r2.delete(chunk);
      } catch (err) {
        log("warn", "R2 batch delete failed", {
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }

  // Also try prefix listing for orphan safety under att/{inboxId}/ and html/raw
  if (r2) {
    for (const prefix of [`att/${inboxId}/`, `html/${inboxId}/`, `raw/${inboxId}/`]) {
      try {
        const listed = await r2.list({ prefix, limit: 500 });
        const extra = listed.objects.map((o) => o.key);
        if (extra.length) await r2.delete(extra);
      } catch {
        /* best-effort */
      }
    }
  }

  await db
    .prepare(
      `DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE inbox_id = ?)`,
    )
    .bind(inboxId)
    .run();
  await db.prepare(`DELETE FROM messages WHERE inbox_id = ?`).bind(inboxId).run();
  await db.prepare(`DELETE FROM inboxes WHERE id = ?`).bind(inboxId).run();
}
