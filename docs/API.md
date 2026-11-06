# API.md — TempMail-CFW

This document describes the intended API surface after the rebuild.  
Legacy compatibility details live in `docs/API-COMPATIBILITY.md`.  
OpenAPI machine-readable draft: `docs/openapi.yaml`.

## Base conventions (v1)

- Base path: `/api/v1`
- JSON request/response
- `Content-Type: application/json`
- Request ID header on responses: `X-Request-Id`
- Standard error envelope:

```json
{
  "success": false,
  "error": {
    "code": "INBOX_NOT_FOUND",
    "message": "Human readable explanation"
  },
  "request_id": "..."
}
```

- Cursor-based pagination for collections (`cursor`, `limit`, `next_cursor`)
- Timestamps in ISO-8601 UTC

## Authentication

| Audience | Mechanism |
|----------|-----------|
| Inbox owner | `Authorization: Bearer <inbox_token>` |
| Admin | Session cookie (panel) or future admin API key (scoped) |
| Health | None |

Inbox tokens are shown **only** at creation time.

## Versioned resources (planned)

### Health (also available at legacy `/health`)

`GET /api/v1/health`

### Inboxes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/inboxes` | optional / rate-limited | Create (random or custom) |
| GET | `/api/v1/inboxes/check` | — | Availability (`?name=&domain=`) |
| GET | `/api/v1/inboxes/:id` | Bearer | Metadata + expiration |
| GET | `/api/v1/inboxes/:id/messages` | Bearer | List messages (paginated) |
| DELETE | `/api/v1/inboxes/:id` | Bearer | Delete inbox and data |

Create body example:

```json
{
  "name": "optional-custom",
  "domain": "optional-if-multi"
}
```

Create response includes `email`, `token` (once), `expires_at`, `id`.

### Messages

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/messages/:id` | Bearer (owning inbox) | Full message |
| DELETE | `/api/v1/messages/:id` | Bearer | Delete one message |

Message object includes: id, inbox_id, from, to, subject, date, text, html (or urls), attachments metadata, extracted OTP fields (phase 8).

### Attachments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/messages/:id/attachments/:attachmentId` | Bearer | Download binary |

No permanent public URLs.

### Admin (session)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/admin/login` | Login |
| POST | `/api/v1/admin/logout` | Logout |
| GET | `/api/v1/admin/session` | Current session |
| GET | `/api/v1/admin/inboxes` | List (admin) |
| … | … | Settings / cleanup status as implemented |

Exact admin routes finalised during implementation; only real routes are documented in OpenAPI.

## Legacy mapping

| Legacy | v1 equivalent |
|--------|----------------|
| `POST /email` | `POST /api/v1/inboxes` |
| `GET /email/check` | `GET /api/v1/inboxes/check` |
| `GET /email/:name` | `GET /api/v1/inboxes/:id/messages` (+ metadata) |
| `DELETE /email/:name` | `DELETE /api/v1/inboxes/:id` |
| `GET /health` | `GET /api/v1/health` |

Legacy handlers keep the old JSON shapes.

## Status codes (common)

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Validation error |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict (name taken) |
| 413 | Payload too large |
| 429 | Rate limited |
| 500 | Internal error |
| 503 | Service unavailable (bindings) |

## Rate limits

Documented per-route in OpenAPI once implemented.  
Login and inbox creation are protected first.

## OpenAPI

Machine-readable specification is maintained in `docs/openapi.yaml` and must stay in sync with real routes.  
Do not document endpoints that do not exist.
