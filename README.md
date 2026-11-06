# TempMail-CFW

Lightweight, self-hostable **temporary email** platform on **Cloudflare Workers**.

Create disposable inboxes, receive real mail via Email Routing, read messages and attachments safely, then let retention delete them.

**فارسی:** see [docs/README.fa.md](docs/README.fa.md)

## Features

- Random or custom local-part inboxes
- Legacy API + `/api/v1` (see `docs/API.md`, `docs/API-COMPATIBILITY.md`)
- MIME parse (PostalMime), sanitized HTML, R2 attachments
- Admin panel (React, Liquid Glass, light/dark/system)
- Session auth, rate limits, scheduled cleanup
- Deterministic OTP extraction on messages
- Optional HMAC-signed webhooks (`WEBHOOK_URL`, `WEBHOOK_SECRET`)

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Cloudflare Workers + Hono |
| Metadata | D1 |
| Objects | R2 |
| Ephemeral | KV |
| UI | React + Vite + Tailwind (`web/`) |

## Quick start

```bash
npm install
# Configure wrangler.toml: D1, R2, KV ids, EMAIL_DOMAINS
npx wrangler secret put PANEL_PASSWORD
npx wrangler d1 migrations apply tempmail-cfw --local   # or without --local for remote
npm run dev
```

Web UI (separate terminal):

```bash
cd web && npm install && npm run dev
```

Production UI: `npm run web:build`, then enable `[assets]` in `wrangler.toml`.

## Documentation

| Doc | Path |
|-----|------|
| Architecture | `docs/ARCHITECTURE.md` |
| API | `docs/API.md` / `docs/openapi.yaml` |
| Security | `docs/SECURITY.md` |
| Retention | `docs/DATA-RETENTION.md` |
| Web panel | `docs/WEB.md` |
| Changelog | `CHANGELOG.md` |

## License

MIT — MHDLabs
