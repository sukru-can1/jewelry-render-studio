---
phase: 02-product-workspace
plan: 04
subsystem: product-workspace
tags: [next-server-action, prisma, transaction, radio-group, popover, sonner, vitest, rbac, holdout-tokens]

# Dependency graph
requires:
  - phase: 02-product-workspace
    plan: 01
    provides: "suggestGroup (lib/tokens.ts), assignmentSchema (lib/validation/product.ts), parseInventory (lib/inventory.ts), ObjectGroupAssignment-row factory"
  - phase: 02-product-workspace
    plan: 03
    provides: "Product detail /products/[id] with Overview|Materials|Groups tabs + Groups mount-point, stored Inspection.inventory shape"
  - phase: 01-secure-foundation-secrets-db-auth
    provides: "requireSession RBAC boundary, prisma singleton, ObjectGroupAssignment model, shadcn primitives, sonner toaster"
provides:
  - "saveAssignments + loadAssignments Server Actions (lib/products/assignments.ts) — delete-and-recreate one row per non-empty group, signature tokens, status recompute"
  - "GroupAssignment client surface wired into the product-detail Groups tab (UI-SPEC §4)"
  - "Products list /products (recency-sorted card grid + reopen, PROD-05) replacing the Phase-1 placeholder"
  - "ProductCard component with the draft-inclusive status-pill mapping"
  - "Official shadcn radio-group + checkbox + command blocks (+ textarea/input-group command deps)"
