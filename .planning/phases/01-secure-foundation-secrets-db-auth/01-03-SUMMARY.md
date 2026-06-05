---
phase: 01-secure-foundation-secrets-db-auth
plan: 03
subsystem: auth-rbac-gating
tags: [auth-js, credentials, bcrypt, jwt, rbac, middleware, deny-by-default, webhook, vitest, walking-skeleton]
requires:
  - "lib/db/prisma.ts (01-01) — DATA-02 PrismaClient singleton (authorize() user lookup)"
  - "lib/env.ts (01-01) — typed AUTH_SECRET + RUNPOD_WEBHOOK_SECRET"
  - "@prisma/client User { id, email, passwordHash, role, disabled } + Role { Admin Operator } (01-01)"
  - "Vitest harness test/setup.ts (fakeSession) + test/factories.ts (adminUser/operatorUser) (01-01)"
  - "next-auth@5.0.0-beta.31 + bcryptjs (installed)"
provides:
  - "lib/auth/auth.config.ts — edge-safe Auth.js config (authorized deny-by-default + jwt/session role callbacks)"
  - "lib/auth/auth.ts — Credentials provider authorize() (zod + prisma.findUnique + bcrypt.compare + disabled guard); exports { handlers, auth, signIn, signOut, authorize }"
  - "lib/auth/rbac.ts — requireSession()/requireRole() server-side boundary (401/403 Responses) — AUTH-05 gate"
  - "app/api/auth/[...nextauth]/route.ts — NextAuth GET/POST catch-all handler"
  - "middleware.ts — SEC-03 deny-by-default edge gate (matcher allowlist)"
  - "app/api/webhooks/runpod/route.ts — SEC-04 shared-secret webhook scaffold (timingSafeEqual)"
  - "types/next-auth.d.ts — role augmentation on Session.user + JWT"
  - "test/{auth-login,require-role,deny-default,webhook-auth}.test.ts — AUTH-01/02/03 + SEC-03/04 coverage"
affects:
  - vitest.config.ts
tech-stack:
  added: []
  patterns:
    - "Split Auth.js config: edge-safe auth.config.ts (no Prisma/bcrypt) + Node auth.ts (Credentials provider) so middleware stays edge-safe (RESEARCH Pattern 1 / Pitfall 1)"
    - "Credentials authorize: zod-validate -> prisma.findUnique -> reject missing/disabled -> bcrypt.compare; generic null (no user enumeration)"
    - "requireRole() server-side RBAC boundary throwing 401/403 Responses (fail-closed) — UI hiding is not the gate (AUTH-05)"
    - "Deny-by-default middleware matcher allowlisting only /api/auth, /login, static, favicon, /api/webhooks/runpod (SEC-03)"
    - "Webhook shared-secret via length-guarded crypto.timingSafeEqual, verified in-handler not in middleware (SEC-04)"
key-files:
  created:
    - lib/auth/auth.config.ts
    - lib/auth/auth.ts
    - lib/auth/rbac.ts
    - app/api/auth/[...nextauth]/route.ts
    - middleware.ts
    - app/api/webhooks/runpod/route.ts
    - types/next-auth.d.ts
    - test/auth-login.test.ts
    - test/require-role.test.ts
    - test/deny-default.test.ts
    - test/webhook-auth.test.ts
  modified:
    - vitest.config.ts
decisions:
  - "Reconciled an interrupted prior run: lib/auth/{auth.config,auth,rbac}.ts, the NextAuth route handler, and types/next-auth.d.ts were already written on disk and matched RESEARCH Patterns 1/2 for beta.31 — kept them, fixed only the route handler re-export (handlers object, not named GET/POST) and a session-callback role type narrowing."
  - "Added a Vitest resolve.alias for `next/server` -> next/server.js plus server.deps.inline ['next-auth','@auth/core'] so importing the Node NextAuth instance (lib/auth/auth.ts) works under Vitest's node resolver; this is test-harness-only and does not affect runtime edge-safety (asserted separately by deny-default source-text test)."
  - "authorize() is exported as a standalone function so auth-login.test.ts drives it directly against a mocked prisma.user.findUnique (no live DB) — live browser login stays a manual check in Plan 05."
