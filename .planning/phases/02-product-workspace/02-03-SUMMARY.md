---
phase: 02-product-workspace
plan: 03
subsystem: product-workspace
tags: [next-server-action, runpod, vercel-blob, private-blob, polling, tabs, collapsible, vitest, rbac]

# Dependency graph
requires:
  - phase: 02-product-workspace
    plan: 01
    provides: "Inspection model (migrated), parseInventory (lib/inventory.ts), workerModelUrl + privateUrl (lib/blob.ts)"
  - phase: 02-product-workspace
    plan: 02
    provides: "Product model + Product.modelUrl=pathname convention, /products surface"
  - phase: 01-secure-foundation-secrets-db-auth
    provides: "requireSession RBAC boundary, lib/runpod.ts (submitRunPod/getRunPodStatus), /api/file private proxy, shadcn primitives"
provides:
  - "startInspection + pollInspection Server Actions (lib/products/inspection.ts) — dispatch RunPod inspect_materials, poll, private sidecar read, parse, persist"
  - "Product detail page /products/[id] (Overview|Materials|Groups tabs) reading product + latest inspection"
  - "InspectPanel client component — UI-SPEC §3 states + on-demand poll (interval + focus, no webhook)"
  - "InventoryViewer client component — collapsible per-MESH-object Principled BSDF table"
  - "Official shadcn collapsible + accordion blocks"
