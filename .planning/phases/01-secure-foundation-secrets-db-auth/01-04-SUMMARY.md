---
phase: 01-secure-foundation-secrets-db-auth
plan: 04
subsystem: blob-security-secret-rotation
tags: [vercel-blob, private-storage, auth-gated-proxy, requireSession, sec-01, sec-02, secret-rotation, vitest]
requires:
  - "lib/auth/rbac.ts (01-03) — requireSession() 401 boundary (consumed by upload route + /api/file proxy)"
  - "@vercel/blob ^2.4 (01-01) — private storage get(pathname,{access:'private'}) + put(access:'private')"
  - "Vitest harness test/setup.ts + vitest.config.ts (01-01/01-03)"
provides:
  - "app/api/blob/upload/route.ts — SEC-02 auth-gated client-upload token issuance (requireSession in onBeforeGenerateToken)"
  - "app/api/file/route.ts — SEC-02 private-blob auth-gated proxy (requireSession next to get(pathname,{access:'private'}), streams result.stream)"
  - "lib/blob.ts — putPrivate() (forces access:'private' for all NEW writes) + privateUrl() (/api/file?pathname=… delivery path)"
  - "docs/SECRET_ROTATION.md — SEC-01 rotation runbook + pending operator attestation"
  - "test/blob-guard.test.ts — 6 tests: upload-route 401/auth-ordering + proxy 401/400/200/404"
affects:
  - app/api/blob/upload/route.ts
tech-stack:
  added: []
  patterns:
    - "Private Blob delivery = private store + put(access:'private') + GET /api/file proxy calling get(pathname,{access:'private'}) and streaming result.stream; auth verified IN the handler next to get(), NOT in middleware (RESEARCH Pattern 4 / Pitfall 5 — no time-limited-URL API exists for private blobs)"
    - "Upload-token route locked by awaiting requireSession() as the first line of onBeforeGenerateToken so no write token is minted for an unauthenticated caller (RESEARCH Pitfall 4); the thrown 401 Response is passed through handleUpload's catch"
    - "Secret rotation is a manual dashboard action (no headless CLI) recorded as a PENDING attestation in docs/SECRET_ROTATION.md — code reads all secrets from process.env so rotation needs no code change"
key-files:
  created:
    - app/api/file/route.ts
    - lib/blob.ts
    - docs/SECRET_ROTATION.md
    - test/blob-guard.test.ts
  modified:
    - app/api/blob/upload/route.ts
decisions:
  - "Proxy parses pathname from new URL(req.url) instead of req.nextUrl so the GET handler is invocation-agnostic (works under a plain Request in tests and a NextRequest at runtime) — fixed a test-time 'cannot read searchParams of undefined'"
  - "Adapted the RESEARCH Pattern 4 example to the real @vercel/blob v2.4 get() contract: returns null (not found) or a discriminated union on statusCode (200 with stream+blob.contentType / 304 with null stream); proxy returns 404 on null OR non-200"
  - "Reworded the proxy's documentation comment to avoid the literal substring 'signed' so the plan's own anti-pattern verifier (/signed/i) passes — the design genuinely uses NO time-limited URLs"
  - "RunPod key + Blob token rotation left as PENDING operator attestation (not blocking) per checkpoint guidance: dashboard action no agent can perform headless; all code-side holes are closed and committed"
metrics:
  duration_min: 13
  completed: 2026-06-05
---

# Phase 01 Plan 04: Blob Security + Secret Rotation Summary

Closed the two remaining Phase-1 security holes: locked the open Vercel Blob client-upload token route behind `requireSession()` and added the private-Blob auth-gated `/api/file` proxy (the corrected `get(pathname,{access:'private'})` model — no time-limited URLs), then wrote the SEC-01 secret-rotation runbook and recorded the leaked-key rotation as a pending operator attestation. All proven by 6 new blob-guard tests; full suite 43/43 green, `tsc --noEmit` exit 0.

## What Was Built

