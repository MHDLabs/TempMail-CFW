# REFERENCE-MAP.md

This document records what we studied, what we plan to adopt as *ideas* or *patterns*, and what we explicitly reject.  
No entire repository is copied into TempMail-CFW.

## Engineering philosophy

| Source | What we take | Notes |
|--------|--------------|-------|
| [Ponytail](https://github.com/DietrichGebert/ponytail) | Smallest complete change, never cut security/validation/tests, review & audit mindset | Primary operating mode. Encoded in `AGENTS.md`. |
| Karpathy-inspired skills | Think → Simple → Surgical → Goal-driven | Used throughout planning and implementation. |
| [Anti-Slop](https://github.com/miqdadbadjuber/anti-slop) | Hard rules against generic AI UI/copy | Applied to frontend work and final delivery gate. |
| [Impeccable](https://github.com/pbakaus/impeccable) | Design-system workflows (shape, critique, polish) | Used for design quality, not as a hard dependency. |
| [Glasswork](https://github.com/kubai087/glasswork) | Liquid Glass material principles, CSS variables, selective use, fallbacks | Visual direction for the admin panel. |

## Temporary-email implementations

| Project | License (as published) | Priority | Adopted ideas | Rejected / avoided |
|---------|------------------------|----------|---------------|--------------------|
| [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) | MIT | Very high | Email Routing ingestion patterns, D1 schema thinking, attachment handling concepts, webhook ideas, agent skill pattern, cleanup strategies | Full product surface (SMTP proxy, multi-user OAuth, heavy AI-by-default, large frontend). We stay smaller. |
| [ridvan/spinupmail](https://github.com/ridvan/spinupmail) | (check LICENSE) | Very high | Modular Hono backend layout, inbox/message repositories, PostalMime usage, R2 attachments, rate limits, duplicate delivery thinking, API contracts | Multi-org / Better Auth complexity beyond our single-admin needs. |
| [vwh/temp-mail](https://github.com/vwh/temp-mail) | MIT | High | D1 + R2 attachment model, cleanup jobs, clear API surface for emails/attachments | Broader multi-domain public service model; we remain self-hosted focused. |
| [TooonyChen/AuthInbox](https://github.com/TooonyChen/AuthInbox) | (check LICENSE) | High (OTP / agent) | Deterministic + optional AI extraction categories, promotional filtering ideas, MCP read-only surface, secure grant thinking | Multi-user grant system and mandatory AI are out of scope for core. |
| [cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox) | — | Medium | Durable Object isolation ideas (only if later justified) | We do not introduce DO unless a concrete isolation need appears. |
| [JacobLinCool/cloudflare-email-kit](https://github.com/JacobLinCool/cloudflare-email-kit) | — | Medium | Router / middleware / size-guard patterns | Avoid pulling a large kit if a few focused modules suffice. |

## Supplementary references

- maillab/cloud-mail, AndrewYukon/cloud-mail-plus, skyphusion-labs/postern, hieunc229/mailflare  
  Studied for architecture ideas only.  
  **AGPL projects (e.g. Postern, Mailflare):** ideas may be studied; source must not be copied into this MIT project without a separate licensing decision.

## Design / UI references

| Source | Use |
|--------|-----|
| Glasswork | Liquid Glass material, rim, tint, blur, adaptive density, CSS export approach |
| DesignPass (designpass.dev) | Selective component / interaction patterns after license check |
| Anti-Slop rules | Mandatory filter on UI and copy |

## Explicit non-goals drawn from references

- Turning TempMail-CFW into a full multi-tenant SaaS
- Shipping outbound SMTP as a core feature
- Requiring an AI provider for basic operation
- Copying large frontend codebases wholesale
- Re-introducing a single 1800+ line Worker file

## How adoption is recorded

When concrete code patterns or small fragments are taken from a reference:

1. Note the origin file / idea here or in a follow-up entry.
2. Record license obligations in `docs/LICENSING.md`.
3. Prefer re-implementation in our modular style over direct paste of large blocks.
