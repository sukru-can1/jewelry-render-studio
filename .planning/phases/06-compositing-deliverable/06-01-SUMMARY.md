---
phase: 06-compositing-deliverable
plan: 01
subsystem: compositing
tags: [compositing, sharp, flatten, deliverable, COMP-02, blob-only]
requires:
  - "Phase 5 Layer rows (one per completed angle×metal×pass job, url=blob pathname, combo via Job)"
  - "lib/blob.ts putPrivate/privateUrl (SEC-02 private storage)"
  - "lib/auth/rbac requireSession (auth boundary)"
  - "lib/gallery/group.ts LayerCombo type"
provides:
  - "lib/compositing/variants.ts groupVariantsForCompositing() + Variant/CompositingLayer/LayerWithCombo types"
  - "lib/compositing/validate.ts validateVariant() + FlattenWarning type"
  - "lib/compositing/flatten.ts flattenVariant() (sole sharp importer)"
  - "lib/compositing/deliverable.ts deliverablePathname()/deliverablePrefix() (imported by Plan 03 zip discovery)"
  - "app/(app)/batches/[id]/flatten/route.ts POST per-variant flatten (COMP-02)"
affects:
  - "06-02 compositing UI (consumes the variant grouping + flatten route)"
  - "06-03 batch zip (imports deliverablePrefix for list({prefix}) discovery)"
tech-stack:
  added: []
  patterns:
    - "PURE compositing logic (grouping + validation gate) with sharp/blob/prisma at the route edge"
    - "blob-only deliverable persistence at a deterministic pathname (no DB Layer row)"
    - "private layer-byte read via get(access:'private') → Readable.fromWeb → Buffer for sharp"
key-files:
  created:
    - lib/compositing/variants.ts
    - lib/compositing/validate.ts
    - lib/compositing/flatten.ts
    - lib/compositing/deliverable.ts
    - app/(app)/batches/[id]/flatten/route.ts
    - test/comp-variant-group.test.ts
    - test/comp-zorder.test.ts
    - test/comp-validate.test.ts
    - test/comp-flatten-route.test.ts
    - test/comp-flatten-idempotent.test.ts
    - test/comp-flatten-auth.test.ts
  modified:
    - test/orch-db-only.test.ts
    - test/blob-guard.test.ts
decisions:
  - "Deliverable persistence is BLOB-ONLY (Task 1 checkpoint default, authoritative): renders/<batchId>/deliverables/<angle>_<metal>.png via putPrivate(allowOverwrite:true); NO Layer row (Layer.jobId @unique + required FK to Job.id makes a synthetic deliverable jobId infeasible)"
  - "Compositing variant key is (angleKey × metalKey) in a NEW pure fn — NOT group.ts's variant mode (which ignores angle)"
  - "Overlay z-order = (sortOrder ?? Infinity, stoneGroup) ascending; base = the single metal pass"
  - "Validation gate WARNs (200 {ok:false,warnings}) and writes NOTHING — never a silent flatten"
metrics:
  duration: 10min
  tasks: 3
  files: 13
  completed: 2026-06-09
---

# Phase 6 Plan 01: Server Flatten Core (COMP-02) Summary

Built the COMP-02 server flatten core: two PURE primitives (`groupVariantsForCompositing` keyed on angle×metal + `validateVariant` warning gate), a sole-sharp-importer orchestration helper (`flattenVariant`), and an auth-gated, IDOR-scoped, idempotent per-variant flatten route that reads private layer Buffers, hard-blocks on the validation gate (writing nothing), composites in deterministic z-order, and persists the deliverable blob-only.

## What Was Built

