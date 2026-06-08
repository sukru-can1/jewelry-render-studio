---
phase: 3
slug: batch-builder-with-cost-guardrails
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
---

# Phase 3 — Validation Strategy

> Per-phase validation contract. Derived from `03-RESEARCH.md` ## Validation Architecture. Reuses the Phase 1/2 Vitest 4.1.8 harness (test/setup.ts, factories) — no Wave 0 install.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 (installed) |
| **Config file** | `vitest.config.ts` |
| **Quick run** | `npx vitest run --reporter=dot` |
| **Full suite** | `npx vitest run` |
| **Estimated runtime** | ~40–50s |

Mutations are Server Actions over Prisma; mock `prisma`, `lib/auth/rbac`. The recipe generator (`lib/enterprise-recipes.ts`) is pure → used un-mocked in expansion tests. No RunPod call in Phase 3 (dispatch is Phase 4).

---

## Sampling Rate

- After every task commit: `npx vitest run --reporter=dot`
- After every wave: `npx vitest run`
- Before verify: full suite green + `npx next build` + `npx tsc --noEmit` exit 0

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | Status |
|-------------|----------|-----------|-------------------|--------|
| BATCH-01/02 | Builder reads domain angles+metals; multi-select drives the matrix | integration | `npx vitest run batch-builder` | ⬜ pending |
| BATCH-03 | Stone-type picker only for the product's present groups; only generator-supported materials selectable | unit | `npx vitest run stone-picker` | ⬜ pending |
| BATCH-04 | Pass set = metal-only + each selected stone group | unit | `npx vitest run passes` | ⬜ pending |
| BATCH-05 | jobCount = \|angles\|×\|metals\|×\|passes\|; estimate (count/min/$) recomputes on selection | unit | `npx vitest run estimate` | ⬜ pending |
| BATCH-06 | SOFT_THRESHOLD confirm + HARD_CAP block; preview default; **server re-enforces hard cap** (reject > cap before any write) | unit+integration | `npx vitest run estimate cap-enforce` | ⬜ pending |
| BATCH-07 | One Job per (angle×metal×stone-assignment×pass), each with a generated recipe via buildEnterpriseRecipe; Batch+Jobs created in ONE $transaction (all-or-none rollback on failure) | integration | `npx vitest run batch-expand` | ⬜ pending |
| BATCH-07 | DB domain keys → enterprise-recipes keys binding (view1→hero…, red→rose, stoneType→material) correct | unit | `npx vitest run domain-binding` | ⬜ pending |
| (security) | createBatch requireSession first-line; IDOR product-scope; duplicate-submit guard | integration | `npx vitest run batch-rbac` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live estimate "big number" escalation | BATCH-05/06 | Visual | Change selection; confirm count + amber/red escalation + confirm dialog above soft threshold |
| Over-hard-cap blocks submit | BATCH-06 | Visual | Select > HARD_CAP; submit disabled with guidance |
| Cost/time estimate realism | BATCH-05 | Domain | Constants are placeholders (RESEARCH MEDIUM) — confirm/replace with real RunPod GPU pricing later |

---

## Validation Sign-Off

- [x] Every requirement has an automated verify or a justified manual check
- [x] No 3 consecutive tasks without automated verify
- [x] Server-side cap enforcement has its own test (not client-only)
- [x] Transactional all-or-none has a rollback test
- [x] `nyquist_compliant: true`

**Approval:** pending
