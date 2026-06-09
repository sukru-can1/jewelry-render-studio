---
phase: 06-compositing-deliverable
verified: 2026-06-09T21:00:00Z
status: human_needed
score: 3/3 success criteria verified
overrides_applied: 0
human_verification:
  - test: "Flatten a real multi-layer variant on the live deployment and visually confirm the catalog deliverable is correctly aligned (metal base + stone overlays composite over without offset)."
    expected: "A single PNG where stone overlays sit pixel-aligned on the metal base, matching the in-browser stacked preview."
    why_human: "sharp composite alignment on real RunPod renders cannot be asserted by grep — only by eye on actual layer bytes."
  - test: "Confirm BLOB_ACCESS=private is set on the RunPod worker endpoint so layer outputs are written as private blobs."
    expected: "Worker-written layer blobs are access:'private'; /api/file proxy serves them, and no public URL exists."
    why_human: "Endpoint env config lives in RunPod, outside the repo; cannot be verified from code."
---

# Phase 6: Compositing & Deliverable — Verification Report

**Phase Goal:** An operator can assemble and ship catalog-ready imagery — preview stacked layers in-browser and download a server-flattened deliverable per variant or whole batch.
**Verified:** 2026-06-09T21:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | COMP-01: Operator stacks metal + stone layers in-browser and toggles layers on/off to preview the assembled image | ✓ VERIFIED | `compositor.tsx:151-188` absolutely-positioned stacked `<img>` (base z=0 + overlays), `src={privateUrl(layer.url)}` (`:174`); per-layer toggles default ON (`:95-97`), flip opacity/visibility 1↔0 (`:103-104, :179-180`); page is DB-only via `loadBatchGallery` + `groupVariantsForCompositing` (`page.tsx:48,75`), no `lib/runpod` import (grep: 0 matches) |
| 2 | COMP-02: Server flattens layers into one aligned deliverable per variant, validating identical dims AND non-trivial alpha — empty/mismatched WARN, never silent flatten | ✓ VERIFIED | `validate.ts:51-101` 3-part gate (missing-base, dimension-mismatch, empty-layer via alphaMax/alphaMean) + advisory no-overlays; `flatten.ts:96-98` blocks composite when warnings present, `:101-104` sharp composite over base in z-order; `flatten/route.ts:122-123` gate FAIL → `200 {ok:false,warnings}` and `:128-132` `putPrivate` only on PASS (test `comp-flatten-route.test.ts:132,138` asserts `putMock.not.toHaveBeenCalled()` on FAIL) |
| 3 | COMP-03: Operator downloads the flattened deliverable for a variant OR a whole batch | ✓ VERIFIED | Single: `flatten-action.tsx:62-74` attachment download via `/api/file?...&download=1&name=` proxy; Batch: `download/route.ts:80-81,144-273` `?deliverables=1` mode — blob-prefix discovery (`:177`), capped lazy flatten `LAZY_FLATTEN_CAP=10` (`:44,217`), zip stream (`:252,272`); `download-all-action.tsx:44-65` primary button hits `?deliverables=1` (`:50`) |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/compositing/variants.ts` | PURE (angle×metal) grouping + z-order | ✓ VERIFIED | `groupVariantsForCompositing` (`:80`); no prisma/sharp/runpod imports; deterministic overlay sort (`:122-127`) |
| `lib/compositing/validate.ts` | PURE 3-part gate → FlattenWarning[] | ✓ VERIFIED | `validateVariant` (`:51`); plain numbers only, no I/O |
| `lib/compositing/flatten.ts` | sharp orchestration (fetch→gate→composite) | ✓ VERIFIED | Only module importing `sharp` (`:11`); gate-before-composite; returns `{ok:false}` not throw on block |
| `lib/compositing/deliverable.ts` | deterministic blob pathname + prefix | ✓ VERIFIED | `deliverablePrefix`/`deliverablePathname` (`:12,22`), sanitized stem (`:33`) — shared by route + zip discovery |
| `app/(app)/batches/[id]/flatten/route.ts` | auth + IDOR per-variant flatten | ✓ VERIFIED | `requireSession` first (`:43`), IDOR batch load (`:53`), DB-derived variants (`:73-98`), private `get` (`:108`), `putPrivate` (`:129`) |
| `app/(app)/batches/[id]/download/route.ts` | `?deliverables=1` capped lazy-flatten zip | ✓ VERIFIED | `requireSession`+IDOR (`:59-73`), deliverables branch (`:80`), private reads (`:186,243`), cap + X-Deliverables-Note (`:217,266`) |
| `compositing/page.tsx` | DB-only Server Component (auth+IDOR+dynamic) | ✓ VERIFIED | `requireSession` (`:45`), `force-dynamic` (`:38`), blob-derived flattened count (`:82-92`), no runpod |
| `compositing/compositor.tsx` | client LayerCompositor (stacked img + toggles) | ✓ VERIFIED | 5 states present: no-layers, image-error+retry, WARN banner, base/overlay rows, FlattenAction |
| `compositing/flatten-action.tsx` | per-variant flatten + WARN surfacing | ✓ VERIFIED | POSTs Plan-01 route (`:81`), `ok:false`→`onWarnings` (`:100`), button stays enabled |
| `compositing/download-all-action.tsx` | batch download-all primary button | ✓ VERIFIED | `deliverables=1` GET (`:50`), empty-scope disable (`:41`) |
| `segment-switcher.tsx` | Monitor·Gallery·Compositing nav | ✓ VERIFIED | All three segments (`:21-34`) |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| flatten/route.ts | validateVariant | gate on sharp metadata/stats before composite | ✓ WIRED (flatten.ts:86-98) |
| flatten/route.ts | get(access:'private') | private layer-byte read | ✓ WIRED (`:108`) |
| compositing/page.tsx | groupVariantsForCompositing | DB layers → variants | ✓ WIRED (`:75`) |
| compositor.tsx | /api/file | privateUrl on every `<img>` | ✓ WIRED (`:174`) |
| flatten-action.tsx | POST /flatten, WARN on ok:false | flatten route + warn banner | ✓ WIRED (`:81,100`) |
| download/route.ts | deliverablePrefix + get private | zip deliverables/ blobs privately | ✓ WIRED (`:177,243`) |
| download-all-action.tsx | /download?deliverables=1 | primary download button | ✓ WIRED (`:50`) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| compositor.tsx | `variant` (base+overlays) | `groupVariantsForCompositing(gallery.layers)` from `loadBatchGallery(id)` (DB) | Yes — real Layer rows | ✓ FLOWING |
| compositing/page.tsx | `flattenedKeys` | `list({prefix:deliverablePrefix(id)})` blob discovery | Yes — blob-only, no isFlattened flag | ✓ FLOWING |
| flatten/route.ts | deliverable buffer | sharp composite of private layer Buffers | Yes (live render bytes — see manual note) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full test suite | `npx vitest run --reporter=dot` | 46 files, 252 tests passed | ✓ PASS |
| Type check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Gate hard-block (no silent flatten) | `comp-flatten-route.test.ts` | `putMock.not.toHaveBeenCalled()` on FAIL | ✓ PASS |
| Idempotent re-flatten | `comp-flatten-idempotent.test.ts` | same pathname, allowOverwrite, no Layer row | ✓ PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|---|---|---|---|
| COMP-01 | In-browser layer preview + toggles | ✓ SATISFIED | compositor.tsx |
| COMP-02 | Server flatten with validation gate | ✓ SATISFIED | validate.ts + flatten.ts + flatten/route.ts |
| COMP-03 | Download per-variant or whole batch | ✓ SATISFIED | flatten-action.tsx + download/route.ts |

### Cross-Cutting Verification

- **Auth + IDOR:** every new route runs `requireSession()` as the first line and `prisma.batch.findUnique({where:{id}})` IDOR-scope before any blob read (flatten/route.ts:43,53; download/route.ts:59,70; api/file/route.ts:15). ✓
- **Blob-only persistence:** deliverables discovered by `deliverablePrefix` list, never `Layer.isFlattened`; no Layer DB row written for deliverables (idempotency test asserts `upsert/create not called`). ✓
- **All blob reads private:** grep for `access:"public"` in batch routes → 0 matches; all `get(...)` use `access:'private'` (SEC-02). ✓
- **No new deps:** `archiver` pre-existing; `sharp` installed in node_modules and imported only by flatten.ts; no unexpected additions. ✓
- **No unreferenced debt markers** (TBD/FIXME/XXX) in phase files. ✓

### Anti-Patterns Found

None. No stubs, no public-URL leaks, no silent-flatten path, no unreferenced debt markers.

### Human Verification Required

1. **Live sharp composite alignment** — Flatten a real multi-layer variant on the deployment; confirm the deliverable PNG is pixel-aligned (overlays over base). Why human: alignment on real render bytes is visual.
2. **BLOB_ACCESS=private on RunPod endpoint** — Confirm worker writes layer blobs as private. Why human: endpoint env config lives in RunPod, outside the repo.

### Gaps Summary

No gaps. All three success criteria are achieved in the shipped code: COMP-01 in-browser stacked preview with toggles, COMP-02 server flatten with a hard-blocking 3-part validation gate that writes nothing on failure, and COMP-03 single-variant + whole-batch download. The full test suite (252/252) and type check (exit 0) are green. Two items are carried forward for manual verification — they are environment/visual concerns, not code defects.

---

_Verified: 2026-06-09T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
