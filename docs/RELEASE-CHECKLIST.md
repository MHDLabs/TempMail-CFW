# Release checklist — TempMail-CFW

Use before the first controlled production deploy.  
Do **not** merge or deploy until the owner explicitly approves.

## Pre-merge

- [ ] CI green on `feat/tempmail-cfw-rebuild`
- [ ] Review `docs/SECURITY-AUDIT.md` residual risks
- [ ] Confirm legacy API clients still match `docs/API-COMPATIBILITY.md`
- [ ] `npm test` and `npm run typecheck` pass locally (optional if CI trusted)
- [ ] `cd web && npm run build` succeeds if shipping the panel

## Cloudflare setup

- [ ] Create D1 database; put `database_id` in `wrangler.toml`
- [ ] Create R2 bucket; bind as `R2`
- [ ] Create KV namespace; bind as `KV`
- [ ] Set `EMAIL_DOMAINS` (comma-separated, first is default)
- [ ] `wrangler secret put PANEL_PASSWORD` (long random value)
- [ ] Optional: `WEBHOOK_URL`, `WEBHOOK_SECRET`
- [ ] `wrangler d1 migrations apply <database_name>`
- [ ] Enable Email Routing → Worker for the domain
- [ ] Confirm cron trigger `*/15 * * * *` for cleanup
- [ ] After `npm run web:build`, enable `[assets]` → `./web/dist` if serving the SPA from the Worker

## Post-deploy smoke

- [ ] `GET /health` → `ready: true`
- [ ] `POST /email` creates inbox; token shown once
- [ ] Send a real message; appears in `GET /email/:name` with Bearer token
- [ ] Admin login + session cookie on HTTPS
- [ ] Delete inbox; R2 objects gone after purge
- [ ] Wait for or trigger cleanup on an expired inbox

## Explicitly out of scope for v0.1

- Multi-admin RBAC / public signup
- Outbound SMTP
- Public R2 URLs
- Automated merge to `main` without owner approval