metrics:
  duration_min: 25
  completed: 2026-06-05
---

# Phase 01 Plan 03: Auth + RBAC + Route-Gating Core Summary

Split edge-safe/Node Auth.js v5 (beta.31) Credentials login that bcrypt-checks the seeded User and issues a role-bearing HTTP-only JWT, a fail-closed `requireRole()` server boundary, deny-by-default middleware, and a `timingSafeEqual` shared-secret RunPod webhook — the auth half of the Walking Skeleton, all proven by 24 Vitest tests with no live DB.

## What Was Built

- **AUTH-01/02 (login/logout):** `lib/auth/auth.ts` — `NextAuth({...authConfig, providers:[Credentials({authorize})]})`. `authorize()` zod-validates `{email,password}`, looks up `prisma.user.findUnique`, rejects missing/`disabled` users, `bcrypt.compare`s the password, and returns `{id,email,role}` or generic `null` (no email-vs-password enumeration). Exports `{ handlers, auth, signIn, signOut }`; `signOut` + `pages.signIn="/login"` clear the cookie and land on /login.
- **AUTH-03 (role in session):** `lib/auth/auth.config.ts` (edge-safe, no Prisma/bcrypt) — `jwt` callback copies `user.role`→`token.role`, `session` callback copies it→`session.user.role`. `types/next-auth.d.ts` augments `Session.user` and `JWT` with `role: "Admin" | "Operator"`.
- **AUTH-05 boundary:** `lib/auth/rbac.ts` — `requireSession()` (throws 401 Response) and `requireRole(role)` (throws 403 for an Operator hitting an Admin route). Fail-closed: an uncaught throw still denies.
- **SEC-03 (deny-by-default):** root `middleware.ts` — `NextAuth(authConfig)` edge gate with `matcher` allowlisting only `/api/auth`, `/login`, `_next/static`, `_next/image`, `favicon.ico`, and `/api/webhooks/runpod`. Imports only `auth.config.ts`.
- **SEC-04 (webhook secret):** `app/api/webhooks/runpod/route.ts` (Node runtime) — verifies `x-webhook-secret` against `RUNPOD_WEBHOOK_SECRET` with a length-guarded `crypto.timingSafeEqual`; 401 on missing/wrong, `{ ok: true }` on match. Phase-4 reconcile logic left as a TODO.
- **Route handler:** `app/api/auth/[...nextauth]/route.ts` re-exports `{ GET, POST } = handlers`.

## Tasks Completed

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | Split auth config + Credentials + RBAC + login/logout test (AUTH-01/02/03) | 52d5b7f | auth-login (8) + require-role (6) |
| 2 | Deny-by-default middleware + edge-safety guard (SEC-03) | a0b6c69 | deny-default (6) |
| 3 | RunPod webhook shared-secret scaffold (SEC-04) | 490cc50 | webhook-auth (4) |

## Verification

