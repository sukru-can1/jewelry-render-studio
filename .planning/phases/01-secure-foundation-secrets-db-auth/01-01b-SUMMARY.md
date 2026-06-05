---
phase: 01-secure-foundation-secrets-db-auth
plan: 01b
subsystem: ui
tags: [shadcn, tailwind-v4, geist, design-tokens, radix-ui, react-hook-form, css-variables]

# Dependency graph
requires:
  - phase: 01-01
    provides: "package.json with geist + lucide-react deps installed; app/ scaffold"
provides:
  - "shadcn/Tailwind v4 design-token layer (components.json, app/globals.css)"
  - "UI-SPEC semantic teal token layer for :root (light) and .dark (dark default), no purple"
  - "16-component shadcn seed library under app/components/ui"
  - "Geist Sans + Geist Mono loaded via geist package, dark theme default in layout.tsx"
  - "cn() class-merge helper (lib/utils.ts) and @tailwindcss/postcss config"
affects: [01-05, 01-06, "every later UI-bearing phase"]

# Tech tracking
tech-stack:
  added: [tailwindcss@4, "@tailwindcss/postcss@4", clsx, tailwind-merge, radix-ui, react-hook-form, "@hookform/resolvers", tw-animate-css, shadcn]
  patterns:
    - "Tailwind v4 CSS-first config (@import tailwindcss + @theme inline in globals.css; no tailwind.config.js)"
    - "Three-tier token architecture (primitive -> semantic -> component); components read only semantic CSS vars"
    - "shadcn aliases re-pointed to app/components/ui (ui dir lives under app/, not repo root)"
    - "Single global stylesheet imported in layout.tsx; legacy styles.css scoped to enterprise-app.tsx (Pitfall #7)"

