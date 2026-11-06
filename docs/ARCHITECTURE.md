# ARCHITECTURE.md — TempMail-CFW

## Goals

- Modular, maintainable, Cloudflare-native temporary email service
- Preserve legacy public API behaviour
- Safe email ingestion, storage, and cleanup
- Clear security boundaries between public API, inbox access, and admin
- Remain appropriately lightweight (no Durable Objects / Queues / AI unless later justified)

## High-level system

```
                    ┌─────────────────────────────┐
                    │   Cloudflare Email Routing  │
                    └──────────────┬──────────────┘
                                   │ raw MIME stream
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker (Hono)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Legacy API  │  │  /api/v1/*   │  │  Admin / Web Panel      │  │
│  │ /email/*    │  │  REST        │  │  (React SPA + sessions) │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬────────────┘  │
│         │                │                       │               │
│         └────────────────┼───────────────────────┘               │
│                          ▼                                       │
│              Services / Repositories / Middleware                │
│                          │                                       │
│         ┌────────────────┼────────────────┐                      │
│         ▼                ▼                ▼                      │
│        D1               R2               KV                      │
└──────────────────────────────────────────────────────────────────┘
```

## Technology choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Cloudflare Workers | Required platform |
| Language | TypeScript (strict) | Safety + maintainability |
| HTTP framework | Hono | Lightweight, Workers-native, good middleware |
| Primary DB | Cloudflare D1 | Relational metadata, constraints, indexes |
| Object storage | Cloudflare R2 | Attachments + optional large/raw bodies |
| Ephemeral / rate data | Cloudflare KV | Sessions, rate limits, short-lived state |
| MIME parser | PostalMime | Maintained, handles real-world MIME better than hand-rolled parser |
| Frontend | React + TypeScript + Vite + Tailwind | Standard, controllable design system |
| Tests | Vitest + Workers test env + Playwright (UI) | Meaningful coverage without heavy tooling |

**Not introduced in core architecture (unless later justified):** Durable Objects, Queues, Vectorize, AI Gateway, ORM, heavy UI kits.

## Modular backend layout (target)

```
src/
  index.ts                 # Worker entry (fetch + email)
  app.ts                   # Hono app composition
  config.ts                # Env validation & typed bindings
  routes/
    legacy.ts              # /health, /email/*, /auth/*
    v1/
      inboxes.ts
      messages.ts
      attachments.ts
      admin.ts
    web.ts                 # SPA serving / login / app shell
  middleware/
    requestId.ts
    errorHandler.ts
    authInbox.ts           # Bearer token for inbox
    authAdmin.ts           # Session for admin
    rateLimit.ts
    cors.ts
  services/
    inboxService.ts
    messageService.ts
    attachmentService.ts
    emailIngestService.ts
    authService.ts
    cleanupService.ts
    otpExtractService.ts   # deterministic (phase 8)
  repositories/
    inboxRepo.ts
    messageRepo.ts
    attachmentRepo.ts
    sessionRepo.ts
  storage/
    d1.ts
    r2.ts
    kv.ts
  email/
    parse.ts               # PostalMime wrapper + bounds
    sanitizeHtml.ts
  security/
    tokens.ts
    passwords.ts
    crypto.ts
  utils/
    ...
  types/
    ...
```

Frontend (separate package or `web/`):

```
web/
  src/
    main.tsx
    App.tsx
    routes/
    components/
    lib/api.ts
    styles/
    theme/
```

## Cloudflare bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 | Inboxes, messages metadata, attachments metadata, sessions, domains, webhooks (later) |
| `R2` | R2 bucket | Attachment objects, optional raw MIME / large bodies |
| `KV` | KV namespace | Rate-limit counters, optional short-lived cache, login failure tracking |
| `DOMAIN` or `EMAIL_DOMAINS` | env / var | Configured receiving domain(s) |
| `PANEL_PASSWORD` | Secret | Admin password (hashed comparison; never logged) |
| `SESSION_SECRET` (optional) | Secret | Extra session material if needed |

Environment variables are validated at startup (`config.ts`). Missing required bindings → clear 503 / structured error.

## Storage responsibilities

### D1 (source of truth for structure)

