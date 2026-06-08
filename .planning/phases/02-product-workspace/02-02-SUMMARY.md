---
phase: 02-product-workspace
plan: 02
subsystem: product-workspace
tags: [next-server-action, vercel-blob, private-upload, dropzone, zod, vitest, rbac]

# Dependency graph
requires:
  - phase: 02-product-workspace
    plan: 01
    provides: "createProductSchema/modelFormatEnum (lib/validation/product.ts), private access:'private' /api/blob/upload token route, lib/blob.ts, Prisma Product model"
  - phase: 01-secure-foundation-secrets-db-auth
    provides: "requireSession() RBAC boundary, Prisma singleton, app shell (app)/layout.tsx, shadcn UI primitives"
provides:
  - "createProduct Server Action (lib/products/actions.ts) — requireSession + zod + prisma.product.create(status='needs_inspection')"
  - "ModelDropzone client component — native DnD direct-to-private-Blob upload with 5 states"
  - "/products/new surface (name field + dropzone + Create product)"
  - "shadcn Progress block (app/components/ui/progress.tsx)"
affects: [inspection-dispatch, group-assignment, batch-builder, products-list]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action returns { ok, id } | { ok:false, issues } (no server-side redirect) so it stays unit-testable; the client form performs router.push"
    - "Direct-to-private-Blob client upload via @vercel/blob/client upload() with access:'private' on BOTH client + token route (decision #2)"
    - "First-party (Radix-free) native drag-and-drop dropzone with client extension allowlist + 50MB cap"
    - "Persist blob pathname into Product.modelUrl, never the non-public url (T-02-06)"

key-files:
  created:
    - lib/products/actions.ts
    - app/(app)/products/model-dropzone.tsx
    - app/(app)/products/create-product-form.tsx
    - app/(app)/products/new/page.tsx
    - app/components/ui/progress.tsx
    - test/product-create.test.ts
  modified: []

key-decisions:
  - "createProduct returns the new id rather than redirect()-ing server-side, keeping it unit-testable (no NEXT_REDIRECT throw); the client form does router.push('/products/[id]')"
  - "Store result.pathname into Product.modelUrl and never result.url — private blobs are delivered only via the auth-gated /api/file proxy (T-02-06)"
  - "access:'private' set on the client upload() call too, not only the token route (decision #2 — both sides)"
  - "modelFormat is derived client-side from the file extension and re-validated server-side by modelFormatEnum"

patterns-established:
  - "Dropzone surfaces only { pathname, format } upward via callback; persists nothing and never renders the blob url"
  - "Validation copy strings are taken verbatim from the UI-SPEC Copywriting Contract"

requirements-completed: [PROD-01]

# Metrics
duration: ~50min
completed: 2026-06-08
---

# Phase 2 Plan 02: Product Create + Private Model Upload Summary

**PROD-01 vertical slice — an operator enters a product name, drags a 3D model into a native dropzone, watches it upload directly to PRIVATE Vercel Blob, and on success the Product persists with its model pathname, format, and status `needs_inspection`, then routes to the product detail.**

## Performance
- **Duration:** ~50 min
- **Completed:** 2026-06-08
- **Tasks:** 2 of 2
- **Files created:** 6

## Accomplishments
- Shipped the `createProduct` Server Action: `requireSession()` first line (fail-closed AUTH boundary, T-02-05), `createProductSchema.safeParse`, and `prisma.product.create` persisting `modelUrl=pathname`, `modelFormat`, `status='needs_inspection'`. Returns `{ ok:true, id }` or `{ ok:false, issues }`.
- Built the first-party (Radix-free) `ModelDropzone` with all five UI-SPEC states (idle / drag-over / uploading / success / error), client-side extension allowlist + 50 MB cap, and a direct-to-Blob `@vercel/blob/client` `upload()` call with `access:'private'` + `onUploadProgress`. It surfaces only `{ pathname, format }` upward and never renders the blob url (T-02-06).
- Built the `/products/new` surface: a `requireSession()` Server Component rendering the "New product" heading and the `CreateProductForm`, whose "Create product" button is gated on a non-empty name AND a successful upload, and which `router.push`-es to `/products/[id]` on success.
- Added the official shadcn `Progress` block (T-02-SC — first-party registry copy, no new npm dep).

## Task Commits
1. **Task 1: createProduct Server Action (TDD)** — `8a210cc` (test, RED) → `b057954` (feat, GREEN)
2. **Task 2: Model dropzone + new-product surface** — `9618ded` (feat, committed with the progress block)

_TDD gate compliance: Task 1 has a `test(...)` RED commit before its `feat(...)` GREEN commit._

## Files Created
- `lib/products/actions.ts` — `createProduct` Server Action.
- `app/(app)/products/model-dropzone.tsx` — native-DnD private-upload dropzone (5 states).
- `app/(app)/products/create-product-form.tsx` — name + dropzone form, gated submit, redirect.
- `app/(app)/products/new/page.tsx` — `/products/new` Server Component (requireSession).
- `app/components/ui/progress.tsx` — official shadcn Progress block.
- `test/product-create.test.ts` — 5 tests covering happy path, pathname-not-url, invalid name, invalid format, unauth fail-closed.

## Deviations from Plan
None — plan executed as written. The `createProductResult.issues` type uses zod's `typeToFlattenedError<CreateProductInput>` for a clean public type (an implementation detail, not a behavioral deviation).

## Threat Model Compliance
- **T-02-05 (Spoofing):** `requireSession()` is the first line of `createProduct`; the action throws the 401 Response before any Prisma write (test-verified, fail-closed).
- **T-02-06 (Info Disclosure):** `access:'private'` on both the client `upload()` and the existing token route; only `result.pathname` is persisted/surfaced, never `result.url` (test-verified `modelUrl` is not an https URL).
- **T-02-07 (Tampering/DoS):** client extension allowlist (GLB/FBX/BLEND/OBJ/STL) + 50 MB cap; token route keeps `allowedContentTypes` + `addRandomSuffix`.
- **T-02-08 (stored XSS):** product name rendered as text only; React escapes by default.
- **T-02-SC:** Progress added from the official shadcn registry only.

## Verification Results
- `npx vitest run test/product-create.test.ts` — 5/5 green.
- `npx vitest run` — **15 files, 77 tests, all green** (72 from 02-01 + 5 new).
- `npx tsc --noEmit` — exit 0.
- `npx next build` — compiles; `/products/new` route emitted (5.79 kB).
- Greps in `model-dropzone.tsx`: `access: "private"`, `handleUploadUrl`, `onUploadProgress`, and the exact wrong-type / too-large copy strings all present.
- Manual phase-gate (incognito private-blob fetch) remains an operator step at the phase verification gate.

## Known Stubs
None — the slice is end-to-end functional. (The `/products/[id]` detail route is delivered by a later plan in this phase; the form redirects to it as intended.)

## Self-Check: PASSED
- Created files verified present: `lib/products/actions.ts`, `app/(app)/products/model-dropzone.tsx`, `app/(app)/products/create-product-form.tsx`, `app/(app)/products/new/page.tsx`, `app/components/ui/progress.tsx`, `test/product-create.test.ts` — all FOUND.
- Commits verified in `git log`: `8a210cc` (RED), `b057954` (Task 1 GREEN), `9618ded` (Task 2) — all FOUND.
