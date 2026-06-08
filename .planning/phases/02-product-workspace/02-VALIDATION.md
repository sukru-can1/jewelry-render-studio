---
phase: 2
slug: product-workspace
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
---

# Phase 2 — Validation Strategy

> Per-phase validation contract. Derived from `02-RESEARCH.md` ## Validation Architecture. Reuses the Phase 1 Vitest harness (test/setup.ts, test/factories.ts) — no Wave 0 install needed.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 (already installed in Phase 1) |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~35–45 seconds |

Mutations are Server Actions over Prisma; tests mock `prisma`, `lib/auth/rbac`, and `lib/runpod` the same way `test/user-admin.test.ts` does. No live RunPod call in tests.

---

## Sampling Rate

- **After every task commit:** `npx vitest run --reporter=dot`
- **After every plan wave:** `npx vitest run`
- **Before verify:** full suite green + `npx next build` succeeds + `npx tsc --noEmit` exit 0

---

## Per-Task Verification Map

| Requirement | Secure Behavior | Test Type | Automated Command | Status |
|-------------|-----------------|-----------|-------------------|--------|
| PROD-01 | Authenticated client-upload mints a token only for a session; product persists with model blob ref; uploads are private (access:'private') | integration | `npx vitest run product-create upload-access` | ⬜ pending |
| PROD-02 | Inspect dispatches RunPod inspect_materials; status polled; inventory parsed (MESH-only) + stored | integration | `npx vitest run inspection` | ⬜ pending |
| PROD-03 | ObjectGroupAssignment saves/loads per product (group enum) | integration | `npx vitest run assignment` | ⬜ pending |
| PROD-04 | Saved assignment exposes include/exclude tokens for holdout passes (data linkage) | unit | `npx vitest run assignment-tokens` | ⬜ pending |
| PROD-05 | Products list returns the workspace's products with status; reopen by id | integration | `npx vitest run product-list` | ⬜ pending |
| DATA-04 | Admin can edit CameraView/Metal/StoneType/QualityPreset; Operator → 403 (requireRole Admin); zod-validated | integration | `npx vitest run settings-edit settings-rbac` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Large model upload round-trip | PROD-01 | Real ~50MB blob + network | Upload a real .blend in dev; confirm it lands in Blob and the worker can read it for inspection |
| Worker reads the (private) model | PROD-02 | Cross-service (RunPod ↔ Blob) | Run a real inspection; confirm the worker downloads the model and returns inventory |
| Inspection inventory renders | PROD-02 | Visual | Confirm detected objects + BSDF values display per 02-UI-SPEC §3 |
| Assignment drives passes | PROD-04 | Cross-phase (Phase 3) | Saved groups produce correct include/exclude tokens when Phase 3 builds the batch |

---

## Validation Sign-Off

- [x] Every requirement has an automated verify or a justified manual check
- [x] No 3 consecutive tasks without automated verify
- [x] Reuses existing harness (no Wave 0)
- [x] No watch-mode flags
- [x] `nyquist_compliant: true`

**Approval:** pending
