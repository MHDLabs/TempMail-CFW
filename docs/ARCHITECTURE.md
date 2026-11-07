# Architecture — TempMail-CFW

## Runtime
- Cloudflare Worker (Hono, TypeScript)
- D1: metadata + normalized message bodies
- KV: rate limits and short-lived state
- Email Routing → Worker `email` handler

**No R2. No outbound SMTP.**

## Inbound flow
Email Routing → size checks → destination validation → MIME parse → HTML sanitize → OTP extract → atomic quota slot → D1 insert → optional HTTPS webhook → discard raw MIME

## APIs
- Legacy: `/email`, `/email/check`, `/email/:name`, …
- Versioned: `/api/v1/inboxes`, `/api/v1/messages/:id`, admin routes
- Cursor pagination on message lists (`limit`, `cursor`, `next_cursor`)

## Auth
- Inbox: Bearer token (hash at rest)
- Admin: HttpOnly session cookie + CSRF header on mutations

## Attachments
Only metadata is stored. Downloads are not supported.

## Frontend
React SPA under `web/`, served via Workers assets when configured.