- Inbox records (name, domain, token_hash, expires_at, created_at, message_count, …)
- Message metadata (id, inbox_id, from, to, subject, date, has_html, size, message_id header, …)
- Message body references or small text bodies (policy: small text in D1; large/html/raw in R2 when needed)
- Attachment metadata (id, message_id, filename, content_type, size, r2_key, …)
- Admin sessions (id/hash, expires_at)
- Domain configuration (if multi-domain)
- Retention / cleanup bookkeeping
- Future: API keys, webhook subscriptions

Use proper unique constraints, foreign keys (where D1 supports), and indexes for lookup paths.

### R2

- Attachment binaries (`att/{inboxId}/{messageId}/{attachmentId}`)
- Optional raw MIME (`raw/{inboxId}/{messageId}`)
- Optional large HTML/text bodies

Objects are **never** public. Downloads go through authenticated Worker handlers.

### KV

- Login failure counters (`login-fail:{ip}`)
- Rate-limit windows where eventual consistency is acceptable
- Optional short-lived session material if not stored only in D1

KV is **not** the primary email database.

## Inbox lifecycle

1. **Create** — validate name (or generate random), check uniqueness (D1 unique constraint + careful insert), generate token, store **hash only**, set `expires_at`.
2. **Receive** — Email Routing → Worker `email` handler → validate recipient → load inbox → parse with bounds → store message + attachments → update counts.
3. **Read** — Bearer token → constant-time hash compare → return messages (paginated in v1).
4. **Delete** — authenticated → delete messages, R2 objects, inbox row.
5. **Expire** — scheduled cleanup finds `expires_at < now`, deletes related rows and R2 objects idempotently.

Concurrent creation of the same custom name is handled by unique constraint + conflict response (no silent overwrite).

## Email ingestion pipeline

```
Email Routing
    → size / recipient validation
    → load inbox (must exist & not expired)
    → duplicate detection (Message-ID + inbox)
    → bounded stream read
    → PostalMime parse
    → extract text / html / attachments
    → store metadata (D1)
    → store attachments / optional raw (R2)
    → update inbox message list / counts
    → (optional) webhook / OTP extract later
```

Failures are logged structurally; partial writes are designed to be recoverable by later cleanup (orphaned R2 keys, incomplete rows).

## Attachment lifecycle

- Extracted during parse with size quotas (per file + per inbox).
- Safe random object key; original filename stored as metadata only.
- Download requires same inbox auth (or admin session).
- On message/inbox delete or expiration → delete R2 objects.

## Authentication boundaries

| Surface | Mechanism |
|---------|-----------|
| Public legacy + v1 inbox routes | `Authorization: Bearer <inbox-token>` (hash stored) |
| Admin panel & admin API | Server-side session (HttpOnly, Secure, SameSite), password via Secret |
| Attachment download | Same as owning inbox or admin |
| Health | Public |

Inbox tokens are never placed in URLs or logs.  
Admin password is never stored in code; comparison uses a proper slow hash approach appropriate for the runtime (not fast unsalted SHA-256 for passwords).

## API layering

- **Legacy routes** (`/health`, `/email`, `/email/check`, `/email/:name`, `/auth/*`) remain as a thin compatibility layer that calls the same services as v1.
- **Versioned API** under `/api/v1/...` is the clean, documented surface.
- Business logic lives in services; routes do not duplicate logic.

## Cleanup strategy

- Cloudflare Cron Trigger (or scheduled Worker) runs a **bounded, idempotent** cleanup job.
- Selects expired inboxes in batches.
- Deletes messages → attachment metadata → R2 objects → inbox.
- Retries safely; partial progress is OK.
- Separate sweep for orphaned R2 keys if needed.

## Rate limiting & abuse

- Login: IP-based counters in KV (as today, refined).
- Inbox creation / read: configurable limits per IP / token where useful.
- Message size and attachment quotas enforced at ingest.
- Reject invalid recipients early.

## Observability

- Request ID on every response.
- Structured logs without message bodies or secrets.
- Health endpoint reports readiness of bindings.

## Non-goals of this architecture

- Multi-tenant organizations
- Outbound SMTP
- Mandatory AI
- Public R2 or permanent public attachment URLs
- Re-monolithing into a single 2k-line file

## Evolution

Phase 8 may add deterministic OTP extraction, signed webhooks, and optional MCP — all behind the same auth and retention rules. Those features must not break the core storage or API contracts defined here.
