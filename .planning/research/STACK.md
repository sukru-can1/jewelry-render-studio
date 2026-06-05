# Stack Research

**Domain:** Enterprise internal cloud jewelry-rendering web app — NEW product layer (auth+RBAC, Postgres persistence, batch job orchestration/status, layered image compositing) on an EXISTING Next.js 15 / Vercel / RunPod / Vercel Blob stack
**Researched:** 2026-06-05
**Confidence:** HIGH (all versions verified against current npm/changelogs as of 2026-06-05; not training data)

> Scope note: This document does NOT re-research the kept stack (Next.js 15 App Router, React 19, TypeScript 5.7, Vercel Blob, RunPod serverless Blender/Cycles, Pillow post-processing). It only covers the FOUR new dimensions. See `.planning/codebase/STACK.md` for the existing stack this builds on.

---

## Recommended Stack

### Core Technologies (the four new dimensions)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Auth.js (NextAuth) v5** | `next-auth@5.0.0-beta.29` (latest beta) | Authentication + session for the internal team, App Router native | First-class App Router support (single `auth()` helper for server components, route handlers, middleware). With `session: { strategy: "jwt" }` it produces exactly an **encrypted JWT stored in an HTTP-only, SameSite, Secure cookie** — which IS the workspace convention (CLAUDE.md / PROJECT.md). Credentials provider covers internal email+password without an external IdP. Free, self-hosted, no per-MAU cost — correct for a small internal single-tenant team. RBAC (Admin/Operator) is implemented by putting `role` in the JWT via the `jwt`/`session` callbacks and gating in middleware. |
| **Prisma ORM v6** | `prisma@6.19.2` + `@prisma/client@6.19.2` | Type-safe schema, migrations, and queries for users/projects/products/object-groups/batches/jobs/history | Matches the workspace convention (Prisma + Postgres across all Glamira projects). v6 is the stable, lowest-friction line: the classic generator (`prisma-client-js`, generates into `node_modules`) "just works" on Vercel with no driver-adapter wiring. Prisma 7 exists (rust-free, driver-adapters-required) but is a migration tax not worth paying on a greenfield internal milestone — see "What NOT to use." |
| **Railway Postgres** | Postgres 16 (Railway managed) | Durable relational store | The explicit workspace convention ("Most projects use PostgreSQL on Railway with Prisma"). Standard TCP Postgres works directly with Prisma 6's default engine — no serverless-driver gymnastics. Connection pooling handled via PgBouncer/Railway pooled URL + `connection_limit` for Vercel's many short-lived function invocations. Neon is a viable alternative (see Alternatives) but Railway keeps this project consistent with the rest of the workspace. |
| **Vercel Cron + status-polling** | Native Vercel feature (`vercel.json` `crons`) | Batch job orchestration, RunPod status reconciliation, retry within the 60s function limit | RunPod renders are already async (submit → poll `/status/{id}`). The correct pattern on Vercel is: enqueue jobs as DB rows (`status=queued`), a Vercel Cron route reconciles them (submit queued → RunPod, poll running, mark done/failed, retry ≤2). No long-running worker, no extra queue infra, stays well under 60s per tick. Client UI polls the DB-backed status endpoint. |
| **sharp** | `sharp@0.34.5` | Server-side flatten of layered PNG/JPEG passes into the catalog-ready deliverable | The de-facto Node image library (libvips). `composite()` stacks the metal JPEG + transparent stone PNGs; `flatten()` removes alpha onto a background; outputs catalog PNG/JPEG. Runs in a Vercel Node function. Far faster and lower-memory than canvas-based compositing for server work. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@auth/prisma-adapter` | `^2.10.0` | Persists Auth.js users/accounts in Postgres via Prisma | Use to store user records; keep `session.strategy = "jwt"` so the session cookie stays a JWT (adapter for user storage, JWT for the session — best of both for the convention). |
| `bcryptjs` | `^3.0.2` | Hash internal-user passwords for the Credentials provider | Pure-JS, no native build (avoids `bcrypt`'s node-gyp/Vercel build pain). Hash on user create, compare in `authorize()`. `argon2` is stronger but pulls a native binary — `bcryptjs` is the safer Vercel default. |
| `zod` | `^3.25.0` | Input validation for API routes, batch-matrix builder, env vars | Validate the angles×metals×stone×pass matrix and all mutation payloads before they hit Prisma. |
| `@t3-oss/env-nextjs` | `^0.13.0` | Typed, validated env vars (`DATABASE_URL`, `AUTH_SECRET`, `RUNPOD_*`, `BLOB_*`) | Fail fast at build if a secret is missing — directly addresses the "no secrets committed / rotate exposed key" concern in PROJECT.md. |
| `swr` *or* TanStack Query | `swr@^2.3.0` / `@tanstack/react-query@^5.66.0` | Client-side polling of DB-backed job/batch status | SWR's `refreshInterval` is the lightest way to poll batch status in the outputs gallery. Pick one; SWR is simpler for pure polling. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `prisma migrate dev` / `prisma migrate deploy` | Schema migrations | `migrate dev` locally to author migrations; run `prisma migrate deploy` in the Vercel build step (`"build": "prisma generate && prisma migrate deploy && next build"`) so production DB stays in sync on each deploy. NEVER use `prisma db push` for production. |
| `prisma generate` (postinstall) | Generate client on Vercel | Add `"postinstall": "prisma generate"` so Vercel's cached deps still regenerate the client. |
| Prisma Studio | Inspect/seed data | Useful for seeding the domain (4 views, 3 metals, groups, quality presets) and verifying RBAC rows. |

## Installation

```bash
# Core (new dimensions)
npm install next-auth@beta @auth/prisma-adapter @prisma/client sharp zod swr bcryptjs
npm install @t3-oss/env-nextjs

