# PRODUCT.md — TempMail-CFW

**Product name:** TempMail-CFW  
**Owner:** MHDLabs  
**License:** MIT  
**Primary platform:** Cloudflare Workers  

## One-sentence definition

TempMail-CFW is a lightweight, self-hostable, privacy-conscious temporary email platform that lets you create disposable inboxes, receive real email, read messages and attachments safely, and throw everything away when done — with a clean API and a polished administration panel.

## What we are building

A production-quality temporary email service focused on:

1. **Disposable inboxes** (random or custom local-part)
2. **Reliable inbound email** via Cloudflare Email Routing
3. **Safe message viewing** (text + sanitized HTML)
4. **Attachment storage and authenticated download** (R2)
5. **Secure admin panel** (single-admin, session-based)
6. **Backward-compatible public API** (legacy routes preserved)
7. **Versioned modern API** (`/api/v1/...`)
8. **Automatic retention and cleanup**

It is intentionally **not** a full business email suite, Google Workspace replacement, or multi-tenant SaaS with public user registration.

## Primary users

| User | Goal |
|------|------|
| **Administrator** | Deploy once, manage domains, view all inboxes/messages, configure retention and secrets |
| **API consumer / developer** | Create inboxes, poll messages, extract OTPs, integrate into tests or agents |
| **Temporary inbox owner** | Use an address for a short time, read verification emails, discard |

## Core user journeys

1. Admin logs into the panel with the configured password.
2. Admin (or API client) creates a random or custom inbox.
3. External service sends email to `name@configured-domain`.
4. Cloudflare Email Routing delivers the message to the Worker.
5. Worker parses MIME, stores metadata in D1, bodies/attachments in R2 when needed.
6. Owner or admin retrieves messages via API or panel.
7. Owner copies verification code or downloads attachment.
8. Inbox expires or is deleted; all related data is cleaned up.

## In scope (must ship)

- Multiple configured domains
- Random + custom username creation
- Username availability check
- Independent per-inbox bearer tokens (hashed storage)
- Message list + detail (text + HTML)
- Attachment extraction, R2 storage, authenticated download
- Configurable retention + scheduled cleanup
- Admin login / logout / session
- Login rate limiting
- Legacy API compatibility layer
- Versioned REST API + OpenAPI
- Liquid Glass admin UI (light / dark / system)
- Deterministic OTP / verification-link extraction
- Meaningful automated tests

## Explicitly out of scope (for this rebuild)

- Public end-user registration or multi-tenant organizations
- Outbound SMTP / open relay
- Full IMAP/SMTP proxy server
- Mandatory AI providers (AI extraction remains optional and off by default)
- Durable Objects / Queues / Vectorize unless a concrete need is proven later
- Complex team / permission systems beyond single admin + inbox tokens
- Marketing site or landing-page productization

## Non-functional requirements

- **Security first:** no plaintext tokens, no public R2, sandboxed HTML, CSRF protection for cookie mutations, constant-time compares where relevant.
- **Privacy conscious:** short retention by default, no unnecessary logging of message bodies.
- **Lightweight:** prefer native Cloudflare capabilities; every dependency must justify its weight.
- **Maintainable:** modular TypeScript, clear boundaries, tests for security-sensitive and parsing paths.
- **Compatible:** existing clients that use the current public API must continue to work.
- **Accessible & responsive:** keyboard navigation, sufficient contrast, reduced-motion support.

## Success criteria

A successful delivery is a service that:

- Receives real emails end-to-end
- Stores and serves attachments securely
- Preserves the existing public API contract
- Offers a usable, beautiful admin panel in both themes
- Cleans up expired data reliably
- Can be deployed by following the deployment guide without undocumented steps
- Has automated tests covering the critical paths

## Status

This document defines the product for the rebuild. Implementation follows the phased plan in `docs/ROADMAP.md`.