- **`lib/compositing/variants.ts`** — PURE `groupVariantsForCompositing(rows)`: buckets layers by `${angleKey}:${metalKey}`, base = the single `pass:"metal"` layer, overlays = every `pass:"stone"` layer sorted by `(sortOrder ?? Infinity, stoneGroup)`. Reuses `LayerCombo` from group.ts; wrong-keyed rows collapse to one `undefined:undefined` bucket. Exports `Variant`, `CompositingLayer`, `LayerWithCombo`.
- **`lib/compositing/validate.ts`** — PURE `validateVariant({base?, overlays[], minAlphaMean?})` → `FlattenWarning[]`. Codes: `missing-base`, `dimension-mismatch` (with expected/actual detail), `empty-layer` (alphaMax 0 OR alphaMean < threshold), `no-overlays` (advisory). Empty array = PASS. No sharp/blob/prisma imports.
- **`lib/compositing/flatten.ts`** — `flattenVariant(variant, fetchLayer, opts)`. The ONLY module importing `sharp`. Fetches base + overlay Buffers via an injected fetcher, reads `metadata()`/`stats()` (alpha from `channels[3]`, falls back to opaque when no alpha channel), hands plain numbers to `validateVariant`; on PASS composites `sharp(base).composite([{input,blend:"over"}]).png().toBuffer()`; on FAIL returns `{ok:false,warnings}` and composites nothing. `?force` drops the advisory `no-overlays` block for base-only flattens.
- **`lib/compositing/deliverable.ts`** — PURE `deliverablePathname(batchId,angle,metal)` and `deliverablePrefix(batchId)`. Sanitizes the `<angle>_<metal>` stem (strips CR/LF/quotes/separators/`..`). Imported by Plan 03's zip discovery.
- **`app/(app)/batches/[id]/flatten/route.ts`** — `POST`, `runtime="nodejs"`. `requireSession()` first (401), IDOR-scope batch by `params.id` (404), derives the variant's layers from completed-job Layer rows (never caller pathnames), reads each layer privately via `get(access:'private')` → `Readable.fromWeb` → Buffer, runs `flattenVariant`. Gate FAIL → 200 `{ok:false,warnings}` NO write; PASS → `putPrivate(deliverablePathname, buf, {allowOverwrite:true, contentType:"image/png"})` → 200 `{ok:true, deliverable:{url:privateUrl(...), format, width, height}}`. No Layer DB row.

## Task Commits

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Decide deliverable persistence | (decision, no code) | — |
| 2 | PURE variants + validation gate + RED tests | 9a6ad6a | variants.ts, validate.ts, comp-variant-group/zorder/validate tests |
| 3 | sharp flatten helper + flatten route + RED tests + guards | 8402011 | flatten.ts, deliverable.ts, flatten/route.ts, comp-flatten-route/idempotent/auth tests, orch-db-only + blob-guard extended |

## Decisions Made

- **Task 1 (persistence) resolved to BLOB-ONLY** per the execution brief's authoritative direction (the checkpoint defaults to blob-only; no pause). Deliverables live at `renders/<batchId>/deliverables/<angle>_<metal>.png` via `putPrivate(allowOverwrite:true)`. No `Layer` row is created — `Layer.jobId` is `@unique` AND a required FK to `Job.id`, so a synthetic deliverable jobId is infeasible and reusing the metal job's id collides with its source layer. Re-flatten is idempotent by overwriting the same deterministic pathname. Discovery (06-02/06-03) is via `list({prefix})`, never `Layer.isFlattened`.

## Deviations from Plan

None beyond a test-fixture correction during Task 3: the route consumes each private-blob `ReadableStream` once, so the mocks were switched from a single shared `mockResolvedValue(blobStream())` to `mockImplementation(async () => blobStream())` to hand each `get()` call a fresh, unlocked stream. This is a test-only fix; the route code is unchanged.

## Verification

- `npx vitest run comp-variant-group comp-zorder comp-validate comp-flatten-route comp-flatten-idempotent comp-flatten-auth orch-db-only blob-guard` — all GREEN (per-task runs confirmed).
- Full suite: `npx vitest run` → **44 files, 243 tests, all passing.**
- `npx tsc --noEmit` → **exit 0.**
- `npx next build` → **Compiled successfully; route `/batches/[id]/flatten` emitted** (exit 0).
- `flatten.ts` is the only module importing `sharp` (grep-verified across `lib/` and `app/`).
- Persistence decision recorded (blob-only) before any writer was built.

## Known Stubs

None. The flatten core is fully wired (real grouping, real gate, real sharp composite path, real private blob persistence). The COMP-01 compositing page and the COMP-03 batch-deliverables zip are out of scope for this Wave-0 plan (Plans 06-02 / 06-03).

## Self-Check: PASSED

Created files verified present:
- lib/compositing/variants.ts, validate.ts, flatten.ts, deliverable.ts — FOUND
- app/(app)/batches/[id]/flatten/route.ts — FOUND
- test/comp-variant-group.test.ts, comp-zorder.test.ts, comp-validate.test.ts, comp-flatten-route.test.ts, comp-flatten-idempotent.test.ts, comp-flatten-auth.test.ts — FOUND

Commits verified in git log: 9a6ad6a, 8402011 — FOUND.
