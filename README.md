# TempMail-CFW

Lightweight temporary email on **Cloudflare Workers**.

Receives real mail via Email Routing, stores normalized content in **D1**, exposes legacy + `/api/v1` APIs, and includes an admin panel.

**فارسی:** [docs/README.fa.md](docs/README.fa.md)

## Features
- Random or custom inboxes
- Legacy API + `/api/v1` with cursor pagination
- MIME parse, sanitized HTML, OTP extraction
- Attachment **metadata only** (no file downloads)
- Admin panel (React)
- Rate limits, sessions, scheduled cleanup
- Optional HTTPS webhooks

## Not included
- Cloudflare R2 / object storage
- Outbound SMTP / send email
- Raw MIME archival

## Stack
Worker + Hono · D1 · KV · Email Routing · React (`web/`)

## Docs
See `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SECURITY.md`, `docs/D1-SCHEMA.md`.

## License
MIT — MHDLabs
