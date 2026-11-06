# API-COMPATIBILITY.md

## Principle

The existing public API is a core product surface.  
Clients that work against the current TempMail-CFW / TempMailAPI Worker must continue to work after the rebuild, unless an explicit, approved migration path is published.

## Authoritative source

Behaviour is defined by the current `worker.js` implementation and the requests made by the existing web panel — not by aspirational examples.

## Preserved legacy endpoints

### Health

```
GET /health
```

Response shape (compatible):

```json
{
  "status": "ok",
  "ready": true,
  "service": "temp-mail-api"
}
```

### Create inbox

```
POST /email
Content-Type: application/json

{"name":"test123"}   // optional; empty body or {} → random name
```

Success (201):

```json
{
  "success": true,
  "email": "test123@configured-domain",
  "token": "<secret-token-once>",
  "expires_at": "<ISO-8601>"
}
```

Error examples preserved in spirit: `INVALID_NAME`, `NAME_TAKEN`, `SERVICE_UNAVAILABLE`.

### Check username

```
GET /email/check?name=test123
```

```json
{ "available": true, "name": "test123" }
```
or
```json
{ "available": false, "name": "test123" }
```

### Read inbox

```
GET /email/{name}
Authorization: Bearer <token>
```

```json
{
  "success": true,
  "email": "name@domain",
  "messages": [
    {
      "id": "...",
      "from": "...",
      "to": "...",
      "subject": "...",
      "date": "<ISO-8601>",
      "text": "...",
      "html": "..."
    }
  ],
  "expires_at": "<ISO-8601>"
}
```

### Delete inbox

```
DELETE /email/{name}
Authorization: Bearer <token>
```

```json
{ "success": true, "deleted": true }
```

### Auth (panel)

```
POST /auth/login
POST /auth/logout
```

Session cookie behaviour (`__Host-session`, HttpOnly, Secure, SameSite=Strict) remains the model for the panel.

### HTML routes

- `/`, `/login` → login page (or redirect if session valid)
- `/app`, `/dashboard` → protected panel

## What must not change silently

- HTTP methods of legacy routes
- Path structure of legacy routes
- Requirement of Bearer token for inbox read/delete
- Response field names listed above (`success`, `email`, `token`, `expires_at`, message fields, etc.)
- Default approximate lifetime behaviour (currently 1 hour) unless documented as a deliberate, compatible change

## Compatibility strategy

1. Legacy route handlers become thin adapters.
2. They call the same domain services as `/api/v1`.
3. Response mapping guarantees the legacy JSON shape.
4. Automated **contract tests** lock the legacy shapes and status codes.
5. New capabilities appear only under `/api/v1` (or documented additive fields that do not break existing clients).

## Versioned API

New surface:

```
/api/v1/inboxes
/api/v1/inboxes/:id
/api/v1/inboxes/:id/messages
/api/v1/messages/:id
/api/v1/messages/:id/attachments/:attachmentId
/api/v1/admin/...
```

Documented in `docs/API.md` and OpenAPI.  
Legacy remains available indefinitely during the rebuild and for a documented deprecation window afterwards.

## Breaking-change policy

Any intentional break of a legacy field or status requires:

1. Entry in this file and CHANGELOG
2. Migration notes
3. Explicit owner approval

Silent breaks are defects.