# Dev dependencies
npm install -D prisma @types/bcryptjs

# Initialize
npx prisma init --datasource-provider postgresql
npx auth secret   # generates AUTH_SECRET into .env
```

New environment variables (Vercel project `jewelry-render-studio`):

```
DATABASE_URL          # Railway pooled Postgres connection string (?pgbouncer=true&connection_limit=1)
DIRECT_URL            # Railway direct connection (for migrations)
AUTH_SECRET           # Auth.js JWT/cookie encryption secret
CRON_SECRET           # Guards the Vercel Cron reconcile route (Authorization: Bearer)
# (existing) RUNPOD_API_KEY, RUNPOD_ENDPOINT_ID, BLOB_READ_WRITE_TOKEN, BLOB_PUBLIC_BASE_URL
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Auth.js v5 (Credentials, JWT cookie) | **Clerk** | Choose Clerk if you want hosted UI, MFA, org management, and SSO out-of-the-box and accept per-MAU pricing + external dependency. Overkill and cost-bearing for a small internal single-tenant team; also moves the session off the "JWT in HTTP-only cookie we control" convention. |
| Auth.js v5 | **Lucia / hand-rolled JWT** | Lucia is now a "learning resource," not a maintained library — do not adopt. Hand-rolling JWT-in-cookie is possible but re-implements CSRF, rotation, callbacks; Auth.js gives the same cookie-JWT outcome with less risk. |
| Railway Postgres | **Neon (Vercel Marketplace)** | Choose Neon if you want auto-suspend/scale-to-zero, branching per preview deploy, and tightest Vercel integration. Requires Prisma `@prisma/adapter-neon` driver adapter for the serverless driver. Vercel no longer sells "Vercel Postgres" directly — it provisions Neon via the Marketplace. Reasonable, but Railway keeps parity with the rest of the workspace. |
| Vercel Cron + DB polling | **Inngest / Trigger.dev / QStash** | Choose a managed queue (Inngest, Trigger.dev, Upstash QStash) if batch fan-out grows large, you need durable step functions, automatic retries/backoff, and concurrency control beyond a cron tick. For this milestone's matrix sizes (4 views × 3 metals × few passes), a DB-as-queue + cron reconciler is simpler and free. Revisit if batches become very large or need fine-grained concurrency limits. |
| sharp (server flatten) | **HTML Canvas / `node-canvas`** | Use Canvas only for the *client-side* interactive layer toggle/preview (stacking PNGs in the browser via CSS `position:absolute`/`mix-blend` or a `<canvas>`). For server flatten, sharp is faster and lighter than `node-canvas` (which needs Cairo native deps and struggles on Vercel). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Prisma 7** (`prisma@7.x`) | v7 makes the rust-free client the default and **requires driver adapters for every DB**, plus a new generator config (`provider = "prisma-client"`, explicit `output` path, no generation into `node_modules`). It's a real migration surface for marginal benefit on a greenfield internal app. | Prisma 6 (`6.19.2`) — stable, zero driver-adapter wiring with Railway TCP Postgres. Upgrade to 7 later as a deliberate task. |
| **Vercel Postgres (direct product)** | Vercel discontinued first-party Postgres (Q4 2024–Q1 2025); it now redirects to Neon via the Marketplace. Docs/tutorials referencing `@vercel/postgres` as a Vercel-native DB are stale. | Railway Postgres (convention) or Neon via Marketplace. |
| **`prisma db push` in production** | Skips migration history; causes drift and unrepeatable schema state across environments. | `prisma migrate dev` (author) + `prisma migrate deploy` (CI/build). |
| **Long-running work inside a Vercel function** | Vercel functions cap at 60s (`vercel.json` `maxDuration: 60`). Waiting on a full RunPod render in-request will time out. | Async submit + DB status row + Cron reconcile + client polling. RunPod already supports this (`/run` + `/status/{id}`). |
| **`bcrypt` (native) / `argon2` (native)** | Native node-gyp builds are flaky on Vercel's build image and bloat cold starts. | `bcryptjs` (pure JS). |
| **`node-canvas` for server flatten** | Needs Cairo/Pango system libraries not present on Vercel's runtime; heavier and slower than libvips. | `sharp` server-side; canvas/CSS only in the browser. |
| **Storing job state in Vercel Blob (current approach)** | Public Blob JSON has no transactions, race conditions on concurrent batch updates, and exposes recipes/results (a stated CONCERN). | Postgres + Prisma for all structured state; keep Blob ONLY for binaries (models, renders). |
| **NextAuth v4** | v4 predates the App Router auth model; v5's `auth()` unifies server components/route handlers/middleware. | Auth.js v5 (`next-auth@beta`). |

