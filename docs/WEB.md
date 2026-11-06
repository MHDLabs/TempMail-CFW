# Web panel

React + Vite + Tailwind administration UI for TempMail-CFW.

## Develop

```bash
# terminal 1 — API worker
npm run dev

# terminal 2 — UI (proxies /api, /auth, /email to :8787)
cd web && npm install && npm run dev
```

## Build for production

```bash
cd web && npm install && npm run build
```

Then enable the `[assets]` block in `wrangler.toml` pointing at `./web/dist` and deploy.

## Screens

- Login (admin password)
- Inbox list + create
- Message list + text/HTML preview (sandboxed iframe)
- Settings (theme, manual cleanup)
