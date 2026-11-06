# SECURITY.md — TempMail-CFW

## Threat model (summary)

TempMail-CFW handles untrusted email content and issues short-lived access tokens.  
Primary risks: unauthorized inbox access, XSS via HTML email, token leakage, brute-force on admin login, abuse of creation endpoints, data left after expiration, and accidental exposure of R2 objects.

## Security boundaries

1. **Public / anonymous** — health, username check, inbox creation (rate-limited)
2. **Inbox owner** — Bearer token scoped to one inbox
3. **Administrator** — server-side session after password login

These boundaries must not be mixed. An inbox token never grants admin rights. An admin session is separate from inbox tokens.

## Credentials

### Inbox tokens

- Cryptographically random, sufficient length
- Returned **once** at creation
- Only a secure hash stored (SHA-256 or stronger)
- Compared in constant time
- Never logged, never placed in URLs

### Admin password

- Stored only as Cloudflare Secret (`PANEL_PASSWORD` or successor)
- Not hard-coded
- Verified with a password-hashing approach appropriate for Workers (not fast unsalted SHA-256 for passwords)
- No public registration; single-admin model initially

### Sessions

- Unpredictable session identifiers
- Prefer storing a hash of the session secret
- Cookie: `HttpOnly`, `Secure`, `SameSite=Strict` (or `Lax` only if strictly required), `__Host-` prefix when possible
- Server-side expiration and logout invalidation
- CSRF protection for cookie-authenticated state-changing requests

## Email content is untrusted

- Parse with size bounds; reject oversized streams early
- HTML is sanitized before any privileged use
- Preview in sandboxed iframe (`sandbox` without unnecessary allow-* flags)
- Disable scripts, forms, and dangerous URL schemes
- Remote images controlled or blocked by default
- Filenames and MIME types from senders are not trusted for security decisions

## Attachments

- Stored in private R2
- Random object keys
- Downloads only through authenticated handlers
- Per-file and per-inbox size quotas
- Content-Type served carefully; prefer download disposition for untrusted types

## Injection & data integrity

- Parameterized queries / bound statements for D1
- Strict validation of usernames (`[a-zA-Z0-9_-]`, length limits)
- Unique constraints prevent silent inbox takeover
- Duplicate message detection (Message-ID) where practical

## Abuse controls

- Login rate limiting by IP (KV)
- Creation / read rate limits as configured
- Inbox and message quotas
- Early reject of invalid recipients

## Logging & secrets

- Never log tokens, passwords, full email bodies, or raw MIME by default
- Request IDs for correlation
- Secrets only via Cloudflare Secrets / encrypted env — never committed

## CORS

- Explicit allowlist for browser origins that need credentialed access
- Default deny for unexpected origins on credentialed routes

## Cleanup & retention

- Expired inboxes and their R2 objects must be removed
- Failed cleanup must be retryable (idempotent jobs)
- See `docs/DATA-RETENTION.md`

## What we do not do

- Public R2 buckets or permanent public attachment URLs
- Outbound open relay
- Storing plaintext inbox tokens
- Trusting client-supplied HTML without sanitization
- Shipping with a default known admin password

## Review expectations

Security-sensitive changes (auth, token handling, HTML sanitization, R2 access, CORS, rate limits) require focused review and tests.  
Ponytail-style review should examine callers outside the diff when shared security helpers change.
