---
phase: 02-product-workspace
verified: 2026-06-08T18:05:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Large model upload round-trip to PRIVATE Blob"
    expected: "A real ~50MB .blend/.glb dragged into /products/new uploads directly to Vercel Blob with access:'private', the Product persists with the blob pathname (not a public URL), and the file is retrievable only via the auth-gated /api/file proxy (a logged-out fetch of the raw blob URL is denied)."
    why_human: "Requires a real Vercel Blob store, a real large binary, and network round-trip; cannot be exercised by the mocked unit suite."
  - test: "End-to-end real material inspection (worker reads the PRIVATE model)"
    expected: "Running Inspect on a product dispatches RunPod inspect_materials, the worker downloads the private model via the minted signed-GET URL, writes the inventory sidecar PRIVATELY (BLOB_ACCESS=private set on the RunPod endpoint), and pollInspection reads it back by pathname and renders detected MESH objects + BSDF values. REQUIRES: BLOB_ACCESS=private configured on the RunPod endpoint env (otherwise the worker WRITES a public sidecar — the read side is already private in code)."
    why_human: "Cross-service (RunPod <-> Blob) with a real GPU job and an operational env var that the test suite mocks away."
  - test: "Inspection inventory + group assignment visual render (UI-SPEC §3/§4)"
    expected: "The Materials tab shows the collapsible per-object Principled BSDF table; the Groups tab lets the operator route each object to alloycolour/diamond/stone2/stone3 with suggestion hints, save (sticky bar), and the saved groups round-trip on reopen with the status pill updated."
    why_human: "Visual/interaction correctness of the rendered surfaces; server-component JSX is structurally tested but appearance/flow is not."
---

# Phase 2: Product Workspace Verification Report

**Phase Goal:** An operator can turn a raw 3D model into a render-ready product end-to-end — upload, inspect materials, assign each detected object to a group, and reopen it later — and an Admin can edit the seeded domain settings.
**Verified:** 2026-06-08T18:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | Operator creates a product and uploads its 3D model (GLB/FBX/BLEND/OBJ/STL) via authenticated direct-to-Blob upload | ✓ VERIFIED | `lib/products/actions.ts:33` requireSession() first line, persists `modelUrl=pathname` (line 47), `status='needs_inspection'`; `model-dropzone.tsx:111-116` client `upload()` with `access:'private'` via `/api/blob/upload`; `app/api/blob/upload/route.ts:37` requireSession() in `onBeforeGenerateToken` + `access:'private'` (line 42); `modelFormatEnum` allowlist (`lib/validation/product.ts:12`). Tests: `test/product-create.test.ts` 5/5 (pathname-not-url, format reject, unauth fail-closed). |
| 2 | Operator runs inspection, sees detected objects/slots/BSDF, assigns each to a group and saves it to the product | ✓ VERIFIED | `lib/products/inspection.ts` startInspection dispatches `inspect_materials` with worker key + `inspections/<id>` prefix, persists `runpodJobId=res.id` (line 64); pollInspection reads sidecar PRIVATELY via `get(inventory_key,{access:'private'})` (line 107), parses MESH-only (`lib/inventory.ts:86`), stores on Inspection. Detail page `app/(app)/products/[id]/page.tsx:147-165` renders InspectPanel + GroupAssignment. Save via `saveAssignments` (`lib/products/assignments.ts:84`). Tests: `inspection-dispatch.test.ts` 7/7, `assignment-save.test.ts` 7/7. |
| 3 | The product's saved group assignment drives which objects are rendered or held out in each pass | ✓ VERIFIED (data linkage; consumption is Phase 3) | `lib/products/assignments.ts:98-106` persists ONE `ObjectGroupAssignment` row per non-empty group with `objectTokens` = object SIGNATURES (line 100). `test/assignment-save.test.ts:117` asserts tokens are signatures, never cuids — the exact `contains` holdout shape Phase 3 consumes. PROD-04 is persist-only this phase (no recipe generation); actual pass-driving is exercised in Phase 3. |
| 4 | Operator browses and reopens previously created products | ✓ VERIFIED | `app/(app)/products/page.tsx:103` `findMany orderBy createdAt desc` + `_count.assignments`; `product-card.tsx` whole-card `Link` to `/products/[id]`, draft-inclusive status pill (`draft` mapped line 19), neutral fallback (line 52). Tests: `test/product-list.test.ts` 4/4 (orderBy, empty state, draft pill, unknown fallback). |
| 5 | Admin views and edits domain settings (camera views, metals, stone types, quality presets); changes apply to new batches | ✓ VERIFIED | `lib/settings/actions.ts` four save actions each with `requireRole("Admin")` as first executable statement (lines 76,115,143,177), zod-validated per-row, transactional upserts; StoneType add/remove round-trip (deleteMany notIn + upsert, line 193-204). Operator 403 → `{forbidden:true}` no-write. `app/(app)/admin/settings/page.tsx:20` requireRole gate + reads 4 tables; `settings-forms.tsx` wires all four actions (lines 226,313,418,525). 10 StoneTypes seeded (`prisma/seed.ts:41-51`). Tests: `settings-edit.test.ts` 12/12 (Admin saves, Operator no-write, focal/fstop/hex rejects, stone round-trip). |
| 6 | (Phase req) PROD-01 upload is PRIVATE end-to-end; inventory read is PRIVATE by pathname (SEC-02 fidelity) | ✓ VERIFIED | `lib/blob.ts:51` workerModelUrl = `issueSignedToken` + `presignUrl` (no public fallback — comment lines 47-50 explicit; verified against installed @vercel/blob 2.4 in 02-01-SUMMARY). `lib/products/inspection.ts:107` reads sidecar via `get(...,{access:'private'})`, never `inventory_url`. Grep confirms NO `access:"public"` anywhere in the Phase-2 product/inspection/blob paths (only `lib/jobs.ts:41` legacy job store — a Phase-8 concern, out of scope here). |