affects: [batch-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delete-and-recreate one ObjectGroupAssignment row per non-empty group in a $transaction (RESEARCH Pattern 5) — empty groups skipped"
    - "objectTokens persisted as object SIGNATURES (lowercased name+material) = the exact holdout `contains` shape Phase 3 consumes (PROD-04, persist-only)"
    - "Server-component-returned JSX tested by walking the React element tree + react-dom/server renderToStaticMarkup (no DOM/testing-library dependency added)"
    - "Pure lib/tokens.suggestGroup imported into a client component for non-auto-applied suggestion hints"

key-files:
  created:
    - lib/products/assignments.ts
    - app/(app)/products/[id]/group-assignment.tsx
    - app/(app)/products/product-card.tsx
    - app/components/ui/radio-group.tsx
    - app/components/ui/checkbox.tsx
    - app/components/ui/command.tsx
    - app/components/ui/textarea.tsx
    - app/components/ui/input-group.tsx
    - test/assignment-save.test.ts
    - test/product-list.test.ts
  modified:
    - app/(app)/products/[id]/page.tsx
    - app/(app)/products/page.tsx

key-decisions:
  - "objectTokens are object signatures, never row ids — the Phase-3 holdout shape (PROD-04, persist-only; no recipe generation here)"
  - "saveAssignments delete-and-recreate per group in a transaction; empty groups are not persisted as rows"
  - "products list sorts by createdAt desc — there is NO updatedAt column on Product and no migration was added"
  - "status-pill mapping covers the schema default ('draft' -> neutral 'needs inspection') with a neutral fallback for unknown values so no value renders blank"

patterns-established:
  - "Sticky save bar appears only when the selection is dirty; Discard restores the loaded initial state"
  - "Token-assist bulk action shows a preview count and a toast Undo that restores the pre-action selection"

requirements-completed: [PROD-03, PROD-04, PROD-05]

# Metrics
duration: ~42min
completed: 2026-06-08
---

# Phase 2 Plan 04: Object→Group Assignment + Products List Summary

**Closes the Phase-2 workspace loop (create → upload → inspect → group → reopen): an operator assigns every detected object into alloycolour/diamond/stone2/stone3 (token-assist suggestions, bulk *metal* action, sticky save) and the saved per-group signature-token rows are the exact holdout-pass shape Phase 3 consumes (PROD-04); the products list shows a recency-sorted card grid with draft-inclusive status pills and whole-card reopen (PROD-05).**

## Performance
- **Duration:** ~42 min
- **Completed:** 2026-06-08
- **Tasks:** 3 of 3
- **Files created/modified:** 12

## Accomplishments
- Shipped `saveAssignments` + `loadAssignments` Server Actions (`lib/products/assignments.ts`, `"use server"`):
  - `requireSession()` first line (T-02-17); `assignmentSchema` validates the group keys against the zod enum before any write (T-02-18) — an unknown group key rejects with `{ ok:false, issues }` and NO write.
  - `prisma.$transaction([ deleteMany({where:{productId}}), createMany({ data: <one row per non-empty group> }) ])` — delete-and-recreate per RESEARCH Pattern 5; empty groups are skipped.
  - `objectTokens` are the provided object SIGNATURES (PROD-04) — asserted in the test to never be a cuid; these are exactly the `contains` tokens Phase-3 holdout will match. No recipe generation here (deferred to Phase 3).
  - Recomputes `Product.status` from the latest inspection inventory (clearly-stone-mesh coverage) and `revalidatePath`.
  - `loadAssignments` returns a `{ group: tokens }` map that round-trips a save (hydrates the Groups tab on revisit).
- Built the `GroupAssignment` client surface (UI-SPEC §4) and wired it into the product-detail Groups tab: per-object 5-option radio-group picker with group-colored chips, dotted-teal `Suggested: {group} → Accept` hints from `suggestGroup` (never auto-applied), a Token-assist bulk action (`Assign all matching *metal* → alloycolour`) with a preview count + toast Undo, a Group-meaning helper popover, the intro hint, a non-blocking incomplete-on-save note, and a sticky Save groups / Discard bar that calls `saveAssignments` and toasts "Groups saved." + refreshes the status pill.
- Replaced the Phase-1 `/products` placeholder with the real list (PROD-05): async Server Component, `requireSession()` first, `findMany({ orderBy:{createdAt:"desc"}, include:{_count:{select:{assignments:true}}} })`, header with count + New product CTA, responsive 3/2/1-up grid of `ProductCard`, plus empty + error states.
- Built `ProductCard` (whole-card link reopen, 160×160 placeholder glyph, mono filename, relative created-at) with a draft-inclusive status-pill mapping and a neutral fallback for unknown values.
- Added the official shadcn `radio-group`, `checkbox`, `command` blocks (T-02-SC — official registry only); `command` pulled in `textarea` + `input-group` as first-party deps.

## Task Commits
1. **Task 1: saveAssignments + load + tokens test (TDD)** — `79bf338` (test, RED) → `047cdcb` (feat, GREEN)
2. **Task 2: Group-assignment surface (Groups tab) + token-assist** — `4ceb70a` (feat)
3. **Task 3: Products list + product card (PROD-05)** — `262e1c0` (feat)

_TDD gate compliance: Task 1 has a `test(...)` RED commit before its `feat(...)` GREEN commit._

## ASSUMPTION — 'ready' readiness rule (RESEARCH Open Q4) — PHASE 3 MUST REVISIT
The `recomputeStatus` heuristic used by `saveAssignments` — **'ready' iff `alloycolour` has ≥1 token AND no clearly-stone mesh is left unassigned, else 'needs_groups'** — is an **ASSUMED contract, not a confirmed one**, carried from RESEARCH Open Q4. A "clearly-stone" mesh is detected via `suggestGroup(signature) ∈ {diamond, stone2, stone3}`. Phase 3 **MUST revisit/confirm this readiness definition** when it consumes the persisted token shape for holdout passes, so a later phase does not silently inherit an unvalidated readiness rule (e.g. whether decorative/other meshes should block 'ready', or whether all four groups must be present). This is recorded here per the plan's explicit instruction.

## Deviations from Plan
### Auto-fixed Issues
**1. [Rule 1 - Bug] Task-1 RED test inventory fixture had the wrong shape**
- **Found during:** Task 1 (GREEN run)
- **Issue:** The test's inline inventory used `{ name, signature }` objects, but `parseInventory` filters to `type: "MESH"` and recomputes the signature from `material_slots`. The non-MESH-shaped objects were filtered out, so `signatures = []`, and the status-recompute "stone mesh left unassigned" branch wrongly returned 'ready'.
- **Fix:** Shaped the fixture as raw `inspect_materials` output (`type:"MESH"`, `material_slots:[...]`) so `parseInventory` computes `"band_metal gold"` / `"center_diamond glass"`. This is a test-correctness fix (the implementation was already correct), committed with the GREEN feat commit.
- **Files modified:** `test/assignment-save.test.ts`
- **Commit:** `047cdcb`

## Threat Model Compliance
- **T-02-17 (Spoofing, saveAssignments):** `requireSession()` is the first line; `assignmentSchema` (group enum) validates before any write.
- **T-02-18 (Tampering, injected group/token):** unknown group keys are rejected by the zod enum with no write; `objectTokens` stored as opaque strings.
- **T-02-19 (IDOR, reopen + list):** accepted per the threat register (single-tenant internal team; per-workspace ownership is a v2 concern). `requireSession()` is still required on both the list page and (from Plan 02-03) the detail page.
- **T-02-20 (stored XSS, names):** object/product/material names render as plain React text (mono) — React escapes; no `dangerouslySetInnerHTML`.
- **T-02-SC (shadcn supply chain):** `radio-group`/`checkbox`/`command` added from the official shadcn registry only.

## Verification Results
- `npx vitest run test/assignment-save.test.ts` — **7/7 green** (deleteMany→createMany, one-row-per-non-empty-group, PROD-04 signature shape, zod reject, ready/needs_groups both branches, loadAssignments round-trip).
- `npx vitest run test/product-list.test.ts` — **4/4 green** (orderBy createdAt desc + _count include asserted, empty state, draft→neutral pill, unknown-status fallback).
- `npx vitest run` — **19 files, 107 tests, all green**.
- `npx tsc --noEmit` — exit 0.
- `npx next build` — compiles; `/products/[id]` 7.12 kB, `/products` route emitted.

## Known Stubs
- **ProductCard thumbnail** renders a placeholder glyph — the worker produces no model thumbnail (a model-preview render is a later-phase concern). Any real thumbnail would be delivered via the authed `/api/file` proxy, never a public url. Does not block PROD-05's goal (browse + reopen are fully functional).
- **Token-assist** ships the one `*metal* → alloycolour` bulk action from UI-SPEC §4; the `command`-based free-text token search is available as a component but not surfaced this slice (the per-object `suggestGroup` hints + the metal bulk action cover the assignment workflow). Not goal-blocking.

## Self-Check: PASSED
- Created files verified present: `lib/products/assignments.ts`, `app/(app)/products/[id]/group-assignment.tsx`, `app/(app)/products/product-card.tsx`, `app/components/ui/radio-group.tsx`, `app/components/ui/checkbox.tsx`, `app/components/ui/command.tsx`, `test/assignment-save.test.ts`, `test/product-list.test.ts` — all FOUND.
- Commits verified in `git log`: `79bf338` (RED), `047cdcb` (Task 1 GREEN), `4ceb70a` (Task 2), `262e1c0` (Task 3) — all FOUND.
