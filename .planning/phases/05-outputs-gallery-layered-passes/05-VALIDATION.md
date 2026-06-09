---
phase: 5
slug: outputs-gallery-layered-passes
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-09
---

# Phase 5 — Validation Strategy

> Derived from `05-RESEARCH.md` ## Validation Architecture. Reuses the Phase 1-4 Vitest 4.1.8 harness — no Wave 0 install. Mock `prisma` + `@vercel/blob`; no live RunPod/Blob in tests.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 (installed) |
| **Config file** | `vitest.config.ts` |
| **Quick run** | `npx vitest run --reporter=dot` |
| **Full suite** | `npx vitest run` |
| **Estimated runtime** | ~45–55s |

---

## Sampling Rate

- After every task commit: `npx vitest run --reporter=dot`
- After every wave: `npx vitest run`
- Before verify: full suite green + `npx next build` + `npx tsc --noEmit` exit 0

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | Status |
|-------------|----------|-----------|-------------------|--------|
| OUT-01 | Recipe for a stone pass sets render.transparent=true, excludes metal tokens, disables studio_background; metal pass opaque — produces true transparent-PNG holdouts | unit | `npx vitest run recipe-transparency` | ⬜ pending |
| (schema) | Layer.jobId @unique migration applied | integration | `npx prisma migrate status` exits 0 | ⬜ pending |
| OUT-01 | deriveLayerFromResult upserts a Layer (pass/format/pathname/combo) on job completion, idempotently (duplicate webhook = no double-insert) | unit | `npx vitest run layer-derive` | ⬜ pending |
| OUT-02 | Gallery reads Layer + Job.combo + Batch from DB, grouped/filterable by product/metal/angle/pass (using CORRECT combo keys angleKey/metalKey/stoneGroup); terminal jobs never re-fetched from RunPod | unit+integration | `npx vitest run gallery-query` | ⬜ pending |
| OUT-02 | Gallery + preview pages NEVER import lib/runpod (DB-only source guard) | source | `npx vitest run out-db-only` | ⬜ pending |
| OUT-03 | Single-layer download via /api/file proxy (requireSession + IDOR; Content-Disposition attachment); no public URL | integration | `npx vitest run download-layer` | ⬜ pending |
| OUT-03 | Full-set/batch zip route (requireSession + IDOR, batch-scoped, archiver stream, application/zip); no public URL | integration | `npx vitest run download-zip` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stone pass renders truly transparent | OUT-01 | Live GPU render | Run a real stone-pass job; confirm the PNG has transparent background (holdout), no metal/floor |
| BLOB_ACCESS=private on RunPod endpoint | OUT-01/03 | Cross-service ops | Worker must write outputs private so /api/file (get access:'private') can deliver them; set on the RunPod endpoint |
| Gallery transparency checkerboard + download | OUT-02/03 | Visual | Open a completed batch's gallery; confirm PNG-on-checkerboard, preview lightbox, layer + full-set download |

---

## Validation Sign-Off

- [x] Every requirement has an automated verify or a justified manual check
- [x] Layer derive idempotency + DB-only-reads source guard tested
- [x] Download auth + IDOR tested (no public URL)
- [x] `nyquist_compliant: true`

**Approval:** pending
