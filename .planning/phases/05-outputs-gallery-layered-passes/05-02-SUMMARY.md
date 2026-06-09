---
phase: 05-outputs-gallery-layered-passes
plan: 02
subsystem: outputs-layers
tags: [recipe, transparency, holdout, orchestration, idempotent, backfill, tdd-green]
requires:
  - "Plan 01: Layer.jobId @unique (idempotent prisma.layer.upsert)"
  - "Plan 01 RED scaffolds: out-stone-transparency.test.ts, out-layer-derive.test.ts"
  - "Phase 4 webhook persists Job.result (lib/orchestration/webhook.ts COMPLETED branch)"
  - "lib/batches/expand.ts Combo (pass + stoneGroup) persisted on Job.combo"
provides:
  - "Stone-pass transparent single-group holdout recipes (render.transparent + ONLY-stone-group include + metal-excluded + studio_background off)"
  - "deriveLayerFromResult(jobId, combo, output) — idempotent Layer upsert by jobId (private pathname, SEC-02)"
  - "Layer creation hooked into the shared completion writer (webhook + reconcile)"
  - "backfillCompletedLayers() — idempotent backfill of pre-existing completed jobs"
affects:
  - "Plan 04 gallery: reads the Layer rows this plan creates"
  - "Plan 03: disjoint (/api/file + zip route) — not touched"
tech-stack:
  patterns:
    - "render.transparent + studio_background.enabled are now pass-dependent (stone => transparent + no bg)"
    - "include_contains as a hard allow-list: stone pass includes ONLY the target group's tokens"
    - "Layer derivation runs in the single completion writer; reconcile replays through it for free"
    - "Prisma.DbNull required for { not: <null> } on a Json field (Job.result)"
key-files:
  created:
    - "lib/orchestration/layers.ts"
    - "lib/orchestration/backfill-layers.ts"
  modified:
    - "lib/enterprise-recipes.ts"
    - "lib/orchestration/webhook.ts"
    - "test/out-stone-transparency.test.ts"
    - "test/out-layer-derive.test.ts"
decisions:
  - "Stone-pass include = ONLY the target stoneGroup tokens (removed the ...metalTokens spread); exclude = alloycolour metal tokens — a precise single-group transparent holdout (D-1)."
  - "render.transparent and postprocess.studio_background.enabled made pass-dependent (stone => transparent true / bg off; metal/full => opaque / bg on). NO worker edit — render_scene.py already honors render.transparent (film_transparent, line 751)."
  - "Metal-pass literal JPEG explicitly DEFERRED (would need a worker change); metal stays opaque PNG."
  - "deriveLayerFromResult takes combo as an ARGUMENT (per the Plan-01 test signature) rather than re-reading it from the DB; the webhook caller looks up job.id + job.combo post-updateMany since the webhook body is keyed by runpodJobId only."
  - "Layer.url stores the blob PATHNAME, never the worker-supplied public image_url (SEC-02 / T-05-02 / T-05-03); gallery builds the /api/file proxy URL from it."
  - "backfill uses Prisma.DbNull for the Job.result not-null filter (plain null fails tsc on a Json field)."
metrics:
  duration: 14min
  tasks: 2
  files: 6
  completed: 2026-06-09
---

# Phase 5 Plan 02: Layered-Pass Transparency + Layer Derivation Summary

Made stone passes render as true single-group transparent-PNG holdouts at the recipe
level (no worker change) and turned every completed job into exactly one idempotent
`Layer` row — for future completions (shared webhook/reconcile writer) and past ones
(one-shot backfill). Both Plan-01 RED scaffolds are now GREEN.

## What Was Built

- **Task 1 — Stone-pass transparency (OUT-01, D-1):** In `lib/enterprise-recipes.ts`
  `buildVisibility`, the stone branch now sets `include` = ONLY the target stone group's
  tokens (the `...metalTokens` spread was REMOVED) and `exclude` = the alloycolour metal
  tokens — a precise single-group holdout. `render.transparent` and
  `postprocess.studio_background.enabled` are now pass-dependent: stone => transparent
  true + bg off; metal/full => opaque + bg on. The `full` pass is unchanged. Strengthened
  the test to assert, per stone group (diamond/stone2/stone3): include non-empty +
  metal-disjoint + contains the group tokens, exclude ⊇ metal tokens, transparent true,
  studio_background off; plus metal-pass opaque/bg-on and full unchanged.
- **Task 2 — Layer derivation + backfill (OUT-01, D-2):** New `lib/orchestration/layers.ts`
  `deriveLayerFromResult(jobId, combo, output)` maps the worker output to a Layer
  (url=image_blob.pathname, metadataUrl=metadata_key/pathname, pass from combo, format
  derived from content_type) and `upsert`s on `{jobId}` — idempotent against
  duplicate/late callbacks, skips silently on missing pathname. Hooked into the
  `webhook.ts` COMPLETED branch (which looks up the job's id+combo post-updateMany);
  `reconcile.ts` replays through the same writer, so the cron fallback gets layer
  creation for free. New `lib/orchestration/backfill-layers.ts` `backfillCompletedLayers()`
  replays completed jobs that have a result but no Layer through the same idempotent
  upsert.

## Verification Results

- `npx vitest run out-stone-transparency` — 5 passed (per-group assertions).
- `npx vitest run out-layer-derive` — 2 passed (mapping + idempotency).
- `npx vitest run` (full) — 207 passed; 3 failing in 4 files are RED scaffolds for OTHER
  plans (out-gallery-group/query = Plan 04; out-file-download/out-zip-route = Plan 05-03),
  disjoint and out of scope per the wave plan. No webhook/reconcile regressions.
- `npx tsc --noEmit` — exit 0.
- `npx next build` — succeeds (all routes compiled).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma Json not-null filter fails tsc**
- **Found during:** Task 2 (`next build` type-check)
- **Issue:** `result: { not: null }` on the Json field `Job.result` is a type error —
  Prisma requires the `Prisma.DbNull` sentinel for JSON-null filters.
- **Fix:** Imported `Prisma` from `@prisma/client` and used `{ not: Prisma.DbNull }`.
- **Files modified:** lib/orchestration/backfill-layers.ts
- **Commit:** 14cb653

### Note: combo as argument
The Plan-01 RED test fixed the signature `deriveLayerFromResult(jobId, combo, output)`
(combo passed in), so the helper takes combo as an argument rather than re-reading it
from the DB. The webhook caller does the one extra `findFirst` (id + combo) because the
webhook body is keyed only by `runpodJobId`. Reconcile inherits this for free.

## Known Stubs

None. Stone-group tokens MUST resolve to real object signatures or the hard include
allow-list yields an empty render — flagged in code; the BINDING alpha/no-bleed proof is
the live manual render (05-VALIDATION row), not the unit test (which only sees flags).

## Threat Flags

None. T-05-01 (duplicate webhook), T-05-02/03 (worker url → Layer.url) are mitigated as
planned: upsert on the unique jobId; Layer.url stores only the private pathname.

## Self-Check: PASSED

- lib/orchestration/layers.ts — FOUND
- lib/orchestration/backfill-layers.ts — FOUND
- commit 14e0551 (Task 1 stone transparency) — FOUND
- commit 14cb653 (Task 2 layer derivation + backfill) — FOUND