- **SEC-02 (upload-token guard):** `app/api/blob/upload/route.ts` — `onBeforeGenerateToken` now `await requireSession()` as its first line, so an unauthenticated POST gets a 401 and **no** write token is minted. The thrown 401 `Response` is detected in the route's `catch` (`error instanceof Response`) and returned verbatim; other failures stay 400. `allowedContentTypes` kept restricted to the GLB/FBX/BLEND/OBJ/STL + image/json set (per CONCERNS — never wide open).
- **SEC-02 (private-blob proxy):** `app/api/file/route.ts` (Node runtime) — `GET` verifies `requireSession()` FIRST, right next to `get()` (NOT middleware — Vercel warns a middleware bug could leak cached content). Reads `pathname` from `new URL(req.url).searchParams` (400 if missing), calls `get(pathname, { access: "private" })`, returns 404 on `null`/non-200, else streams `result.stream` with `Content-Type` from the blob, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-cache`. No time-limited-URL scheme (that API does not exist for private blobs — RESEARCH Pitfall 5).
- **SEC-02 (write helper):** `lib/blob.ts` — `putPrivate(pathname, data, opts)` forces `access:'private'` so all NEW writes go private by default; `privateUrl(pathname)` returns `/api/file?pathname=…` for downstream consumers (gallery/delivery land in later phases). Legacy public blobs documented as accepted-as-burned for Phase 1 (re-upload = Phase-8, Open Question 3).
- **SEC-01 (rotation runbook):** `docs/SECRET_ROTATION.md` — full rotation steps for the leaked `RUNPOD_API_KEY` (`rpa_…`) and `BLOB_READ_WRITE_TOKEN` (`vercel_blob_rw_…`), the three-place invariant (local / Vercel / RunPod worker), old-key `401` verification, the `git grep` no-literal proof, and a **PENDING** operator attestation block.

## Tasks Completed

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| RED | Failing blob-guard test (upload 401/order + proxy 401/400/200/404) | c230861 | blob-guard (6, failing) |
| 1 | Lock Blob upload-token route behind requireSession (SEC-02) | bf51158 | blob-guard upload (2) green |
| 2 | Private-blob auth-gated proxy + putPrivate/privateUrl helpers (SEC-02) | 237f64e | blob-guard proxy (4) green |
| 3 | SECRET_ROTATION runbook + pending attestation (SEC-01, manual rotation) | ea4a733 | n/a (doc + attestation) |

## Verification

- `npx vitest run blob-guard` → **6 passed**: upload route rejects unauth (401, no token) + requireSession runs before token config; proxy denies unauth (401, get() never called) / 400 missing pathname / streams private blob with correct headers via `get(pathname,{access:'private'})` / 404 on null.
- `npx vitest run` → **43 passed (8 files)** — no regression to the 37 prior tests.
- `npx tsc --noEmit` → **exit 0**.
- Task 2 source verifier → `Task2 verify OK` (`requireSession` + `access:'private'` present, no signed-URL anti-pattern, `putPrivate` private).
- `git grep -nE 'rpa_[A-Za-z0-9]|vercel_blob_rw_[A-Za-z0-9]' -- ':!*.example' ':!.planning/*'` → **no output** (no secret literal in tracked source; `.planning/` docs intentionally reference truncated leaked patterns as an audit trail and contain no full live secret).
- `.env` / `.env.local` confirmed gitignored (`git check-ignore`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Proxy read req.nextUrl which is undefined for a plain Request**
- **Found during:** Task 2 (blob-guard proxy tests)
- **Issue:** The RESEARCH example used `req.nextUrl.searchParams`; the test (and any non-NextRequest invocation) passes a plain `Request` with no `nextUrl`, throwing `Cannot read properties of undefined (reading 'searchParams')`.
- **Fix:** Parse via `new URL(req.url).searchParams.get("pathname")` — valid for both `Request` and `NextRequest`, keeps the handler invocation-agnostic.
- **Files modified:** app/api/file/route.ts
- **Commit:** 237f64e

**2. [Rule 1 - Bug] get() return shape did not match the RESEARCH example**
- **Found during:** Task 2
- **Issue:** RESEARCH Pattern 4 assumed `result.statusCode !== 200` on a non-null object. The real `@vercel/blob` v2.4 `get()` returns `Promise<GetBlobResult | null>` — `null` when not found, otherwise a discriminated union on `statusCode` (200 with `stream`+`blob.contentType`, or 304 with `stream: null`).
- **Fix:** Proxy guards `if (!result || result.statusCode !== 200) return 404` before streaming, matching the typed contract; `tsc` exit 0.
- **Files modified:** app/api/file/route.ts
- **Commit:** 237f64e

**3. [Rule 3 - Blocking] Plan's own verifier tripped on the word "signed" in a comment**
- **Found during:** Task 2 verify step
- **Issue:** The verifier rejects any `/signed/i` match in `app/api/file/route.ts`; my comment documented "NO signed-URL scheme", legitimately containing the substring.
- **Fix:** Reworded the comment to "NO time-limited-URL scheme" so the verifier passes while the design intent (no signed/time-limited URLs) is preserved.
- **Files modified:** app/api/file/route.ts
- **Commit:** 237f64e

## Authentication Gates

None encountered during code execution. (The SEC-01 key rotation is a *manual operator* action, documented below — not a runtime auth gate that blocked the executor.)

## SEC-01 Rotation — PENDING Operator Attestation

The code-side of SEC-01 is complete: **no secret literal exists in any tracked source file** (`git grep` clean), all secrets are read from `process.env` (`lib/runpod.ts`; `@vercel/blob`), and `.env`/`.env.local` are gitignored and were neither printed nor modified. The **rotation itself** — revoking the leaked `RUNPOD_API_KEY` and `BLOB_READ_WRITE_TOKEN` and minting new ones — is a RunPod/Vercel **dashboard action** that no CLI/agent can perform headlessly, so it is recorded as a **PENDING attestation** in `docs/SECRET_ROTATION.md` rather than blocking the phase.

**Operator must perform (exact steps in docs/SECRET_ROTATION.md):**
1. RunPod dashboard → revoke `rpa_PZ7KGGSJ…`, create a new key; confirm the old key 401s against `…/status/x`.
2. Set the new key in all three places: `.env.local`, Vercel (`vercel env add RUNPOD_API_KEY`), RunPod worker container env.
3. Rotate `BLOB_READ_WRITE_TOKEN` the same way (Vercel Blob dashboard) → update web + worker.
4. Re-run `git grep -nE 'rpa_[A-Za-z0-9]|vercel_blob_rw_[A-Za-z0-9]' -- ':!*.example' ':!.planning/*'` → expect no output.
5. Sign the attestation checklist in `docs/SECRET_ROTATION.md`.

## Known Stubs

None. `lib/blob.ts` `putPrivate`/`privateUrl` are real helpers (no UI consumer in this plan — gallery/delivery wiring is a later-phase concern, explicitly noted, not a data stub). The proxy and upload route are fully functional and tested.

## Self-Check: PASSED

- Files exist: `app/api/file/route.ts`, `lib/blob.ts`, `docs/SECRET_ROTATION.md`, `test/blob-guard.test.ts`, `app/api/blob/upload/route.ts` — all present.
- Commits present: c230861 (test), bf51158 (Task 1), 237f64e (Task 2), ea4a733 (Task 3) — all in git history.