key-files:
  created:
    - app/globals.css
    - components.json
    - lib/utils.ts
    - postcss.config.mjs
    - app/components/ui/* (16 components)
  modified:
    - app/layout.tsx
    - app/enterprise-app.tsx
    - package.json

key-decisions:
  - "Used the geist npm package (GeistSans/GeistMono -> --font-geist-sans/--font-geist-mono) instead of next/font/google, matching the env note and providing a mono face the UI-SPEC requires."
  - "Re-pointed shadcn aliases (components/ui/hooks) into app/ so the seed library lives at app/components/ui per plan must_haves, while keeping @/* -> ./* tsconfig alias intact."
  - "Reconciled stylesheets by scoping legacy app/styles.css to enterprise-app.tsx (component import) so layout.tsx has exactly one global stylesheet (globals.css)."
  - "Seeded UI-SPEC hex tokens verbatim (teal #14B8A6 dark / #0D9488 light) rather than shadcn's oklch neutrals; replaced shadcn's purple .dark --sidebar-primary."

patterns-established:
  - "Token layer: edit app/globals.css :root/.dark CSS variables; never hardcode hex in components."
  - "shadcn component installs land in app/components/ui via re-pointed aliases."

requirements-completed: [UI-02]

# Metrics
duration: 16min
completed: 2026-06-05
---

# Phase 01 Plan 01b: Design-Token Layer Summary

**shadcn on Tailwind v4 with the exact UI-SPEC teal token layer (dark-default + light), Geist Sans/Mono fonts, a single reconciled globals.css, and a 16-component shadcn seed library under app/components/ui.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-06-05T07:12:00Z
- **Completed:** 2026-06-05T07:28:28Z
- **Tasks:** 1
- **Files modified/created:** 24

## Accomplishments
- Ran `shadcn init` (radix-nova style, neutral base, CSS variables) on a fresh Tailwind v4 CSS-first setup.
- Seeded the exact UI-SPEC semantic token layer into `app/globals.css`: teal accent (dark `#14B8A6`, light `#0D9488`), dual `:root`/`.dark` themes, status tokens (success/warning/info), 8px radius, chart palette — no purple anywhere.
- Loaded Geist Sans + Geist Mono via the `geist` package; set `.dark` as the default ops-console theme on `<html>`.
- Added the 16-component shadcn set under `app/components/ui` (button, input, label, table, badge, dialog, card, dropdown-menu, sonner, form, select, switch, skeleton, avatar, tooltip, separator).
- Reconciled the two stylesheets (RESEARCH Pitfall #7): layout.tsx imports only `globals.css`; legacy `styles.css` scoped to `enterprise-app.tsx`.
- Verified `next build` compiles and type-checks (11 routes) with the new design system.

## Task Commits

1. **Task 1: shadcn/Tailwind v4 init + UI-SPEC token layer + Geist fonts (reconcile single stylesheet)** - `3aeee2b` (feat)

## Files Created/Modified
- `app/globals.css` - Tailwind v4 entry + `@theme inline` token mapping + UI-SPEC `:root`/`.dark` teal token layer (created).
- `components.json` - shadcn config (radix-nova / neutral / cssVars), aliases re-pointed to `app/components`/`app/components/ui` (created).
- `lib/utils.ts` - `cn()` clsx + tailwind-merge helper (created).
- `postcss.config.mjs` - `@tailwindcss/postcss` plugin (created).
- `app/components/ui/*.tsx` - 16 shadcn components (created).
- `app/layout.tsx` - Geist Sans/Mono via `geist`, `.dark` default, imports only `globals.css` (modified).
- `app/enterprise-app.tsx` - scoped `import "./styles.css"` so legacy pages keep their styling without a competing global stylesheet (modified).
- `package.json` / `package-lock.json` - Tailwind v4, clsx, tailwind-merge, radix-ui, react-hook-form, @hookform/resolvers, tw-animate-css, shadcn (modified).

## Decisions Made
- See `key-decisions` frontmatter. Notably: `geist` package over `next/font/google` (provides mono + matches env note); aliases re-pointed into `app/`; legacy styles.css scoped rather than deleted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tailwind v4 had to be installed before `shadcn init`**
- **Found during:** Task 1
- **Issue:** This shadcn CLI version (radix-nova preset) refuses to init without an existing Tailwind config; the repo had none.
- **Fix:** Installed `tailwindcss@^4` + `@tailwindcss/postcss@^4`, wrote `postcss.config.mjs` and a minimal `app/globals.css` (`@import "tailwindcss";`), then re-ran init successfully.
- **Files modified:** package.json, postcss.config.mjs, app/globals.css
- **Verification:** `shadcn init` reported "Found Tailwind v4" and completed.
- **Committed in:** 3aeee2b

**2. [Rule 3 - Blocking] `form` component absent from the radix-nova registry**
- **Found during:** Task 1
- **Issue:** `shadcn add form` against the radix-nova style silently wrote no file (registry mismatch), leaving 15/16 components.
- **Fix:** Added `form` from the canonical registry URL `https://ui.shadcn.com/r/styles/new-york-v4/form.json`, which also pulled `react-hook-form` + `@hookform/resolvers`. Confirmed it imports `@/app/components/ui/label` and `@/lib/utils` correctly.
- **Files modified:** app/components/ui/form.tsx, package.json
- **Verification:** 16 components present; `next build` type-checks.
- **Committed in:** 3aeee2b

**3. [Rule 2 - Missing Critical] shadcn default `.dark --sidebar-primary` was purple/indigo**
- **Found during:** Task 1
- **Issue:** The generated dark theme set `--sidebar-primary: oklch(0.488 0.243 264.376)` (indigo), violating the UI-SPEC "no purple" contract and the threat register T-1-UI-TOKEN.
- **Fix:** Replaced all dark/light token values with the exact UI-SPEC hex tokens; sidebar active state now uses teal.
- **Files modified:** app/globals.css
- **Verification:** Plan automated gate (rejects purple/indigo) passes.
- **Committed in:** 3aeee2b

**4. [Rule 3 - Blocking] shadcn placed components at repo-root `components/ui`**
- **Found during:** Task 1
- **Issue:** Default `@/components` alias resolved to repo root, but plan must_haves require `app/components/ui`.
- **Fix:** Re-pointed `components.json` aliases into `app/` and moved `button.tsx`; subsequent installs landed under `app/components/ui`.
- **Files modified:** components.json, app/components/ui/*
- **Verification:** All 16 components reside under `app/components/ui` with correct `@/app/components/ui` imports.
- **Committed in:** 3aeee2b

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing-critical).
**Impact on plan:** All necessary to satisfy the plan's must_haves and the no-purple token contract. No scope creep — the deliverable matches the plan exactly.

## Issues Encountered
- `npm run build` includes `prisma migrate deploy`, which fails on `DIRECT_URL` not being set in this environment (no database). This is a pre-existing infra dependency owned by plan 01-01, out of scope for this plan. The token/stylesheet/component change itself was verified with `npx next build` directly: compiles and type-checks (11 routes) cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plans 01-05 (login + app shell) and 01-06 (admin surfaces) can import every component in `app/components/ui` and read every semantic token (`--primary`, `--background`, `--success`, etc.) defined here.
- Dark theme is the default; a future theme toggle (UI-SPEC top bar) can flip `.dark` on `<html>`.

## Self-Check: PASSED

- FOUND: app/globals.css (contains --primary, .dark, teal hex, no purple)
- FOUND: components.json (radix-nova / neutral / cssVars, aliases under app/)
- FOUND: lib/utils.ts (cn / clsx)
- FOUND: postcss.config.mjs
- FOUND: app/components/ui/ (16 components incl. form)
- FOUND: commit 3aeee2b
- VERIFIED: `npx next build` compiles + type-checks (11 routes)

---
*Phase: 01-secure-foundation-secrets-db-auth*
*Completed: 2026-06-05*
