# 📬 TempMailAPI

> A tiny temporary email service built on **Cloudflare Workers**.

TempMailAPI is a lightweight disposable email system designed to do one thing well:

**Create a temporary inbox, receive emails, read them, and throw them away.**

No heavy backend.
No database server.
No framework stack.
Just **one Cloudflare Worker + KV + Email Routing**.

---

## ✨ Features

* 📮 Create temporary email addresses
* 🔎 Check username availability
* 📥 Receive incoming emails
* 📨 Read inbox messages through REST API
* 🗑️ Delete inboxes and their messages
* ⏳ Automatic inbox expiration
* 🔐 Bearer-token protected inbox access
* 🛡️ Password-protected web panel
* 🔑 Server-side sessions with secure cookies
* 🚦 Login brute-force protection
* 🌙 Dark glassmorphism web interface
* 🟢 Neon-green UI
* 📱 Responsive dashboard
* 🧩 Single-file architecture
* 🚫 No external runtime dependencies

---

## 🧠 How It Works

```text
              📩 Incoming Email
                     │
                     ▼
          Cloudflare Email Routing
                     │
                     ▼
              ┌───────────────┐
              │    Worker     │
              │               │
              │ REST API      │
              │ Web Panel     │
              │ Auth          │
              │ Email Handler │
              └───────┬───────┘
                      │
                      ▼
                 Cloudflare KV
```

Everything lives inside one Worker.

```text
worker.js
```

That's it. :)

---

## 🛠️ Requirements

You need:

* ☁️ A Cloudflare account
* 🌐 A domain managed by Cloudflare
* 📦 A Cloudflare KV namespace
* ✉️ Cloudflare Email Routing

---

## ⚙️ Configuration

### KV Binding

Create a KV namespace and bind it to the Worker as:

```text
KV
```

### Environment Variables

Set:

```text
DOMAIN
PANEL_PASSWORD
```

Example:

```text
DOMAIN=myemail.example
PANEL_PASSWORD=your-secret-password
```

`PANEL_PASSWORD` should be configured as a **Cloudflare Secret**, not hard-coded into the Worker.

---

## 🚀 Deploy

Upload `worker.js` to a Cloudflare Worker and configure the KV binding and environment variables above.

Then configure Cloudflare Email Routing so incoming messages for your domain are sent to the Worker.

For example:

```text
test123@myemail.example
        │
        ▼
Cloudflare Email Routing
        │
        ▼
TempMailAPI Worker
```

---

# 🌐 Web Panel

The Worker includes a built-in web interface.

Open:

```text
https://YOUR-WORKER.workers.dev/
```

You will see the login page.

After authentication:

```text
https://YOUR-WORKER.workers.dev/app
```

The dashboard provides:

* 📮 Create inbox
* 🔎 Username availability check
* 📥 Inbox viewer
* 🔄 Manual refresh
* ♻️ Auto refresh
* ⏳ Expiration countdown
* 🔍 Message search
* 📄 Plain-text message viewer
* 🌐 Sandboxed HTML message viewer
* 📋 Copy email/token
* 🗑️ Delete inbox
* 🚪 Logout
* 💚 Worker health status

---

# 🔌 API

The API is intentionally small.

## ❤️ Health

```http
GET /health
```

Example:

```bash
curl https://YOUR-WORKER.workers.dev/health
```

Response:

```json
{
  "status": "ok",
  "ready": true,
  "service": "temp-mail-api"
}
```

---

## 📮 Create Inbox

```http
POST /email
```

### Custom username

```bash
curl -X POST \
  https://YOUR-WORKER.workers.dev/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"test123"}'
```

### Random username

```bash
curl -X POST \
  https://YOUR-WORKER.workers.dev/email \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Example response:

```json
{
  "success": true,
  "email": "test123@myemail.example",
  "token": "YOUR_SECRET_TOKEN",
  "expires_at": "2026-09-11T15:00:00.000Z"
}
```

Save the token. It is required for accessing and deleting the inbox.

---

## 🔎 Check Username

```http
GET /email/check?name=test123
```

Example:

```bash
curl \
  'https://YOUR-WORKER.workers.dev/email/check?name=test123'
```

Available:

```json
{
  "available": true,
  "name": "test123"
}
```

Taken:

```json
{
  "available": false,
  "name": "test123"
}
```

---

## 📥 Read Inbox

```http
GET /email/{name}
```

Authentication:

```http
Authorization: Bearer YOUR_TOKEN
```

Example:

```bash
curl \
  'https://YOUR-WORKER.workers.dev/email/test123' \
  -H 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

Example response:

```json
{
  "success": true,
  "email": "test123@myemail.example",
  "messages": [
    {
      "id": "MESSAGE_ID",
      "from": "sender@example.com",
      "to": "test123@myemail.example",
      "subject": "Verification Code",
      "date": "2026-09-11T12:30:00.000Z",
      "text": "Your verification code is 123456",
      "html": "<p>Your verification code is <b>123456</b></p>"
    }
  ],
  "expires_at": "2026-09-11T13:00:00.000Z"
}
```

---

## 🗑️ Delete Inbox

```http
DELETE /email/{name}
```

Authentication:

```http
Authorization: Bearer YOUR_TOKEN
```

Example:

```bash
curl -X DELETE \
  'https://YOUR-WORKER.workers.dev/email/test123' \
  -H 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

Response:

```json
{
  "success": true,
  "deleted": true
}
```

Deleting an inbox also removes its stored messages.

---

# 🔐 Authentication

The web panel uses a separate authentication system from inbox tokens.

### Panel

```text
PANEL_PASSWORD
      ↓
Server-side login
      ↓
KV session
      ↓
HttpOnly + Secure cookie
```

Sessions automatically expire and can be invalidated through logout.

Failed login attempts are rate-limited to reduce brute-force attempts.

### Inbox

Each temporary inbox receives its own random token:

```text
Authorization: Bearer YOUR_TOKEN
```

The token itself is not stored directly in KV; a SHA-256 hash is stored instead.

---

# ⏳ Inbox Lifetime

Temporary inboxes expire automatically.

Default lifetime:

```text
1 hour
```

The expiration time is returned when the inbox is created.

Stored inbox and message records use KV expiration, so no separate cleanup service is required.

---

# 🧱 Project Structure

The project intentionally stays tiny:

```text
TempMailAPI/
└── worker.js
```

One file.

One Worker.

One KV namespace.

---

# 🛡️ Security Notes

TempMailAPI is intentionally lightweight, but a few protections are built in:

* 🔐 Random inbox tokens
* 🔒 SHA-256 token storage
* 🍪 HttpOnly / Secure / SameSite session cookies
* 🚦 Login rate limiting
* 🧼 Input validation
* 🧱 Sandboxed HTML email rendering
* 🚫 No secrets hard-coded into the Worker
* ⏳ Automatic expiration

The service is intended for temporary, disposable communication. Do not use it for sensitive or permanent information.

---

# 📊 Current Limits

Default limits:

```text
Inbox lifetime       1 hour
Username length      3–32 characters
Messages / inbox     50
Stored message size  1 MB per field
```

These values can be adjusted directly in `worker.js`.

---

# 🧪 Status

> **Experimental / personal project**

TempMailAPI is intentionally small and focused.

The goal is not to build another giant email platform.

It's just a tiny inbox that works when you need one.

---

## 📄 License

This project is licensed under the **MIT License**.

See [`LICENSE`](LICENSE) for details.

---

### ☕ Built with curiosity, a stubborn love for simple systems, and probably too much coffee.
