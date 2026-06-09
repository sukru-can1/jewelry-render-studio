---
phase: 6
slug: compositing-deliverable
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-09
---

# Phase 6 — Validation Strategy

> Derived from `06-RESEARCH.md` ## Validation Architecture. Reuses the Phase 1-5 Vitest 4.1.8 harness — no Wave 0 install (sharp + archiver already present). Mock `prisma` + `@vercel/blob` + `sharp`; pure libs (variants/validate) need no mocks; live sharp-on-real-renders is manual.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 (installed) |
| **Config file** | `vitest.config.ts` |
| **Quick run** | `npx vitest run --reporter=dot` |
| **Full suite** | `npx vitest run` |
| **Estimated runtime** | ~50–60s |

---

## Sampling Rate

- After every task commit: `npx vitest run <the-touched-test-file> --reporter=dot`
- After every wave: `npx vitest run`
- Before verify: full suite green + `npx next build` + `npx tsc --noEmit` exit 0 + one manual real-render flatten verified

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | Status |
|-------------|----------|-----------|-------------------|--------|
| COMP-02 | `groupVariantsForCompositing` buckets layers by (angle×metal); base=metal pass, overlays=stone passes; wrong-key fixture collapses (guard) | unit (pure) | `npx vitest run comp-variant-group` | ⬜ pending |
| COMP-02 | z-order: base first, overlays sorted by (sortOrder, stoneGroup) deterministically across shuffled input | unit (pure) | `npx vitest run comp-zorder` | ⬜ pending |
| COMP-02 | `validateVariant`: missing-base / dimension-mismatch / empty-layer / no-overlays warnings from mock metadata+stats numbers; clean variant returns [] | unit (pure) | `npx vitest run comp-validate` | ⬜ pending |
| COMP-02 | gate PASS → composite produced + putPrivate once + 200 ok:true; gate FAIL → 200 ok:false warnings, NO blob write (never silent flatten) | unit (mock sharp+blob+prisma) | `npx vitest run comp-flatten-route` | ⬜ pending |
| COMP-02 | flatten is idempotent — re-flatten writes the SAME deliverable pathname with allowOverwrite:true (no second distinct write) | unit (mock blob+prisma) | `npx vitest run comp-flatten-idempotent` | ⬜ pending |
| COMP-02 | flatten route requires session + IDOR-scopes batch by params.id (unauth→401 no get(); unknown batch→404) | unit | `npx vitest run comp-flatten-auth` | ⬜ pending |
| COMP-01 | compositing page imports no lib/runpod (DB-only source guard) | source | `npx vitest run comp-page-db-only` | ⬜ pending |
| COMP-01/02 | flatten route + compositing page DB-only hard gate (shared list) | source | `npx vitest run orch-db-only` | ⬜ pending |
| COMP-02/03 | compositing/flatten + download routes read private only, construct no public/signed URL | source guard | `npx vitest run blob-guard` | ⬜ pending |
| COMP-03 | batch zip with ?deliverables=1 zips ONLY flattened deliverables (private reads); missing ones lazily flattened CAPPED; raw-layer path unchanged | unit (mock blob+prisma+sharp) | `npx vitest run comp-download-deliverables` | ⬜ pending |
| COMP-03 | single-deliverable download via /api/file?download=1 attachment (sanitized filename) | integration | `npx vitest run out-file-download` | ✅ reuse |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real sharp composite on actual metal+stone renders | COMP-02 | Live render bytes / visual | Flatten a known (angle×metal) variant; confirm stones land correctly over metal, pixel-aligned, no halo/fringe |
| In-browser stacked preview + per-layer toggles | COMP-01 | Visual / interactive | Open a completed batch's /compositing; confirm metal-floor + stone-PNG stack on checkerboard, eye/eye-off toggles flip layer visibility, metal defaults on |
| WARN (not silent flatten) on mismatch/empty | COMP-02 | Visual | Force a dimension/empty-alpha case; confirm the warning banner shows the mono detail and the deliverable is NOT silently written |
| Whole-batch deliverables zip + 60s cap | COMP-03 | Live timing | Flatten 2 variants then "Download all deliverables"; confirm zip; on a >N-unflattened batch confirm a partial zip + note rather than a 504 timeout |
| sharp linux binary loads on Vercel | COMP-02 | Deploy env | Deploy smoke: a per-variant flatten completes well under 60s on Vercel |
| Worker BLOB_ACCESS=private (inherited Phase-5 A3) | COMP-02 | Cross-service | Confirm a completed layer is readable via /api/file before wiring flatten (layers must be private for get(private)) |

---

## Validation Sign-Off

- [ ] Every requirement has an automated verify or a justified manual check
- [x] COMP-02 grouping + z-order + validation gate covered by pure unit tests
- [x] Flatten gate PASS/FAIL (write/no-write) + idempotency + auth/IDOR tested
- [x] Download deliverables zip auth + IDOR + private-only + capped lazy flatten tested
- [x] DB-only + blob-guard source guards extended to the new route + page
- [x] `nyquist_compliant: true`

**Approval:** pending
