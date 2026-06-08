---
phase: 03-batch-builder-with-cost-guardrails
plan: 03
subsystem: batch-builder
tags: [ui, rsc, client-form, cost-guardrails, shadcn, estimate-panel, server-action]
requires:
  - lib/batches/estimate.ts (BATCH_LIMITS + countJobs + estimate + zone)
  - lib/batches/binding.ts (isSupportedStoneType)
  - lib/batches/actions.ts (createBatch Server Action)
  - lib/validation/batch.ts (createBatchSchema shape)
  - lib/products/assignments.ts (loadAssignments -> GroupTokenMap)
provides:
  - app/components/ui/toggle-group.tsx + app/components/ui/alert.tsx (+ toggle.tsx dep)
  - lib/batches/builder-data.ts (isBuildable / presentStoneGroups / supportedStoneTypes)
  - app/(app)/products/[id]/batches/new/page.tsx (RSC builder page + no-assignment guard)
  - app/(app)/products/[id]/batches/new/batch-builder.tsx (client builder)
  - app/(app)/products/[id]/batches/new/estimate-panel.tsx (live cost panel)
  - app/(app)/products/[id]/build-batch-button.tsx (product-detail entry)
affects:
  - Phase 4 (success navigates to the reserved /batches/[batchId] jobs surface)
tech-stack:
  added:
    - "shadcn toggle-group + alert (+ toggle) — official registry, radix-ui umbrella import convention"
  patterns:
    - "RSC page: requireSession first, live Admin-editable domain reads, pure data-prep branch (builder-data.ts) for testability"
    - "client builder consumes the single-source BATCH_LIMITS/countJobs/estimate/zone — no redefined thresholds"
    - "debounced (~120ms) live estimate; zone escalation idle->safe->warn->block via inherited status tokens"
    - "soft-threshold confirm dialog + hard-cap blocking alert + disabled submit; submitting state as duplicate-submit guard"
key-files:
  created:
    - app/components/ui/toggle-group.tsx
    - app/components/ui/toggle.tsx
    - app/components/ui/alert.tsx
    - lib/batches/builder-data.ts
    - app/(app)/products/[id]/batches/new/page.tsx
    - app/(app)/products/[id]/batches/new/batch-builder.tsx
    - app/(app)/products/[id]/batches/new/estimate-panel.tsx
    - app/(app)/products/[id]/build-batch-button.tsx
    - test/batch-builder.test.ts
  modified:
    - app/(app)/products/[id]/page.tsx
decisions:
  - "The RSC page's branch + selector shape live in a pure builder-data.ts module so the no-assignment guard / present-group / supported-subset logic is unit-tested in the existing harness style (the page wires the prisma reads; the helper decides the shape)"
  - "Buildable = status \"ready\" AND >=1 saved assignment row — mirrors the createBatch readiness guard so the UI never offers a path the server will reject"
  - "Stone-type picker is filtered to isSupportedStoneType BEFORE reaching the client (T-03-11) — an unmappable type is never offered, and the server still re-validates"
  - "Estimate panel reads BATCH_LIMITS/countJobs/estimate/zone from lib/batches/estimate.ts only — no divergent threshold constant (T-03-10)"
  - "Success navigates to the reserved /batches/{batchId} Phase 4 surface and also shows the toast with a View jobs action, so creation is confirmed even before P4 exists"
metrics:
  duration: ~25 min
  completed: 2026-06-08
---

# Phase 03 Plan 03: Batch Builder UI + Live Cost Guardrail Summary

The operator-facing vertical slice that makes the cost guardrail real and visible: an RSC
builder page that loads the live Admin-editable domain and the product's saved assignment
(with a no-assignment empty-state guard), a client builder with multi-select angle/metal/pass
chips, a per-present-group stone-type picker restricted to generator-supported types, a
preview-default quality select, and the always-on live estimate panel that escalates
neutral→success→amber→red, routes through a confirm dialog above the soft threshold, and
blocks submit above the hard cap. Submit calls the Wave-1 `createBatch` action; a "Build batch"
entry point launches it from product detail.

## What Was Built

- **shadcn `toggle-group` + `alert`** (+ `toggle` dependency) added via the official registry
  (`npx shadcn@latest add toggle-group alert`); all three landed in `app/components/ui/` using
  the repo's established `radix-ui` umbrella-import convention (no third-party registry — §Registry Safety / T-03-SC).
- **`lib/batches/builder-data.ts`** (pure) — `isBuildable(status, rowCount)`, `presentStoneGroups(assignments)`
  (groups with >=1 saved token, canonical order), `supportedStoneTypes(catalog)` (filtered by
  `isSupportedStoneType`). Single source for the page's branch + selector shape; no Prisma/React so it's unit-testable.
