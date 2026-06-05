---
phase: 1
slug: secure-foundation-secrets-db-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `01-RESEARCH.md` ## Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (no test framework exists today — Wave 0 installs it) |
| **Config file** | `vitest.config.ts` (Wave 0 creates) |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15–30 seconds |

Integration tests that touch Prisma run against the provisioned Postgres (or a disposable test schema). Auth/role unit tests stub the session.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite green + `next build` succeeds
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Plan/task IDs finalized by the planner. This maps each Phase-1 requirement to its intended verification so no requirement ships unsampled.

| Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|-------------|------------|-----------------|-----------|-------------------|--------|
| DATA-02 | — | PrismaClient is a singleton; pooled `DATABASE_URL` used at runtime, `DIRECT_URL` only for migrations | unit | `npx vitest run prisma-singleton` | ⬜ pending |
| DATA-01 | — | Migration applies; User/Role + core domain tables exist | integration | `npx prisma migrate status` exits 0 | ⬜ pending |
| DATA-03 | — | Seed creates 4 camera views, 3 metals, 4 groups, quality presets, default 1920×1920 | integration | `npx vitest run seed-domain` | ⬜ pending |
| AUTH-01 | T-1-AUTH | Valid credentials → 200 + httpOnly session cookie; survives refresh | integration | `npx vitest run login` | ⬜ pending |
| AUTH-02 | — | Logout clears the session cookie | integration | `npx vitest run logout` | ⬜ pending |
| AUTH-03 | T-1-RBAC | `requireRole('ADMIN')` rejects Operator server-side (403) | unit | `npx vitest run require-role` | ⬜ pending |
| AUTH-04 | — | Admin can create/disable/role-assign users | integration | `npx vitest run user-admin` | ⬜ pending |
| AUTH-05 | T-1-RBAC | Operator hitting an Admin route gets 403 even with hidden UI | integration | `npx vitest run rbac-enforce` | ⬜ pending |
| SEC-03 | T-1-AUTHZ | Unauthenticated request to any protected route → redirect/401 (deny-by-default middleware) | integration | `npx vitest run deny-default` | ⬜ pending |
| SEC-04 | T-1-WEBHOOK | Webhook without the shared secret → 401 | integration | `npx vitest run webhook-auth` | ⬜ pending |
| SEC-02 | T-1-BLOB | Blob client-upload token route rejects unauthenticated callers; private reads go through auth-gated proxy | integration | `npx vitest run blob-guard` | ⬜ pending |
| SEC-01 | — | No secret literals in tracked files; key rotated (manual attestation) | manual | see below | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm i -D vitest @vitejs/plugin-react vite-tsconfig-paths` — install test framework
- [ ] `vitest.config.ts` — config with path aliases + node env
- [ ] `test/setup.ts` — shared fixtures (session stub, Prisma test client)
- [ ] `test/factories.ts` — Admin/Operator user factories

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RunPod key rotated | SEC-01 | Requires RunPod dashboard access (external) | Rotate key in RunPod console; confirm old key 401s; set new key in `.env.local` + `vercel env` |
| Login UX matches UI-SPEC | AUTH-01/UI-02 | Visual/interaction | Sign in on the login page; confirm teal accent, error + loading states per `01-UI-SPEC.md` |
| Operator sees no Admin nav | AUTH-05/UI | Visual | Log in as Operator; Admin/Settings nav hidden AND server returns 403 if forced |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
