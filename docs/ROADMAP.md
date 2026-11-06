# ROADMAP.md — TempMail-CFW Rebuild

Phased execution with mandatory approval gates.  
One phase → one report → one explicit approval (`تأیید مرحله N`).

## Phase overview

| Phase | Name | Goal |
|-------|------|------|
| 0 | Repository acquisition & initial audit | Clone, inspect, branch. **Done.** |
| 1 | Reference research & product definition | PRODUCT, AGENTS, DESIGN, REFERENCE-MAP, LICENSING, ROADMAP. **Current.** |
| 2 | Architecture, database & API contracts | ARCHITECTURE, API, SECURITY, DATA-RETENTION, OpenAPI draft, D1 schema. |
| 3 | Project foundation & modular scaffolding | TypeScript, Hono, bindings, migrations skeleton, tests, CI. |
| 4 | Inbox engine & API compatibility | Create / read / delete / expire + legacy compatibility. |
| 5 | Email engine, MIME & attachments | PostalMime, R2, size limits, safe HTML, cleanup. |
| 6 | Authentication, admin backend & security | Sessions, CSRF, rate limits, boundaries. |
| 7 | Complete web panel & Liquid Glass | Full UI, themes, responsive, accessible. |
| 8 | Advanced capabilities | OTP extraction, webhooks, optional API keys / MCP (justified only). |
| 9 | Full QA, security audit & polish | Tests, reviews, fixes. |
| 10 | Documentation, release prep & draft PR | Final docs, changelog, draft PR (no merge / no deploy). |

## Phase 1 deliverables (this phase)

- [x] PRODUCT.md
- [x] AGENTS.md
- [x] DESIGN.md
- [x] docs/REFERENCE-MAP.md
- [x] docs/LICENSING.md
- [x] docs/ROADMAP.md (this file)

No runtime code changes in Phase 1.

## Guiding constraints (all phases)

- Preserve legacy public API behaviour unless a versioned alternative is approved and documented.
- Prefer smallest complete implementation (Ponytail).
- No fake UI data, no public R2, no outbound mail, no secrets in git.
- Work only on `feat/tempmail-cfw-rebuild`.
- Never start the next phase without explicit approval.

## Success definition (end of Phase 10)

A modular, tested, documented, self-hostable temporary email product that receives real mail, stores attachments safely, exposes both legacy and modern APIs, and presents a polished Liquid Glass admin panel — ready for controlled production deployment after owner review.