## Stack Patterns by Variant

**If batch fan-out stays small (this milestone: ≤ ~4×3×5 ≈ 60 jobs/batch):**
- Use the DB-as-queue + Vercel Cron reconciler (every 1 min on Pro plan).
- Because it is free, has no extra infra, and comfortably fits the 60s function budget per tick.

**If batch fan-out grows large or needs concurrency caps / durable retries:**
- Introduce Inngest or Upstash QStash as the job engine; keep Postgres as the source of truth for status.
- Because cron-tick reconciliation does not give per-job backoff or concurrency control at scale.

**If you later want preview-deploy DB branching / scale-to-zero:**
- Switch to Neon via Vercel Marketplace + `@prisma/adapter-neon`.
- Because Neon branches per Vercel preview and auto-suspends, matching serverless economics.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next-auth@5.0.0-beta.29` | `next@^15.1`, `react@^19` | v5 beta is the actively-maintained, App-Router-correct line; widely used in production despite the `beta` tag. Pin the exact beta version (betas can introduce breaking changes). |
| `@auth/prisma-adapter@^2.10` | `next-auth@5 beta`, `@prisma/client@6` | Adapter from the `@auth/*` scope (NOT `@next-auth/*`, which is v4-era). |
| `prisma@6.19.2` | `@prisma/client@6.19.2` | Keep `prisma` (dev) and `@prisma/client` (runtime) on the SAME version. |
| `prisma@6` | Railway Postgres 16, Node on Vercel | Default rust engine works with standard TCP Postgres; no driver adapter needed. Use pooled `DATABASE_URL` + `connection_limit=1` for serverless, `DIRECT_URL` for migrations. |
| `sharp@0.34.5` | Node on Vercel (linux x64) | Vercel installs the correct prebuilt binary automatically; no extra config. |
| `bcryptjs@^3` | Node/Vercel | Pure JS; runs in Node runtime route handlers (not Edge — keep `authorize()` on the Node runtime). |

## Sources

- npm `next-auth` versions / Auth.js v5 status — latest beta `5.0.0-beta.29`, App Router native, JWT-cookie session (HIGH; npm + authjs.dev migrating-to-v5)
- Prisma changelog/releases — v6.19.2 stable line; v7.0.0 (2025-11-19) rust-free + driver-adapters-required (HIGH; prisma.io/changelog, prisma.io/blog/announcing-prisma-orm-7-0-0)
- Prisma driver adapters — `@prisma/adapter-neon` for Neon, `@prisma/adapter-pg` for TCP; v6 default engine needs neither (HIGH; prisma.io docs, npmjs `@prisma/adapter-pg`)
- Neon ⇄ Vercel transition — Vercel Postgres discontinued, now Neon via Marketplace (HIGH; neon.com/docs/guides/vercel-postgres-transition-guide, vercel.com/marketplace/neon)
- Vercel Cron + 60s limit + `after()` for background work (HIGH; vercel.com/docs/cron-jobs, Next.js 15.1 `after()` release notes)
- sharp `0.34.5` `composite()` / `flatten()` (HIGH; sharp.pixelplumbing.com/api-composite, npm `sharp`)
- Workspace conventions — Prisma+Postgres+Railway, JWT in HTTP-only cookies (HIGH; CLAUDE.md, .planning/PROJECT.md lines 65, 73)
- Existing stack reconciliation (HIGH; .planning/codebase/STACK.md, INTEGRATIONS.md)

---
*Stack research for: enterprise internal jewelry-rendering web app (new product layer)*
*Researched: 2026-06-05*
