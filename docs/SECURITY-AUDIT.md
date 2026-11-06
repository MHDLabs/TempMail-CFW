# Security audit notes — Phase 9

Date: 2026-11-06  
Scope: `feat/tempmail-cfw-rebuild` Worker + web panel API usage

## Boundaries verified

| Surface | Control | Status |
|---------|---------|--------|
| Inbox read/delete | Bearer token, SHA-256 hash, constant-time compare | OK |
| Admin | Session hash in D1, HttpOnly Secure SameSite Strict cookie | OK |
| Admin mutations | `X-Requested-With: TempMail-CFW` CSRF header | OK |
| Login / create | KV rate limits | OK |
| Email HTML | sanitize + sandboxed iframe in UI | OK |
| Attachments | Auth required; `Content-Disposition: attachment` | OK |
| R2 | Private bucket; Worker-only access | OK |

## Fixes applied in this phase

1. **Inbox delete now purges R2** (html/raw/att prefixes + DB rows), same path as scheduled cleanup.
2. **Explicit attachment row deletion** before message rows (D1 cascade not assumed).
3. **Security headers middleware**: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Cache-Control: no-store` on API routes.

## Residual risks (accepted / operator-owned)

| Risk | Mitigation / note |
|------|-------------------|
| `PANEL_PASSWORD` is a shared secret | Use long random secret; rate-limited login; optional future hashed secret format |
| Webhook SSRF | Operator configures `WEBHOOK_URL`; only their endpoint |
| OTP false positives | Heuristic only; never treat as cryptographic proof |
| KV rate-limit eventual consistency | Acceptable for abuse throttling |
| No multi-admin RBAC | Single-operator product by design |

## Not in scope

- Public user registration
- Outbound SMTP open relay
- Public R2 or permanent attachment URLs
- Automated penetration test against a live deploy

## Recommendation before production

1. Set strong `PANEL_PASSWORD` via `wrangler secret put`
2. Confirm Email Routing only to this Worker
3. Enable cron triggers and verify cleanup logs
4. Build and serve web assets over HTTPS only (`__Host-` cookie requires Secure)