affects: [group-assignment, batch-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "App-minted WORKER job_id (sidecar key) kept DISTINCT from the persisted RunPod job id (poll key)"
    - "Inventory sidecar read PRIVATELY by pathname via @vercel/blob get(key,{access:'private'}) + new Response(stream).json() — never a public inventory_url (SEC-02)"
    - "On-demand client polling (5s interval + window focus) reconciles the Inspection row; no Phase-4 webhook dependency (decision #3)"
    - "ParsedInventory cast to Prisma.InputJsonValue for the Json column write"

key-files:
  created:
    - lib/products/inspection.ts
    - app/(app)/products/[id]/page.tsx
    - app/(app)/products/[id]/inspect-panel.tsx
    - app/(app)/products/inventory-viewer.tsx
    - app/components/ui/collapsible.tsx
    - app/components/ui/accordion.tsx
    - test/inspection-dispatch.test.ts
  modified: []

key-decisions:
  - "startInspection mints workerModelUrl(product.modelUrl) at dispatch (decision #1) and dispatches with an app-generated worker job_id (randomUUID) + output.prefix=inspections/<id>, keeping inspections out of the renders/ namespace"
  - "Persisted Inspection.runpodJobId = submitRunPod().id (drives getRunPodStatus) is intentionally DISTINCT from the dispatched worker job_id (drives the sidecar pathname)"
  - "pollInspection reads the sidecar by status.output.inventory_key via get(...,{access:'private'}) and parses it from the stream; output.inventory_url is never fetched (SEC-02)"
  - "Product detail defaults to the Materials tab; Groups is a mount-point placeholder for Plan 02-04 (no assignment built here)"
  - "Model/thumbnail delivered only via the authed /api/file proxy (privateUrl), never a public blob url (T-02-15)"

patterns-established:
  - "Inspection lifecycle status mapping: COMPLETED→completed/needs_groups, FAILED→failed/inspection_failed, IN_QUEUE/IN_PROGRESS→in_queue/in_progress (no product-status churn while running)"
  - "Client inspect surface is presentation+polling only; requireSession lives inside the Server Actions (the real boundary)"

requirements-completed: [PROD-02]

# Metrics
duration: ~23min
completed: 2026-06-08
---

# Phase 2 Plan 03: Material Inspection + Product Detail Summary

**PROD-02 vertical slice — an operator opens a product, runs material inspection (dispatching the existing RunPod `inspect_materials` operation against the private model), watches a queued→running→done status, and on completion sees the detected MESH objects with their material slots and Principled BSDF values; the inventory sidecar is read privately by pathname, never via a public URL (SEC-02).**

## Performance
- **Duration:** ~23 min
- **Completed:** 2026-06-08
- **Tasks:** 2 of 2
- **Files created:** 7

## Accomplishments
- Shipped `startInspection`/`pollInspection` Server Actions (`lib/products/inspection.ts`, `"use server"`):
  - `startInspection`: `requireSession()` first (T-02-12); loads the product; returns `{ ok:false }` when no `modelUrl`; mints a worker-readable signed-GET URL via `workerModelUrl(product.modelUrl)` (decision #1); dispatches `submitRunPod` with `operation:"inspect_materials"`, an app-minted `job_id` (worker key), `output:{ prefix:'inspections/<id>' }`, and `model:{ url, pathname }`; persists `Inspection.runpodJobId = res.id` (RunPod id — DISTINCT from the worker key) with status `in_queue`; sets `product.status='inspecting'`; `revalidatePath`.
  - `pollInspection`: `requireSession()`; `getRunPodStatus(runpodJobId)`. On COMPLETED reads the sidecar by `status.output.inventory_key` via `get(key,{access:'private'})`, parses the stream JSON with `parseInventory`, and writes `status='completed'` + `inventory` + `finishedAt`, then `product.status='needs_groups'`. FAILED → `status='failed'` + truncated worker error + `product.status='inspection_failed'`. IN_QUEUE/IN_PROGRESS → status-only update, no inventory write, no product churn.
- Built the product detail page `/products/[id]` (server component, `runtime=nodejs`, `force-dynamic`, awaits `params` Promise): `requireSession()` first, reads the product (404 via `notFound()`) + the latest Inspection; Overview/Materials/Groups tabs; model/thumbnail via the authed `/api/file` proxy (`privateUrl`), never a public url (T-02-15); Groups is a placeholder mount-point for Plan 02-04.
- Built `InspectPanel` (client): UI-SPEC §3 states — empty (`Inspect materials`), running (info pill + the exact running-banner copy + skeleton inventory + 5s interval poll + focus poll), failed (destructive banner + truncated error + `Retry inspection`), completed (`InventoryViewer` + `Re-inspect`). On-demand poll only (decision #3 — no webhook).
- Built `InventoryViewer` (client): dense collapsible table — per-MESH-object row (mono name · #slots · max-dimension mm · dashed `unassigned` chip) expanding to the per-material Principled BSDF table (Base Color swatch + RGBA mono, Metallic, Roughness, Transmission, IOR), `—` for absent values; loading-skeleton and empty ("No objects detected.") states.
- Added the official shadcn `collapsible` + `accordion` blocks (T-02-SC — first-party registry only).

## Task Commits
1. **Task 1: startInspection + pollInspection (TDD)** — `10e2cca` (test, RED) → `1008cc9` (feat, GREEN)
2. **Task 2: Product detail page + inspect panel + inventory viewer** — `115508b` (feat)

_TDD gate compliance: Task 1 has a `test(...)` RED commit before its `feat(...)` GREEN commit._

## Files Created
- `lib/products/inspection.ts` — `startInspection` + `pollInspection` Server Actions.
- `app/(app)/products/[id]/page.tsx` — product detail server component (tabs + reads).
- `app/(app)/products/[id]/inspect-panel.tsx` — inspect action surface + on-demand poller.
- `app/(app)/products/inventory-viewer.tsx` — collapsible BSDF inventory table.
- `app/components/ui/collapsible.tsx`, `app/components/ui/accordion.tsx` — official shadcn blocks.
- `test/inspection-dispatch.test.ts` — 7 tests (dispatch contract, id split, private sidecar read, COMPLETED/FAILED/IN_PROGRESS, no-modelUrl).

## Deviations from Plan
None — plan executed as written. One type adaptation (not a behavioral deviation): `parseInventory`'s `ParsedInventory` return lacks a string index signature, so the COMPLETED-path Prisma `Json` write casts it to `Prisma.InputJsonValue`. The `accordion` block was added per the plan's `add tabs collapsible accordion` instruction even though only `collapsible` is consumed by this slice (kept for the assignment surfaces).

## User Setup (recorded, non-blocking)
- **vercel-blob / RunPod endpoint:** the RunPod worker writes the inventory sidecar (and render outputs) with `access=os.environ.get("BLOB_ACCESS","public")` (`handler.py:52,64`). For SEC-02 the RunPod endpoint (and any local worker env) **MUST set `BLOB_ACCESS=private`** so the worker does not write a publicly-readable sidecar. `pollInspection` reads the sidecar privately by pathname regardless, but the worker must not WRITE it publicly. Tests mock RunPod + blob, so they pass independent of this env.

## Threat Model Compliance
- **T-02-12 (Spoofing):** `requireSession()` is the first line of both `startInspection` and `pollInspection`; the detail page also calls it first (test-verified via the mocked rbac).
- **T-02-13 (Info Disclosure, worker model fetch):** the worker-readable URL is minted on demand via `workerModelUrl` only at dispatch; never persisted or rendered as a public link.
- **T-02-14 (Tampering/XSS):** object/material names rendered as plain text (mono); React escapes; no `dangerouslySetInnerHTML`.
- **T-02-15 (Info Disclosure, detail page):** model/thumbnail delivered via `privateUrl` → `/api/file` authed proxy only; no `result.url`/public blob url rendered.
- **T-02-16 (DoS, poll loop):** poll is on-demand — bounded 5s interval + focus only while the row is in-flight (`in_queue`/`in_progress`); cleared on unmount/terminal state.
- **T-02-21 (Info Disclosure, sidecar):** `pollInspection` reads the sidecar via `get(inventory_key,{access:'private'})` by pathname; `inventory_url` is never fetched (test asserts the private `get` args and that the public url is not fetched). BLOB_ACCESS=private (user_setup) closes the WRITE side.
- **T-02-SC (Tampering, shadcn):** `collapsible`/`accordion` added from the official shadcn registry only.

## Verification Results
- `npx vitest run test/inspection-dispatch.test.ts` — **7/7 green** (dispatch contract, id split assertion, private sidecar read + no public-url fetch, COMPLETED/FAILED/IN_PROGRESS, no-modelUrl short-circuit).
- `npx vitest run` — **17 files, 96 tests, all green** (89 prior + 7 new; note the suite count reflects all phase tests).
- `npx tsc --noEmit` — exit 0.
- `npx next build` — compiles; `/products/[id]` route emitted (4.56 kB, 189 kB First Load).

## Known Stubs
- **Groups tab** on `/products/[id]` is an intentional placeholder mount-point — Plan 02-04 (group assignment) fills it. Documented in the plan (`leave a mount point; do not build assignment here`); does not block PROD-02's goal (inspection + inventory are fully functional).
- **Overview thumbnail** renders a placeholder glyph (the worker produces no inspection thumbnail; a model preview render is a later-phase concern). The download-model link uses the authed `/api/file` proxy.
- **Stale-inspection banner** omitted (no model-version field tracked on Inspection yet) — noted as a follow-up per the plan's explicit allowance ("otherwise omit stale and note as a follow-up").

## Self-Check: PASSED
- Created files verified present: `lib/products/inspection.ts`, `app/(app)/products/[id]/page.tsx`, `app/(app)/products/[id]/inspect-panel.tsx`, `app/(app)/products/inventory-viewer.tsx`, `app/components/ui/collapsible.tsx`, `app/components/ui/accordion.tsx`, `test/inspection-dispatch.test.ts` — all FOUND.
- Commits verified in `git log`: `10e2cca` (RED), `1008cc9` (Task 1 GREEN), `115508b` (Task 2) — all FOUND.