- `npx vitest run` → **37 passed (7 files)**; the 4 new files contribute 24 tests (auth-login 8, require-role 6, deny-default 6, webhook-auth 4).
- `npx tsc --noEmit` → **exit 0**.
- auth-login proves authorize() valid→user / bad-pw→null / disabled→null / missing-user→null / malformed→null, role survives jwt→session, signOut exported + /login wiring.
- deny-default proves unauth→deny (`/admin/users`, `/`) / `/login`→public / authed→allow, plus a source-text assertion that `middleware.ts` imports no Prisma/bcrypt/`auth.ts`.
- webhook-auth proves missing/wrong/same-length-wrong secret→401, correct→200 `{ ok: true }`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest could not import the Node NextAuth instance**
- **Found during:** Task 1 (auth-login.test.ts)
- **Issue:** `next-auth/lib/env.js` imports the bare specifier `next/server`, which Vitest's node resolver fails to map to `next/server.js` ("Cannot find module .../next/server"). The error fired because next-auth was externalized, so Node's native ESM loader resolved the bare specifier.
- **Fix:** Added `resolve.alias["next/server"] = require.resolve("next/server.js")` and `test.server.deps.inline = ["next-auth","@auth/core"]` to `vitest.config.ts` so Vite transforms next-auth and applies the alias. Test-harness-only; runtime edge-safety is unchanged and independently asserted by the deny-default source-text test.
- **Files modified:** vitest.config.ts
- **Commit:** 52d5b7f

**2. [Rule 1 - Bug] Route handler re-exported non-existent named GET/POST**
- **Found during:** Task 1 (tsc)
- **Issue:** The partial `route.ts` did `export { GET, POST } from "@/lib/auth/auth"`, but `auth.ts` exports a `handlers` object, not named `GET`/`POST` (TS2305).
- **Fix:** Changed to `import { handlers } from "@/lib/auth/auth"; export const { GET, POST } = handlers;`.
- **Files modified:** app/api/auth/[...nextauth]/route.ts
- **Commit:** 52d5b7f

**3. [Rule 1 - Bug] session callback role assignment type error**
- **Found during:** Task 1 (tsc)
- **Issue:** In `auth.config.ts` the session callback's `token.role` resolved to `{}` (the JWT augmentation isn't applied to the generic callback param), failing assignment to `AppRole` (TS2322).
- **Fix:** Narrowed via `const role = token.role as "Admin" | "Operator" | undefined;` before the guarded assignment.
- **Files modified:** lib/auth/auth.config.ts
- **Commit:** 52d5b7f

**4. [Rule 1 - Bug] authorized callback returns a boolean, not a Promise**
- **Found during:** Task 2 (deny-default.test.ts)
- **Issue:** Initial test used `await expect(...).resolves`, but the `authorized` callback returns a synchronous boolean → "You must provide a Promise to expect()".
- **Fix:** Asserted the boolean directly (`expect(call(...)).toBe(...)`).
- **Files modified:** test/deny-default.test.ts
- **Commit:** a0b6c69

### Reconciliation of Interrupted Prior Run

The prior (socket-dropped) run had written `lib/auth/{auth.config,auth,rbac}.ts`, `app/api/auth/[...nextauth]/route.ts`, and `types/next-auth.d.ts` but committed nothing. These were reviewed against RESEARCH Patterns 1/2 and the installed beta.31 API: the auth core, rbac, and type augmentation were correct and kept as-is; only the route handler re-export and the session-callback narrowing needed fixes (above). All still-missing artifacts (`middleware.ts`, the webhook helper, and all four tests) were created. No partial work was discarded.

## Beta.31 API Notes

No callback/handler signature divergence from the partial files was found against `next-auth@5.0.0-beta.31`: `NextAuth({...authConfig, providers})` returns `{ handlers, auth, signIn, signOut }` (handlers is `{ GET, POST }`); the `authorized`/`jwt`/`session` callback shapes in `auth.config.ts` matched. The only beta-specific adjustment was the route handler consuming `handlers` as an object rather than named GET/POST exports.

## Known Stubs

- `app/api/webhooks/runpod/route.ts` — the Phase-4 reconcile logic is an intentional TODO (the plan scopes this to the auth gate only; full status handling ships in Phase 4). The auth path (`timingSafeEqual` secret check + 401/200) is fully implemented and tested, so the endpoint never ships unauthenticated.

No data-rendering stubs were introduced (no UI in this plan; the login page is Plan 05).

## Self-Check: PASSED

All 12 created files exist on disk and all 3 task commits (52d5b7f, a0b6c69, 490cc50) are present in git history.
