# DESIGN.md — TempMail-CFW

## Design intent

TempMail-CFW’s administration panel must feel like a carefully crafted tool, not a generic AI dashboard.

Primary visual direction: **macOS-inspired Liquid Glass** (selective, not ubiquitous).

Reference playground: https://github.com/kubai087/glasswork

## Core principles

1. **Glass is a material, not a decoration.** Use it on navigation, panels, dialogs, toolbars and selected interactive surfaces. Content areas and email previews prioritise readability.
2. **Both themes are designed.** Dark mode is not an inverted light mode.
3. **System preference is the default.** Support System / Light / Dark with persistent manual override and no flash on first paint.
4. **Every control works.** No placeholder buttons, fake stats, or dead navigation.
5. **Accessibility is non-negotiable.** Sufficient contrast, keyboard navigation, focus management, proper labels, reduced-motion support.
6. **Anti-slop filter.** No purple gradients for the sake of “modern”, no meaningless badges, no invented metrics, no robotic marketing copy.

## Theme system

| Mode | Behaviour |
|------|-----------|
| System | Follows `prefers-color-scheme` |
| Light | Explicit light glass + light surfaces |
| Dark | Explicit dark glass + dark surfaces |

- Persist user choice in `localStorage` (or equivalent).
- Apply theme class before first paint (inline script or equivalent) to avoid flash.
- CSS custom properties drive all colour, blur, border and shadow tokens.

## Liquid Glass material (selective)

Inspired by Glasswork layers:

- Soft shadow for volume
- Controlled blur + saturation/brightness (not milky)
- Optional rim highlight / subtle border
- Tint that adapts to background busyness while preserving text contrast ≥ 4.5:1
- Fallback when `backdrop-filter` is unsupported

Do **not**:

- Cover every surface in heavy blur
- Rely on expensive WebGL effects for the core UI
- Sacrifice legibility of email content for aesthetics

## Layout & density

- Desktop-first but fully responsive (test 360 / 390 / 768 / 1024 / 1280 / 1440).
- Clear hierarchy: sidebar or top nav → main content → detail panels.
- Comfortable spacing; avoid both cramped and sparse extremes.
- Consistent icon set (no emoji as primary icons).

## Key screens

1. **Login** — focused, secure, minimal chrome.
2. **Dashboard / Inbox list** — create, search, status, expiration.
3. **Message list** — scannable, filterable, keyboard-friendly.
4. **Message detail** — plain-text + sandboxed HTML tabs, attachments, copy actions.
5. **Settings** — domains, retention, API info, theme, logout.
6. **Empty / loading / error states** — meaningful, not decorative.

## Interaction

- Subtle, purposeful motion only.
- Honour `prefers-reduced-motion`.
- Clear loading and success feedback.
- Copy-to-clipboard with confirmation.
- Destructive actions require confirmation.

## Copywriting

- Direct, calm, precise.
- No marketing fluff inside the product UI.
- Error messages explain what happened and what the user can do next.

## Component strategy

- Build a small, coherent set of primitives (Button, Input, Dialog, Toast, Badge, etc.).
- Selectively adopt patterns or components from DesignPass only when they fit and licensing is clear.
- Prefer CSS + Tailwind utilities + design tokens over heavy UI libraries.

## Quality gates before considering UI “done”

- Both themes inspected at multiple widths
- Keyboard-only navigation works
- Focus rings visible and logical
- Contrast checked
- No horizontal overflow
- Empty and error states exist and are useful
- Real backend data is shown; no fabricated statistics
