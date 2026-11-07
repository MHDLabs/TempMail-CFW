import type { Env } from "../types/env";
import { getDb } from "../storage/d1";
import { log } from "../utils/log";

const DEFAULT_BATCH = 25;

/**
 * Idempotent cleanup of expired inboxes and related D1 rows only.
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

  const sess = await db
    .prepare(`DELETE FROM sessions WHERE expires_at < ?`)
    .bind(now)
    .run();
  const sessionsDeleted = (sess.meta as { changes?: number } | undefined)?.changes ?? 0;

  log("info", "cleanup complete", { inboxesDeleted, sessionsDeleted });
  return { inboxesDeleted, sessionsDeleted };
}

/** Full inbox purge (D1 only). */
export async function purgeInbox(env: Env, inboxId: string): Promise<void> {
  const db = getDb(env);
  await db
    .prepare(
      `DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE inbox_id = ?)`,
    )
    .bind(inboxId)
    .run();
  await db.prepare(`DELETE FROM messages WHERE inbox_id = ?`).bind(inboxId).run();
  const result = await db.prepare(`DELETE FROM inboxes WHERE id = ?`).bind(inboxId).run();
  const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  if (changes < 1) {
    throw new Error("inbox delete had no effect");
  }
}