**Score:** 6/6 truths verified

### Deferred Items

Items not yet met but explicitly addressed in a later milestone phase.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | The `recomputeStatus` 'ready' heuristic (alloycolour ≥1 token AND no clearly-stone mesh unassigned) is an ASSUMED contract, not confirmed | Phase 3 | ROADMAP Phase 3 SC: "Submitting expands the matrix into one job per (angle × metal × stone-assignment × pass)… each with a generated recipe" — Phase 3 consumes the persisted assignment/token shape for holdout passes and must confirm the readiness definition (recorded ASSUMPTION in 02-04-SUMMARY:96). Not a gap: the persisted data shape (PROD-04) is correct and test-backed; only the readiness label semantics are deferred. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` (Inspection, ObjectGroupAssignment) | Inspection + assignment models | ✓ VERIFIED | `Inspection` (lines 109-121, productId index, runpodJobId, inventory Json), `ObjectGroupAssignment` (123-129, group + objectTokens String[]). Migrated (orchestrator-confirmed). |
| `prisma/seed.ts` (StoneType) | 10 canonical StoneTypes, idempotent | ✓ VERIFIED | 10 rows (lines 41-51), `upsert` by key (line 75). |
| `lib/blob.ts` workerModelUrl | tokenless signed-GET, no public fallback | ✓ VERIFIED | issueSignedToken+presignUrl (lines 52-62). |
| `app/api/blob/upload/route.ts` | requireSession + access:'private' | ✓ VERIFIED | Lines 37, 42. |
| `lib/products/actions.ts` | createProduct (PROD-01) | ✓ VERIFIED | requireSession first; pathname persisted. |
| `lib/products/inspection.ts` | start/poll, private sidecar (PROD-02) | ✓ VERIFIED | id split + private read. |
| `lib/products/assignments.ts` | save/load (PROD-03/04) | ✓ VERIFIED | per-group rows, signature tokens, IDOR-accepted. |
| `app/(app)/products/*` | new/[id]/list/assignment/viewer | ✓ VERIFIED | All present and wired (page.tsx, product-card.tsx, group-assignment.tsx, inventory-viewer.tsx, inspect-panel.tsx, model-dropzone.tsx). |
| `lib/settings/actions.ts` + `app/(app)/admin/settings/*` | DATA-04 edit | ✓ VERIFIED | 4 Admin-gated actions wired into settings-forms.tsx. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| model-dropzone.tsx | /api/blob/upload | `upload({access:'private', handleUploadUrl})` | WIRED | dropzone.tsx:111-116 |
| create-product-form | createProduct | server action import | WIRED | (form gated on name + successful upload, redirects to /products/[id]) |
| inspect-panel.tsx | startInspection/pollInspection | action import | WIRED | inspect-panel.tsx:13,53,64 |
| products/[id]/page.tsx | loadAssignments + GroupAssignment | import + render | WIRED | page.tsx:16,19,85,159 |
| group-assignment.tsx | saveAssignments | action import | WIRED | group-assignment.tsx:20,145 |
| admin/settings/settings-forms.tsx | 4 save actions | action import + onSubmit | WIRED | settings-forms.tsx:8-11,226,313,418,525 |
| pollInspection | @vercel/blob get | `get(key,{access:'private'})` | WIRED | inspection.ts:107 (asserted in test) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| products/page.tsx | `products` | `prisma.product.findMany` | DB query (live Railway) | ✓ FLOWING |
| products/[id]/page.tsx | `product` / `inspectionRow` / `initialAssignments` | prisma findUnique/findFirst + loadAssignments | DB queries | ✓ FLOWING |
| admin/settings/page.tsx | `data` (4 tables) | `Promise.all([...findMany])` | DB queries (StoneType seeded, others Phase-1 seeded) | ✓ FLOWING |
| GroupAssignment | `selection` | `initialAssignments` prop ← loadAssignments | DB-backed | ✓ FLOWING |
| InventoryViewer | inventory objects | Inspection.inventory ← real worker output (or empty until first real inspection) | Real after inspection; STATIC-until-run | ⚠️ requires real RunPod run (covered by human check #2) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit/integration suite | `npx vitest run` | 19 files, 107 tests passed | ✓ PASS |
| No public-access leak in Phase-2 paths | grep `access:"public"` in lib/products,lib/blob | only legacy lib/jobs.ts (Phase-8) | ✓ PASS |
| No debt markers in phase code | grep TODO/FIXME/XXX in lib + app/products | none | ✓ PASS |
| TypeScript / build | `tsc --noEmit` / `next build` (orchestrator-confirmed) | exit 0 / exit 0 | ✓ PASS |
| Real upload / inspection round-trip | (requires live Blob + RunPod) | — | ? SKIP → human #1/#2 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROD-01 | 02-01, 02-02 | Create product + private direct-to-Blob upload | ✓ SATISFIED | actions.ts, model-dropzone.tsx, upload/route.ts; test/product-create.test.ts |
| PROD-02 | 02-01, 02-03 | Inspect, see objects/slots/BSDF | ✓ SATISFIED | inspection.ts, inventory.ts, inventory-viewer.tsx; test/inspection-dispatch.test.ts |
| PROD-03 | 02-01, 02-04 | Assign each object to a group + save | ✓ SATISFIED | assignments.ts, group-assignment.tsx; test/assignment-save.test.ts |
| PROD-04 | 02-01, 02-04 | Saved assignment drives passes (data linkage) | ✓ SATISFIED (persist-only; Phase 3 consumes) | objectTokens = signatures; test asserts not-cuid |
| PROD-05 | 02-04 | Browse + reopen products | ✓ SATISFIED | products/page.tsx, product-card.tsx; test/product-list.test.ts |
| DATA-04 | 02-01, 02-05 | Admin edits domain settings | ✓ SATISFIED | settings/actions.ts (requireRole Admin first), settings-forms.tsx; test/settings-edit.test.ts |

No orphaned requirements — all six phase requirements are claimed by plans and implemented.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none in Phase-2 code) | — | — | — | No debt markers, no stubs flowing to user output, no public-blob fallback. |

Note: Documented "Known Stubs" in SUMMARYs (placeholder thumbnail glyph, omitted stale-inspection banner, unused free-text token search) are cosmetic/non-goal-blocking and do not affect any of the 6 truths. The placeholder thumbnail is intentional — the worker produces no model preview (a later-phase concern), and any future thumbnail would route through /api/file.

### Human Verification Required

1. **Large model upload round-trip (PROD-01)** — Drag a real ~50MB model into `/products/new`; confirm it lands in PRIVATE Blob, the Product persists with the pathname, and a logged-out raw-blob fetch is denied. *Why human:* real Blob store + large binary + network.
2. **End-to-end real inspection (PROD-02)** — Run a real inspection; confirm the worker reads the private model and writes the sidecar PRIVATELY. **PENDING SETUP:** `BLOB_ACCESS=private` MUST be set on the RunPod endpoint env (read side is already private in code; only the worker's WRITE side needs the env). *Why human:* cross-service GPU job + operational env var.
3. **Inspection/assignment visual render (UI-SPEC §3/§4)** — Confirm the Materials BSDF table and Groups assignment surface render and the groups round-trip on reopen. *Why human:* visual/interaction correctness.

### Gaps Summary

No blocking gaps. All 6 observable truths and all 6 phase requirements (PROD-01..05, DATA-04) are implemented in the codebase, wired end-to-end, and backed by a green 107/107 test suite, with `tsc --noEmit` and `next build` both clean.

Two non-blocking items are surfaced rather than failed:
- **PENDING SETUP (not a code gap):** `BLOB_ACCESS=private` on the RunPod endpoint is an operational env requirement for a *real* inspection's sidecar WRITE to be private. The application read path is already private-by-pathname regardless. Routed to human verification #2.
- **DEFERRED to Phase 3 (not a gap):** the product 'ready' readiness heuristic in `recomputeStatus` is an explicit ASSUMPTION (RESEARCH Open Q4) that Phase 3 must confirm when it consumes the assignment shape for holdout passes. The persisted PROD-04 data shape itself is correct and test-verified.

Status is `human_needed` (not `passed`) solely because the goal's real cross-service behaviors (private upload round-trip, real worker inspection) require live Blob + RunPod that the mocked suite cannot exercise.

---

_Verified: 2026-06-08T18:05:00Z_
_Verifier: Claude (gsd-verifier)_