- **`app/(app)/products/[id]/batches/new/page.tsx`** (RSC, `nodejs` + `force-dynamic`) —
  `requireSession()` first line; `product.findUnique({ include: assignments })`; `notFound()` if
  missing; renders the centered **no-assignment empty state** (heading "This product isn't ready
  for a batch" + [Go to groups]) when not buildable; otherwise loads the four domain tables +
  `loadAssignments` in parallel and hands the trimmed domain + present groups + supported stone
  subset to `<BatchBuilder/>`.
- **`estimate-panel.tsx`** (client) — the 40px Geist-Mono big number (the declared typographic
  exception), "jobs" label, formula line, ~min·~$ at 20px mono with the basis tooltip, and a
  per-zone frame (idle/neutral, safe/emerald, warn/amber, block/destructive). The number stays
  high-contrast `--foreground` except over-hard-cap where it renders `--destructive`.
- **`batch-builder.tsx`** (`"use client"`) — Angles + Metals (16px hex swatch) + Passes as
  multi-select toggle-groups (defaults: first view, white/first metal, metal-only + every present
  stone pass ON; each enforces ≥1); a stone-type `Select` row per PRESENT group over the supported
  subset (BATCH-03 — stone type never multiplies the count); a Quality `Select` defaulting to
  **preview** (BATCH-06); a matrix-summary read-back; the debounced (~120ms) live estimate;
  invalid → big number "—" + disabled submit; safe → one-click `createBatch`; warn → confirm
  dialog "Create N jobs?"; block → destructive blocking alert + disabled submit; submitting state
  disables selectors + submit (duplicate-submit guard); success toast + reserved `/batches/{id}`
  nav; transactional error banner preserving the selection.
- **`build-batch-button.tsx`** + product-detail wiring — primary "Build batch" link enabled iff
  `status === "ready"`, otherwise disabled with the groups-first tooltip; rendered in the product
  header next to the status badge (additive; tabs untouched).

## Requirements Delivered

- **BATCH-01** — multi-select angles over the live `CameraView` domain + the "Build batch" entry point.
- **BATCH-02** — multi-select metals over the live `Metal` domain (hex swatches); present stone groups derived from the saved assignment.
- **BATCH-03** — per-present-group stone-type picker restricted to `isSupportedStoneType`; stone type sets material, not count.
- **BATCH-04** — pass selector = metal-only + one toggle per present stone group, ≥1 required.
- **BATCH-05** — always-on live estimate panel: count + ~min + ~cost, updates on every selection change.
- **BATCH-06** — preview default; SOFT(48) confirm dialog; HARD(200) blocking alert + disabled submit; client uses the shared `BATCH_LIMITS`.

## Verification

- `npx vitest run batch-builder --reporter=dot` → 7 passed.
- `npx vitest run` (full suite) → **166 passed (25 files)**.
- `npx tsc --noEmit` → exit 0.
- `npx next build` → success (exit 0); the `/products/[id]/batches/new` route is emitted (8.4 kB) with no route collision.

## Manual Visual Sign-Off — PENDING

This plan is `autonomous: false` solely because final sign-off includes a human VISUAL
check. All code is built and machine-verified; the following per UI-SPEC require a human at a
running app (`npm run dev`, a ready product with a saved assignment):

1. `/products/{ready-id}/batches/new` — teal-ringed selectable chips (default view1 + white),
   stone-type rows ONLY for present groups (supported types only), passes default ON, quality = Preview.
2. Live update of the mono big number + formula + ~min + ~cost on selection change; Preview→Ultra visibly raises cost/time.
3. Drive count past 48 → amber frame; "Create batch" opens the "Create N jobs?" confirm dialog.
4. Drive count past 200 → red frame, blocking alert names the levers, submit disabled.
5. Submit a small safe batch → success toast "Batch created — N jobs queued.", navigates to `/batches/{id}` (Phase 4 placeholder).
6. Builder URL for a non-ready product → the no-assignment empty state, no selectors.
7. Product detail: "Build batch" enabled on a ready product, disabled with the groups-first tooltip otherwise.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `toggle` component pulled in as a toggle-group dependency**
- **Found during:** Task 1 (`npx shadcn@latest add toggle-group alert`)
- **Issue:** The official registry's `toggle-group` block imports `toggleVariants` from a `toggle`
  component, so the CLI created `app/components/ui/toggle.tsx` alongside the two requested blocks.
- **Fix:** Kept `toggle.tsx` (it's a legitimate first-party dependency of `toggle-group`, official
  registry, matches the repo convention). Committed with Task 1. No third-party source introduced.
- **Files modified:** app/components/ui/toggle.tsx
- **Commit:** 38d109e

## Known Stubs

None. The `/batches/{batchId}` navigation target is an intentionally reserved Phase 4 route per
UI-SPEC §1/§4 (the toast still confirms creation), not a non-functional placeholder in this slice.

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. The builder holds no
authority — every mitigation (T-03-10 shared `BATCH_LIMITS`, T-03-11 supported-only picker, T-03-12
`requireSession` first line, T-03-13 submitting-state duplicate guard, T-03-SC official registry)
is implemented and the `createBatch` action re-validates and re-caps server-side.

## Self-Check: PASSED

- app/components/ui/toggle-group.tsx — FOUND
- app/components/ui/alert.tsx — FOUND
- lib/batches/builder-data.ts — FOUND
- app/(app)/products/[id]/batches/new/page.tsx — FOUND
- app/(app)/products/[id]/batches/new/batch-builder.tsx — FOUND
- app/(app)/products/[id]/batches/new/estimate-panel.tsx — FOUND
- app/(app)/products/[id]/build-batch-button.tsx — FOUND
- test/batch-builder.test.ts — FOUND
- commits 38d109e / 75b6ace / 12c90d9 — FOUND
