---
phase: 01-secure-foundation-secrets-db-auth
type: skeleton
created: 2026-06-05
---

# Walking Skeleton — Jewelry Render Studio (Enterprise product layer)

> The thinnest end-to-end stack for the new multi-user product layer wrapped around
> the existing (reused, NOT rebuilt) Next.js 15 / RunPod / Blender render pipeline.
> Records the architectural decisions every later phase builds on without renegotiating.

## What the skeleton proves (end-to-end, before any feature breadth)

A real person can: open the app → be denied by default and redirected to `/login`
→ sign in with seeded Admin credentials (bcrypt-checked against a row in Railway
Postgres, read through the pooled Prisma singleton) → land on the authenticated app
shell → read seeded domain settings (4 views / 3 metals / 4 groups / quality presets)
that came out of Postgres → log out. That single thread exercises secrets→DB→auth→UI.

## Locked Architectural Decisions

| Concern | Decision | Rationale / Source |
|---------|----------|--------------------|
| Framework | Keep existing **Next.js 15.1.x App Router + React 19** | Reuse, don't rebuild (hard constraint). |
| Runtime split | **Edge** middleware (auth.config.ts, no Prisma/bcrypt) + **Node** route handlers (auth.ts, rbac, blob proxy) | RESEARCH Pattern 1 — Prisma/bcrypt crash on edge. |
| Auth | **Auth.js v5** `next-auth@5.0.0-beta.31` (pin EXACT), Credentials provider, `session.strategy="jwt"`, encrypted JWT in HTTP-only cookie | STACK lock; AUTH-01. NOT v4, NOT Clerk, NOT hand-rolled. |
| Password hashing | **bcryptjs** `^3.0.3`, work factor 12 | Pure JS, safe on Vercel build. NOT native bcrypt/argon2. |
| RBAC | Single `requireRole("Admin"\|"Operator")` server-side gate in `lib/auth/rbac.ts`; middleware is coarse first gate only | AUTH-03/05; UI hiding is never the boundary. |
| ORM | **Prisma 6** (`prisma`+`@prisma/client` `6.19.2`, install via pinned exact — NOT `@latest`=7) | STACK lock; v7 needs driver adapters. |
| Database | **Railway Postgres 16**. Pooled `DATABASE_URL` (`connection_limit=1`) at runtime + `DIRECT_URL` for migrations. PrismaClient `globalThis` singleton. | DATA-01/02; avoids pool exhaustion (PITFALL #2). |
| Migrations | `prisma migrate dev` (dev) / `prisma migrate deploy` (prod build step). NEVER `db push` to prod; NEVER migrate over the pooled URL. | RESEARCH PITFALL #6. |
| Seed | `prisma/seed.ts` via `tsx`, run by `prisma db seed`; first Admin from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` env (never hardcoded). | DATA-03. |
| Typed env | **`@t3-oss/env-nextjs`** + `zod@^3.25` (honor STACK lock, NOT zod 4) — fail-fast on missing secret. | SEC-01, SEC-14 config. |
| Blob (binaries) | Keep Vercel Blob for binaries only. Upgrade `@vercel/blob` `^1.0.2`→`^2.4.0`. **Private** store; new writes `access:'private'`; delivery via auth-gated proxy route `GET /api/file` calling `get(pathname,{access:'private'})`. NO signed URLs. | SEC-02 (corrected model). |
| Webhook | `POST /api/webhooks/runpod` allowlisted in middleware, verified in-handler with `crypto.timingSafeEqual` against `RUNPOD_WEBHOOK_SECRET` (scaffold; wired Phase 4). | SEC-04. |
| Design system | shadcn/ui (`new-york`, base `neutral`, CSS vars) + **Tailwind v4** + Geist fonts via `next/font`; teal accent, NO purple. Tokens + 16-component set from `01-UI-SPEC.md`. | UI-SPEC (approved). |
| Structured state | Postgres is the system of record. Existing Blob JSON job-state is NOT migrated this phase (DATA-05 = Phase 8); schema keeps `Job.runpodJobId` + `JobStatus` enum so Phase-8 backfill is possible. | RESEARCH Runtime State Inventory. |

## Directory layout (ADDITIONS — extend, do not restructure existing app/, lib/, workers/)

```
prisma/
  schema.prisma          datasource(url=DATABASE_URL, directUrl=DIRECT_URL) + models + enums
  migrations/            from `prisma migrate dev`
  seed.ts                DATA-03 domain seed + first Admin (env-driven)
lib/
  db/prisma.ts           PrismaClient globalThis singleton
  env.ts                 @t3-oss/env-nextjs typed env (fail-fast)
  auth/
    auth.config.ts       edge-safe config (authorized/jwt/session callbacks, pages) — NO prisma/bcrypt
    auth.ts              Node: NextAuth(authConfig)+Credentials.authorize; exports auth/handlers/signIn/signOut
    rbac.ts              requireSession(), requireRole(role)
middleware.ts            ROOT — deny-by-default matcher; imports ONLY auth.config.ts
app/
  api/auth/[...nextauth]/route.ts   re-export { GET, POST } from lib/auth/auth handlers
  api/file/route.ts                 authed private-blob proxy (SEC-02)
  api/webhooks/runpod/route.ts      shared-secret scaffold (SEC-04)
  api/admin/users/route.ts          Admin user CRUD (AUTH-04)
  (auth)/login/page.tsx             login surface (UI-SPEC §2)
  admin/users/page.tsx              user management (UI-SPEC §3)
  admin/settings/page.tsx           domain settings VIEW (UI-SPEC §4; edit=DATA-04/Phase 2)
  forbidden/page.tsx                calm 403 surface (UI-SPEC §5)
  globals.css                       token CSS variables (reconciled with existing styles.css)
  components/ui/*                    shadcn output
components.json                     shadcn config
test/, vitest.config.ts             Vitest harness (Wave 0)
```

## Deployment target (unchanged)

Vercel project `jewelry-render-studio` (`prj_I3y70TPePBfjGvxgjryDncHeSGVe`); API routes capped at 60s
(`vercel.json`). New env vars to configure in Vercel + `.env.local`: `DATABASE_URL`, `DIRECT_URL`,
`AUTH_SECRET`, `RUNPOD_WEBHOOK_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`. Rotate the
already-leaked `RUNPOD_API_KEY` and `BLOB_READ_WRITE_TOKEN` (SEC-01). Actual deploy is Phase 8.

## Out of skeleton scope (deferred — schema-compatible but not built here)

- DATA-05 Blob job-state migration → Phase 8.
- SEC-05 hardcoded `ring99` URL / fallback recipe path removal → Phase 8.
- DATA-04 Admin *edit* of domain settings → Phase 2 (Phase 1 ships seed + read-only Admin view).
- Worker `BLOB_ACCESS=private` flip + gallery/delivery consumers → later phases (proxy route established here).
