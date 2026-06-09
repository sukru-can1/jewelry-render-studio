---
phase: 4
slug: orchestration-status
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract. Derived from `04-RESEARCH.md` ## Validation Architecture. Reuses the Phase 1-3 Vitest 4.1.8 harness — no Wave 0 install. Mock `lib/runpod` + `prisma`; no live RunPod/cron calls in tests.

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
| (schema) | additive migration applied (Job.result/startedAt/cancelRequestedAt, Batch.cancelRequestedAt) | integration | `npx prisma migrate status` exits 0 | ⬜ pending |
| ORCH-01 | cron dispatcher claims ≤N queued jobs, submits to RunPod with recipe + webhook URL + secret, persists runpodJobId + status running; CRON_SECRET-gated | integration | `npx vitest run dispatch` | ⬜ pending |
| ORCH-02 | webhook (secret-verified; secret via URL) maps RunPod callback by body.id→runpodJobId, writes status/result/error IDEMPOTENTLY (duplicate/late callback no-ops on terminal); bad secret → 401 | integration | `npx vitest run webhook` | ⬜ pending |
| ORCH-02 | reconcile cron polls only non-terminal jobs (fallback); user pages NEVER import lib/runpod (DB-only reads) | integration+source | `npx vitest run reconcile db-only-reads` | ⬜ pending |
| ORCH-03 | failed job re-dispatched up to attempt cap (~2); idempotent (reuses/tracks runpodJobId; no duplicate successful render); over-cap stays failed | unit+integration | `npx vitest run retry` | ⬜ pending |
| ORCH-04 | batch progress counts by status (DB-derived); per-job error/log surfaced; freshness "updated Ns ago" | unit | `npx vitest run progress` | ⬜ pending |
| ORCH-05 | cancel batch/job → RunPod /cancel + status cancelled + cancelRequestedAt; cancelled jobs NOT re-dispatched; requireSession + IDOR | integration | `npx vitest run cancel` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real RunPod dispatch + webhook callback | ORCH-01/02 | Live cross-service (needs rotated key + worker BLOB_ACCESS) | Submit a real batch; confirm jobs dispatch, render, webhook updates DB |
| Vercel Cron fires at the configured interval | ORCH-02 | Platform (needs Pro plan; deploy) | Confirm `/api/cron/dispatch` + `/api/cron/reconcile` run on schedule in prod |
| Jobs monitor live refresh | ORCH-04 | Visual | Watch a batch render; confirm progress + "updated Ns ago" + auto-stop on terminal |
| Cancel a running job | ORCH-05 | Live | Cancel mid-render; confirm RunPod stops + status cancelled |

---

## Validation Sign-Off

- [x] Every requirement has an automated verify or a justified manual check
- [x] Webhook idempotency + bad-secret have their own tests
- [x] DB-only-reads enforced by a source-text test (no runpod import in page.tsx)
- [x] Retry attempt-cap + idempotency tested
- [x] `nyquist_compliant: true`

**Approval:** pending
