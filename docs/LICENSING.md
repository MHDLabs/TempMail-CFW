# LICENSING.md

## This project

- **License:** MIT  
- **Copyright:** 2026 MHDLabs  
- See root `LICENSE` file.

## Dependency policy

- Prefer MIT / Apache-2.0 / BSD / ISC compatible licenses.
- Record every third-party runtime dependency and its license before merging.
- Do not introduce AGPL (or similarly strong copyleft) dependencies into the core runtime without an explicit owner decision.

## Reference projects — license posture

| Project | Apparent license | Policy for TempMail-CFW |
|---------|------------------|-------------------------|
| DietrichGebert/ponytail | MIT | Philosophy & rules only; no code copy required. |
| miqdadbadjuber/anti-slop | (check repo) | Rules / filter only. |
| kubai087/glasswork | (check LICENSE + NOTICE) | Material ideas + CSS patterns; preserve notices if substantial CSS is reused. |
| dreamhunter2333/cloudflare_temp_email | MIT | Patterns and architecture inspiration; any copied fragments must keep copyright notice. |
| ridvan/spinupmail | Check LICENSE on use | Modular architecture inspiration; no wholesale copy. |
| vwh/temp-mail | MIT | D1/R2 patterns; preserve notices if code is adapted. |
| TooonyChen/AuthInbox | Check LICENSE on use | OTP / MCP ideas; re-implement, do not paste AGPL-sensitive material. |
| Postern, Mailflare and other AGPL projects | AGPL | **Architecture and ideas only.** Do not copy or adapt source code into this MIT project. |

## Rules for contributors / agents

1. Before adapting any non-trivial fragment from an external repository, open its LICENSE file and record the decision here.
2. MIT-sourced fragments: keep the original copyright notice in the file or in this document as required.
3. Apache-2.0: satisfy NOTICE and attribution requirements.
4. AGPL: stop and ask the owner. Do not proceed with source adaptation.
5. Frontend assets, fonts, and icons have their own licenses; do not assume they match the project license.

## Current third-party runtime dependencies

(None yet in the rebuild. This section will be updated as packages are added in later phases.)

## Attribution log

| Date | Source | What was taken | Action |
|------|--------|----------------|--------|
| 2026-11-06 | Existing TempMail-CFW / TempMailAPI | Original monolith behaviour & API contract | Preserved as compatibility baseline |
| 2026-11-06 | Ponytail, Anti-Slop, Glasswork, listed email projects | Ideas, architecture patterns, design principles | Documented in REFERENCE-MAP; no code copied yet |
