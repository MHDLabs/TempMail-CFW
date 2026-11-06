# Changelog

## 0.1.0 — rebuild (feat/tempmail-cfw-rebuild)

### Added
- Modular TypeScript + Hono Worker architecture
- D1 schema for domains, inboxes, messages, attachments, sessions
- R2 storage for HTML, raw MIME, and attachments
- Legacy API compatibility (`/email`, `/health`, `/auth`)
- Versioned API under `/api/v1`
- Email ingestion via Cloudflare Email Routing + PostalMime
- Admin sessions (`__Host-session`), rate limits, scheduled cleanup
- Liquid Glass web panel (React + Vite + Tailwind)
- Deterministic OTP extraction on messages
- Optional signed webhooks (`WEBHOOK_URL`, `WEBHOOK_SECRET`)

### Security
- Inbox tokens stored hashed; constant-time compare
- Admin password verified with PBKDF2 stretch
- HTML sanitization; attachment downloads authenticated
- CSRF header required for cookie-authenticated admin mutations
