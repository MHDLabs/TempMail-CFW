# DATA-RETENTION.md — TempMail-CFW

## Purpose

Temporary email is temporary.  
Default behaviour prefers short retention, automatic deletion, and minimal leftover data.

## Default policy

| Item | Default |
|------|---------|
| Inbox lifetime | 1 hour (configurable) |
| Messages | Live only while inbox lives |
| Attachments | Same lifetime as owning message/inbox |
| Admin sessions | 12 hours (configurable) |
| Login failure counters | Short window (minutes) |
| Logs | No full bodies; operational metadata only |

Exact numbers remain configurable via environment / config, matching or improving on the current Worker defaults.

## What is deleted on inbox expiry or explicit delete

1. Inbox row (D1)
2. All message rows for that inbox (D1)
3. All attachment metadata rows (D1)
4. All related R2 objects (attachments, optional raw bodies)
5. Any derived temporary KV keys for that inbox

## Cleanup implementation principles

- **Scheduled** via Cloudflare Cron Trigger (or equivalent scheduled Worker entry)
- **Bounded** batches (no unbounded full-table scans in one invocation)
- **Idempotent** — running twice must not error or leave inconsistent state
- **Recoverable** — if R2 delete fails after D1 delete (or vice versa), a later run can finish the work (e.g. via tombstones, orphan sweep, or ordered delete with retries)
- D1 and R2 are **not** one atomic transaction; design for partial failure

## Recommended delete order (per inbox)

1. List attachment R2 keys for the inbox
2. Delete R2 objects
3. Delete attachment metadata rows
4. Delete message rows
5. Delete inbox row

Or the reverse with careful orphan handling — document the chosen order in code comments and tests.

## Orphan handling

- Periodic sweep for R2 keys without matching D1 metadata (optional but recommended)
- Periodic sweep for D1 attachment rows whose R2 object is missing (mark or remove)

## User / admin expectations

- Creating an inbox shows `expires_at`
- UI shows countdown
- After expiry, API returns not-found; data is gone or being removed
- Admin may trigger or inspect cleanup status (phase 6+)

## Legal / privacy note

This product is intended for disposable, non-sensitive communication.  
Operators should set retention according to their own threat model and local requirements.  
Do not use TempMail-CFW as long-term archival storage.

## Configuration surface (target)

- `INBOX_TTL_SECONDS`
- `SESSION_TTL_SECONDS`
- `CLEANUP_BATCH_SIZE`
- Optional longer retention flags only if explicitly enabled by operator

All defaults stay short unless the operator deliberately lengthens them.
