# TempMailAPI

A tiny temporary email API built entirely on **Cloudflare Workers + KV + Email Routing**.

No frontend. No database. No framework. No external dependencies.

The goal is simple: create disposable inboxes, receive emails, read them through an API, and delete them when no longer needed.

## Features

* Create temporary email addresses
* Check username availability
* Receive incoming emails through Cloudflare Email Routing
* Read inbox messages through REST API
* Delete inboxes
* Automatic inbox expiration with KV TTL
* Simple Bearer Token authentication
* No external runtime dependencies
* Designed to run on the Cloudflare free tier within its limits

## Architecture

```text
Internet
   │
   ▼
Cloudflare Email Routing
   │
   ▼
Cloudflare Worker
   │
   ├── REST API
   ├── Email Handler
   │
   ▼
Cloudflare KV
```

## Requirements

* A Cloudflare account
* A domain managed by Cloudflare
* Cloudflare Email Routing
* A Cloudflare KV namespace

## Configuration

The Worker expects:

### KV Binding

```text
KV
```

### Environment Variable

```text
DOMAIN
```

Example:

```text
myinbox0320.kdns.fr
```

The project does not hard-code the domain.

## API

### Health Check

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

### Create Email

```http
POST /email
```

Create an inbox with a specific name:

```bash
curl -X POST \
  https://YOUR-WORKER.workers.dev/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"test123"}'
```

Or let the API generate a random name:

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
  "email": "test123@example.com",
  "token": "YOUR_SECRET_TOKEN",
  "expires_at": "2026-09-10T12:00:00.000Z"
}
```

Save the returned token. It is required to access and delete the inbox.

---

### Check Username Availability

```http
GET /email/check?name=NAME
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

### Read Inbox

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
  "email": "test123@example.com",
  "messages": [
    {
      "id": "MESSAGE_ID",
      "from": "sender@example.com",
      "to": "test123@example.com",
      "subject": "Test",
      "date": "2026-09-10T10:00:00.000Z",
      "text": "Hello",
      "html": "<p>Hello</p>"
    }
  ]
}
```

---

### Delete Inbox

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

## Email Receiving

Cloudflare Email Routing forwards incoming messages for the configured domain to the Worker's `email()` handler.

For example:

```text
test123@example.com
        │
        ▼
Cloudflare Email Routing
        │
        ▼
TempMailAPI Worker
        │
        ▼
Cloudflare KV
```

Only inboxes that currently exist in KV can receive messages.

Expired or deleted inboxes are rejected.

## Expiration

Temporary inboxes are automatically configured with a **1-hour lifetime** by default.

The expiration time is returned when the inbox is created.

Inbox and message data use Cloudflare KV expiration so temporary data does not need a separate cleanup service.

## Limits

The current implementation intentionally keeps the service small and applies limits to protect the Worker and storage:

* Maximum username length: 32 characters
* Username length: 3–32 characters
* Maximum messages per inbox: 50
* Maximum stored message content size: 1 MB per field

These values can be changed in `worker.js`.

## Security

Each inbox receives a random secret token.

The token itself is not stored directly in KV; a SHA-256 hash is stored instead.

The token is required for reading and deleting the inbox.

Do not publish or share inbox tokens.

## Deployment

Deploy `worker.js` as a Cloudflare Worker and configure the required KV binding and `DOMAIN` environment variable.

Then configure Cloudflare Email Routing so the domain's incoming mail is sent to the Worker.

## Project Status

**Early / experimental**

The project is intentionally minimal and focuses on the core temporary-email functionality.

A web panel may be added later without changing the API design.

## License

This project is licensed under the MIT License.

See [`LICENSE`](LICENSE) for details.
