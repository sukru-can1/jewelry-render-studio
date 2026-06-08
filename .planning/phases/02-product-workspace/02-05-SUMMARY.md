---
phase: 02-product-workspace
plan: 05
subsystem: domain-settings
tags: [server-actions, prisma, zod, rbac, shadcn, react-hook-form, vitest, data-04]

# Dependency graph
requires:
  - phase: 02-product-workspace
    plan: 01
    provides: "lib/validation/settings.ts zod schemas (UI-SPEC copy), seeded StoneType catalog (10 rows)"
  - phase: 01-secure-foundation-secrets-db-auth
    provides: "requireRole('Admin') RBAC boundary, Prisma singleton, shadcn seed library, Vitest harness, (app) shell + Toaster"
provides:
  - "lib/settings/actions.ts — saveCameraViews/saveMetals/saveStoneTypes/saveQualityPresets (Admin-gated, zod-validated, transactional)"
  - "Editable /admin/settings surface (upgrades Phase 1 read-only view)"
  - "settings-forms.tsx — tabbed editable grids (camera/metals/stones/quality) with sticky save + inline validation copy"
affects: [batch-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settings Server Action is the AUTHORITATIVE boundary: requireRole('Admin') first line, 403 mapped to { ok:false, forbidden:true } (defense-in-depth over page redirect)"
    - "Editable list semantics: upsert present keys + deleteMany notIn(present keys) inside one $transaction (StoneType add/remove round-trip)"
    - "Client validates with the SAME lib/validation schemas the action uses, so inline error copy === UI-SPEC copy verbatim"

key-files:
  created:
    - lib/settings/actions.ts
    - app/(app)/admin/settings/settings-forms.tsx
    - app/components/ui/tabs.tsx
    - app/components/ui/popover.tsx
    - test/settings-edit.test.ts
  modified:
    - app/(app)/admin/settings/page.tsx

key-decisions:
  - "Save action is the security boundary (AUTH-05): requireRole('Admin') is line 1 of every action; the page redirect is convenience only — an Operator who reaches the action gets { forbidden } and zero writes."
  - "StoneType is an editable list: deleteMany({ key: { notIn } }) + per-row upsert in a single $transaction so the catalog never lands half-applied."
  - "Used controlled React state + zod array().safeParse client-side (not full react-hook-form resolver wiring) — matches the existing create-user-dialog controlled pattern and keeps error paths trivially mappable to inline copy."
  - "Prisma Json input type (preset) required an InputJsonValue cast — Record<string, unknown> is not assignable to Prisma's NullableJsonNullValueInput."

patterns-established:
  - "deniedToForbidden(err): catch the requireRole 401/403 Response and fail closed with { ok:false, forbidden:true }; re-throw anything else."
  - "validateRows<T>(rows, schema): per-row validate, return flattened issues on first failure, write nothing."

requirements-completed: [DATA-04]

# Metrics
duration: 23min
completed: 2026-06-08
---

# Phase 2 Plan 05: Domain Settings EDIT Summary

**Upgraded the Phase 1 read-only domain-settings view to Admin-editable forms (camera views, metals, stone types, quality presets) backed by four Admin-gated, zod-validated, transactional Server Actions — an Operator is blocked server-side, not just in the UI.**

## Performance
- **Duration:** ~23 min
- **Started:** 2026-06-08T12:49Z
- **Completed:** 2026-06-08T13:12Z
- **Tasks:** 2 of 2
- **Files created/modified:** 6

## Accomplishments
- Shipped `lib/settings/actions.ts` with four save actions. Each begins with `requireRole("Admin")` (AUTH-05 / T-02-09) and maps a 403 Response to a fail-closed `{ ok:false, forbidden:true }` with no Prisma write. Every row is zod-validated against the Plan 02-01 schemas (T-02-10) before any write, surfacing the exact UI-SPEC error copy.
- `saveStoneTypes` round-trips the editable catalog: it `deleteMany({ key: { notIn: presentKeys } })` and upserts each present row inside one `$transaction`, so the operator can add and remove rows.
- Upgraded `/admin/settings` to render the editable `<SettingsForms/>` client component while keeping its `requireRole("Admin")`-then-`redirect("/forbidden")` guard unchanged; added `prisma.stoneType.findMany` to the existing `Promise.all`.
- Built `settings-forms.tsx`: tabbed sections (camera / metals / stones / quality) with a number-field grid (az/el/focal/fstop), a metal label + 24px swatch popover + mono hex editor, an add/remove stone-type list, and editable quality sample counts. A sticky save bar appears when a section is dirty, with the "Changes apply to new batches, not to renders already created." note and the success/forbidden/failure toasts.
- Added the `tabs` and `popover` shadcn blocks from the official registry only (T-02-SC).

## Task Commits
1. **Task 1: Settings Server Actions (TDD)** — `0cab12a` (test, RED) → `7b8c17d` (feat, GREEN)
2. **Task 2: Editable settings surface + shadcn tabs/popover** — `58f3abf` (feat)

_TDD gate compliance: Task 1 has a `test(...)` RED commit before its `feat(...)` GREEN commit._

## Files Created/Modified
- `lib/settings/actions.ts` — four Admin-gated, zod-validated, transactional save actions.
- `app/(app)/admin/settings/page.tsx` — renders `<SettingsForms/>`; `Promise.all` now reads `stoneType` (replaced `objectGroup`).
- `app/(app)/admin/settings/settings-forms.tsx` — tabbed editable grids + sticky save + inline copy.
- `app/components/ui/tabs.tsx`, `app/components/ui/popover.tsx` — official shadcn blocks.
- `test/settings-edit.test.ts` — 12 tests (Admin saves; Operator 403 no-write; invalid focal/fstop/hex rejected; stone add/remove round-trip).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma Json input type rejects `Record<string, unknown>`**
- **Found during:** Task 1 (GREEN, tsc)
- **Issue:** `prisma.stoneType.upsert` rejected `preset: s.preset ?? undefined` — Prisma's `NullableJsonNullValueInput | InputJsonValue` is stricter than the schema's `Record<string, unknown>`, so `tsc --noEmit` failed.
- **Fix:** Cast the validated preset to `Prisma.InputJsonValue | undefined` (imported `type { Prisma } from "@prisma/client"`); behavior unchanged.
- **Files modified:** `lib/settings/actions.ts`
- **Commit:** `7b8c17d`

**Note (not a deviation):** The plan listed `objectGroup` implicitly via the Phase 1 page; per the plan's explicit instruction the read set now includes `stoneType` (which the StoneType seed made non-empty). `objectGroup` is no longer read on this page — it has no editable surface in DATA-04 and the read-only Object Groups section was intentionally dropped from the editable view.

## Threat Surface Scan
No new trust-boundary surface beyond the plan's threat model. All four mitigations are implemented: requireRole('Admin') first-line (T-02-09), per-row zod validation (T-02-10), React text-escaped keys/labels with no `dangerouslySetInnerHTML` (T-02-11), official-registry-only shadcn add (T-02-SC).

## Known Stubs
None — all four save actions and form sections are fully wired to live data and the Server Actions.

## Verification Results
- `npx vitest run test/settings-edit.test.ts` — 12 tests green (Admin saves; Operator 403 no-write; invalid focal/fstop/hex rejected with UI-SPEC copy; stone add/remove round-trip).
- `npx vitest run` — **16 files, 89 tests, all green** (no regression).
- `npx tsc --noEmit` — exit 0.
- `npx next build` — compiles; `/admin/settings` route built (18.7 kB).

## Self-Check: PASSED
- Created files verified present: `lib/settings/actions.ts`, `app/(app)/admin/settings/settings-forms.tsx`, `app/components/ui/tabs.tsx`, `app/components/ui/popover.tsx`, `test/settings-edit.test.ts` — all FOUND.
- Commits verified in `git log`: `0cab12a`, `7b8c17d`, `58f3abf` — all FOUND.
