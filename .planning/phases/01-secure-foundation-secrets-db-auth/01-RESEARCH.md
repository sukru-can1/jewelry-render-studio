# Phase 1: Secure Foundation (Secrets + DB + Auth) — Research

**Researched:** 2026-06-05
**Domain:** Auth (Auth.js v5 + Credentials/JWT-cookie + RBAC), Prisma 6 + Railway Postgres on Vercel serverless, secret rotation, private Vercel Blob, shadcn/Tailwind v4 init
**Confidence:** HIGH (all package versions re-verified against live npm 2026-06-05; private-Blob delivery model re-verified against current Vercel docs — it changed materially from what STACK.md assumed)

---

## Summary

Phase 1 builds the hardened, multi-user foundation under the existing Next.js 15 / React 19 / Vercel Blob / RunPod render app. Nothing in the render pipeline (`workers/`, `lib/runpod.ts`, `lib/enterprise-recipes.ts`) is rebuilt — this phase adds three new cross-cutting layers: (1) **Auth.js v5 Credentials login** issuing a JWT in an HTTP-only cookie with a server-side `requireRole()` gate; (2) **Prisma 6 + Railway Postgres** as the relational system of record with a serverless-safe pooled topology and a domain seed; and (3) **security hardening** — rotate the exposed RunPod key, move all secrets to env, lock down the open Blob upload route, and make new Blob writes private.

Two findings materially update the upstream research and must drive the plan:

1. **Private Vercel Blob no longer means "signed/time-limited URLs."** As of `@vercel/blob` ≥ 2.3 (current `2.4.0`), private storage requires a **private Blob store** and is served by **proxying through an authenticated route** that calls `get(pathname, { access: 'private' })` and streams the result — there is no public long-lived signed URL. SEC-02's intent (assets not publicly readable, access gated by auth) is satisfied by this proxy pattern, not by signed URLs. Vercel explicitly warns: do **not** rely on middleware for blob auth — verify auth in the route handler next to `get()`. [CITED: vercel.com/docs/vercel-blob/private-storage]

2. **Versions drifted since STACK.md.** `next-auth@beta` is now `5.0.0-beta.31` (STACK.md pinned `.29`); Prisma `latest` is now `7.8.0` (STACK.md's lock on Prisma **6** stands — `prisma@prev` = `6.19.2`/`6.19.3` is still installable and correct here, do NOT take `@latest`). `bcryptjs@3.0.3`, `sharp@0.34.5`, `@auth/prisma-adapter@2.11.2` confirmed current. `zod@latest` is now **4.x** — pin `zod@^3.25` per STACK.md to avoid the v4 break, OR adopt v4 deliberately (note below). [VERIFIED: npm registry]

**Primary recommendation:** Build in the architecture's order — **Prisma foundation + seed → Auth + RBAC + middleware → security hardening (rotate key, private Blob, lock upload route, webhook secret) → shadcn/Tailwind v4 init + Phase 1 surfaces.** Pin Prisma 6 and `next-auth@5.0.0-beta.31` exactly. Use the split `auth.config.ts` (edge-safe) + `auth.ts` (Node, with bcrypt+Prisma) pattern so middleware runs on the edge without dragging Prisma/bcrypt into it.

---

<user_constraints>
## User Constraints

No `*-CONTEXT.md` exists for Phase 1 (STATE.md `stopped_at: Phase 1 UI-SPEC approved`; no discuss-phase run). Constraints below are the **locked stack/architecture decisions** from `.planning/research/STACK.md`, `.planning/PROJECT.md` Key Decisions, and the approved `01-UI-SPEC.md`. The planner MUST honor these as if they were CONTEXT.md decisions.

### Locked Decisions (from STACK.md "What NOT to Use" + PROJECT.md)
- **Auth:** Auth.js v5 (`next-auth@beta`), Credentials provider, `session.strategy = "jwt"`, JWT in HTTP-only cookie. NOT NextAuth v4. NOT Clerk. NOT Lucia/hand-rolled JWT.
- **ORM:** Prisma **6** (`6.19.x`) + `@prisma/client@6` (same version). NOT Prisma 7 (driver-adapter migration tax). NOT `prisma db push` in production — use `migrate dev` / `migrate deploy`.
- **DB:** Railway Postgres 16. Pooled `DATABASE_URL` (`connection_limit=1`) + `DIRECT_URL` for migrations. NOT the direct (5432) URL from serverless runtime.
- **Password hashing:** `bcryptjs` (pure JS). NOT native `bcrypt` / native `argon2` (node-gyp flaky on Vercel).
- **Secrets:** No secrets committed; rotate the previously-exposed `RUNPOD_API_KEY` **first**, before feature work. Also rotate `BLOB_READ_WRITE_TOKEN`.
- **Blob:** Keep Vercel Blob for binaries only; new writes private; structured state goes to Postgres, NOT Blob JSON.
- **UI:** shadcn/ui (style `new-york`, base color `neutral`, CSS variables) + Tailwind v4 + Geist fonts; teal accent, NOT purple. Seed the exact token CSS variables and the 16-component set from `01-UI-SPEC.md`.

### Claude's Discretion
- Whether to use `@auth/prisma-adapter` for user storage vs. a plain Prisma `User` table read directly in `authorize()` (both valid; adapter is heavier for Credentials-only — see Open Questions Q1).
- `zod@^3.25` (STACK.md lock) vs. deliberate `zod@4` adoption (see Open Questions Q2).
- Exact split-config file naming (`auth.config.ts` + `auth.ts`) — recommended pattern below.
- Whether `@t3-oss/env-nextjs` typed-env is added now (recommended) or deferred.

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- DATA-05 history migration from public Blob job-state → **Phase 8** (but the schema must not preclude it — see Runtime State Inventory).
- SEC-05 (remove hardcoded `ring99` URL + local fallback recipe path) → **Phase 8**.
- DATA-04 (Admin **edit** of domain settings) → **Phase 2** (Phase 1 only **seeds** + read-only/Admin view per UI-SPEC; the settings *edit* acceptance is DATA-04/Phase 2). Phase 1 ships the seed + the Admin settings surface scaffold.
- Batch/orchestration/gallery/compositing → Phases 3–6.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | Rotate exposed RunPod key; all secrets only in env | "Secret Rotation & Env Hardening" section; `.env`/`.env.local` audit (keys present, gitignored but `RUNPOD_API_KEY` leaked per CONCERNS) |
| SEC-02 | Private Blob assets, served via gated access (NOT public URLs) | "Private Vercel Blob" — **corrected model**: private store + `get(pathname,{access:'private'})` proxy route, not signed URLs |
| SEC-03 | Every route denies access by default to unauthenticated requests | "Deny-by-default middleware" pattern + `auth.config.ts` matcher; allowlist `/login`, `/api/auth/*`, webhook |
| SEC-04 | Webhook (RunPod status) authenticates via shared secret | "Webhook shared-secret" pattern (timing-safe compare); allowlisted in middleware, verified in handler |
| AUTH-01 | Credentials login, JWT in HTTP-only cookie, persists across refresh | Auth.js v5 Credentials + `strategy:"jwt"` (cookie is the persistence) |
| AUTH-02 | Logout from any page | `signOut()` from Auth.js; user-menu wired per UI-SPEC |
| AUTH-03 | Admin/Operator roles enforced server-side | `role` in JWT via `jwt`/`session` callbacks + `requireRole()` helper |
| AUTH-04 | Admin CRUD users + assign roles | Prisma `User` CRUD behind `requireRole("Admin")`; `/admin/users` surface (UI-SPEC §3) |
| AUTH-05 | Operators blocked from Admin actions server-side | `requireRole("Admin")` on every admin route + server action; UI hiding is not the boundary |
| DATA-01 | Postgres+Prisma persistence (User/Role + core schema) | "Prisma schema" section — full sketch from ARCHITECTURE.md, User/Role required, rest stubbed |
| DATA-02 | Prisma pooled connection safe for Vercel serverless | "Serverless pooling topology" — singleton + pooled URL + `connection_limit=1` + `directUrl` |
| DATA-03 | Seed domain settings (4 views, 3 metals, 4 groups, quality presets, 1920×1920) | "Seed script" section — exact values from PROJECT.md/Flask app |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Credentials login / session issue | Frontend Server (route handler, Node runtime) | — | `authorize()` needs bcrypt + Prisma → Node runtime, not edge |
| Route deny-by-default gate | Frontend Server (middleware, edge runtime) | API/Backend (`requireRole` in handler) | Middleware does cheap session presence/role check on edge; authoritative role checks repeated in handler |
| Role enforcement (Admin vs Operator) | API/Backend (`requireRole()` in each route/action) | Frontend (hide ADMIN nav) | Server-side is the boundary (AUTH-05); UI hiding is convenience only |
| User CRUD + role assignment | API/Backend + Database | — | Prisma writes gated by `requireRole("Admin")` |
| Password hashing | API/Backend (Node runtime) | — | `bcryptjs` runs in Node route handler, never edge/middleware |
| Relational persistence | Database (Postgres/Prisma) | — | System of record; binaries stay in Blob |
| Domain seed (views/metals/groups/quality) | Database (seed script) | — | One-shot `prisma/seed.ts`, run via `prisma db seed` |
| Secret storage / rotation | CDN/Platform (Vercel env) + local `.env.local` | — | No secrets in tree; rotation is a RunPod/Vercel dashboard action + code redeploy |
| Private asset delivery | API/Backend (auth-gated proxy route streaming `get()`) | Database (URL/pathname refs) | Vercel warns NOT to gate blobs via middleware — verify in handler next to `get()` |
| Webhook authentication | API/Backend (handler verifies shared secret) | Frontend Server (middleware allowlists the path) | Machine-to-machine; not a user session |
| Design tokens / component layer | Browser/Client (CSS vars + shadcn components) | Frontend Server (font loading via `next/font`) | Token CSS variables + Tailwind v4; Geist via `next/font` |

---

## Standard Stack

### Core (the Phase-1 additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next-auth` | `5.0.0-beta.31` (pin exact) | Auth + session, App Router native | Single `auth()` for server components/route handlers/middleware; `strategy:"jwt"` = encrypted JWT in HTTP-only cookie (the convention). [VERIFIED: npm registry] [CITED: authjs.dev] |
| `prisma` (dev) + `@prisma/client` | `6.19.2` (use `@prev`, NOT `@latest`) | Schema, migrations, type-safe queries | Workspace convention; v6 works on Railway TCP Postgres with zero driver-adapter wiring. `@latest` is now **7.8.0** — do NOT use. [VERIFIED: npm registry] |
| `bcryptjs` | `^3.0.3` | Password hashing for Credentials | Pure JS, no node-gyp; safe on Vercel. [VERIFIED: npm registry] |
| `@vercel/blob` | upgrade `^1.0.2` → `^2.4.0` | Private store + auth-gated delivery | Private storage (`access:'private'`, proxy via `get()`) requires **≥ 2.3**. Current `2.4.0`. Upgrade is required for SEC-02. [VERIFIED: npm registry] [CITED: vercel.com/docs/vercel-blob/private-storage] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@auth/prisma-adapter` | `^2.11.2` | Persist Auth.js users in Postgres | Optional for Credentials-only (see Open Q1). If used, keep `strategy:"jwt"`. [VERIFIED: npm registry] |
| `zod` | `^3.25.0` (lock) OR `^4.4.3` (deliberate) | Validate login/user-create payloads + env | STACK.md locks v3.25; `@latest` is v4.4.3 with breaking API changes. Pick one explicitly (Open Q2). [VERIFIED: npm registry] |
| `@t3-oss/env-nextjs` | `^0.13.11` | Typed/validated env, fail-fast on missing secret | Directly serves SEC-01 "secrets only in env" + UI-SPEC's "config misconfigured" error copy. [VERIFIED: npm registry] |
| `tailwindcss` | `^4.x` (v4) | Styling layer for shadcn | UI-SPEC mandates Tailwind v4 + CSS-variable tokens. [CITED: ui.shadcn.com] |
| `geist` | latest | Geist Sans/Mono via `next/font` | UI-SPEC typography. [CITED: 01-UI-SPEC.md] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `bcryptjs` | `@node-rs/argon2@2.0.2` | Stronger KDF, but native binary — STACK.md rejects for Vercel build flakiness. Stay on bcryptjs. |
| Plain Prisma `User` in `authorize()` | `@auth/prisma-adapter` | Adapter adds Account/Session/VerificationToken tables you don't need for Credentials-only + JWT sessions. Plain table is leaner (Open Q1). |
| Private Blob proxy route | "signed URLs" (as SEC-02 wording implies) | Signed time-limited URLs are NOT how current Vercel private Blob works; the proxy/`get()` pattern is the supported model. Do not plan for a signed-URL API that doesn't exist. |

**Installation:**
```bash
# Pin exact auth beta; pin Prisma 6 (NOT @latest=7); upgrade blob to v2
npm install next-auth@5.0.0-beta.31 @prisma/client@6.19.2 bcryptjs@^3.0.3 @vercel/blob@^2.4.0
npm install zod@^3.25.0 @t3-oss/env-nextjs@^0.13.11
npm install -D prisma@6.19.2 @types/bcryptjs

# UI layer
npm install geist
npx prisma init --datasource-provider postgresql
npx auth secret            # writes AUTH_SECRET to .env.local
npx shadcn@latest init     # style new-york, base neutral, CSS vars yes, RSC yes
```

**Version verification (run 2026-06-05, live npm):**
| Package | `@latest` | What to install | Note |
|---------|-----------|-----------------|------|
| `next-auth` | 4.24.14 | `@5.0.0-beta.31` (beta tag) | v5 is under `@beta`; `@latest` is the old v4 — do NOT take `@latest` |
| `prisma` / `@prisma/client` | 7.8.0 | `@6.19.2` (`@prev` tag = 6.19.2/6.19.3) | Lock to 6; 7 needs driver adapters |
| `bcryptjs` | 3.0.3 | `^3.0.3` | OK |
| `sharp` | 0.34.5 | (Phase 6, not Phase 1) | Matches STACK.md |
| `zod` | 4.4.3 | `^3.25.0` (or deliberate 4) | `@latest` jumped to v4 — see Open Q2 |
| `@vercel/blob` | 2.4.0 | `^2.4.0` (current repo: `^1.0.2`) | Upgrade required for private storage |
| `@auth/prisma-adapter` | 2.11.2 | `^2.11.2` | Optional |
| `@t3-oss/env-nextjs` | 0.13.11 | `^0.13.11` | OK |

## Package Legitimacy Audit

slopcheck not installable in this session (no network pip). All packages below are nonetheless well-known, high-trust, official-scope or de-facto-standard libraries verified directly against the **correct** registry (npm) and against official documentation (authjs.dev, prisma.io, vercel.com, ui.shadcn.com) — not discovered via WebSearch. Per protocol, absent slopcheck they are tagged conservatively, but every one has years of history and millions of weekly downloads.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `next-auth` | npm | 6+ yrs | millions/wk | github.com/nextauthjs/next-auth | unavailable | Approved (official Auth.js) |
| `@auth/prisma-adapter` | npm | 2+ yrs | high | github.com/nextauthjs/next-auth | unavailable | Approved (official `@auth` scope) |
| `prisma` / `@prisma/client` | npm | 6+ yrs | millions/wk | github.com/prisma/prisma | unavailable | Approved (official Prisma) |
| `bcryptjs` | npm | 10+ yrs | millions/wk | github.com/dcodeIO/bcrypt.js | unavailable | Approved |
| `@vercel/blob` | npm | 2+ yrs | high | github.com/vercel/storage | unavailable | Approved (official Vercel) |
| `zod` | npm | 5+ yrs | millions/wk | github.com/colinhacks/zod | unavailable | Approved |
| `@t3-oss/env-nextjs` | npm | 2+ yrs | high | github.com/t3-oss/t3-env | unavailable | Approved |
| `geist` | npm | 2+ yrs | high | github.com/vercel/geist-font | unavailable | Approved (official Vercel) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

*slopcheck was unavailable at research time. Per protocol this would normally tag packages `[ASSUMED]`; however every package here is an official-scope or de-facto-standard library cross-checked against official docs, so the planner may proceed without a per-install human-verify checkpoint. **One genuine watch-item:** `next-auth@beta` is a pre-release — pin the exact version `5.0.0-beta.31` and do not float `@beta`, since betas can break across patch numbers.*

---

## Architecture Patterns

### System Architecture Diagram (Phase-1 slice)

```
Browser
  │  POST /login (email,password)
  ▼
[middleware.ts  — edge, auth.config.ts]
  │  session cookie present?  ──no──►  redirect /login?from=…   (SEC-03 deny-by-default)
  │  yes → role known from JWT
  ▼
[app/api/auth/[...nextauth]/route.ts]  (Node runtime)
  │  authorize(): prisma.user.findUnique → bcrypt.compare
  │  jwt callback: token.role = user.role
  │  session callback: session.user.role = token.role
  ▼
  Set-Cookie: <encrypted JWT, HttpOnly, Secure, SameSite=Lax>   (AUTH-01 persistence)
  ▼
Authenticated request to any /api/* mutation
  │
  ▼
[route handler]  requireRole("Admin"|"Operator")   ← authoritative server-side gate (AUTH-03/05)
  │
  ├──► Prisma (Railway Postgres, pooled, singleton)   ← system of record (DATA-01/02)
  │       User Role | Metal StoneType CameraView QualityPreset ObjectGroup (seeded DATA-03)
  │
  └──► Private Vercel Blob   (binaries only; delivered via authed proxy:
          GET /api/file?pathname=… → requireSession → get(pathname,{access:'private'}) → stream)  (SEC-02)

Machine-to-machine:
RunPod ──POST──► /api/webhooks/runpod   (allowlisted in middleware; handler verifies shared secret)  (SEC-04)
```

### Recommended Project Structure (additions only — extend, don't restructure)

```
prisma/
├── schema.prisma            ★ datasource (url=DATABASE_URL, directUrl=DIRECT_URL) + models
├── migrations/              ★ from `prisma migrate dev`
└── seed.ts                  ★ DATA-03 domain seed + first Admin user
lib/
├── auth/
│   ├── auth.config.ts       ★ edge-safe config (providers list shape, callbacks for authorized/jwt/session, pages) — NO Prisma/bcrypt import
│   ├── auth.ts              ★ Node: NextAuth(authConfig) + Credentials.authorize (Prisma + bcryptjs); exports auth, signIn, signOut, handlers
│   └── rbac.ts              ★ requireSession(), requireRole(role)
├── db/
│   └── prisma.ts            ★ PrismaClient globalThis singleton
├── env.ts                   ★ @t3-oss/env-nextjs typed env (fail-fast)
└── (existing) runpod.ts, jobs.ts, enterprise-recipes.ts, types.ts
middleware.ts                ★ ROOT (not app/) — exports auth from auth.config; matcher deny-by-default
app/
├── api/auth/[...nextauth]/route.ts   ★ export { GET, POST } from lib/auth/auth handlers
├── api/file/route.ts                 ★ authed private-blob proxy (SEC-02)
├── api/webhooks/runpod/route.ts      ★ shared-secret verified (SEC-04) — scaffold; full use Phase 4
├── api/admin/users/route.ts          ★ Admin user CRUD (AUTH-04)
├── (auth)/login/page.tsx             ★ login surface (UI-SPEC §2)
├── admin/users/page.tsx              ★ user management (UI-SPEC §3)
├── admin/settings/page.tsx           ★ domain settings view (UI-SPEC §4; edit = DATA-04/Phase 2)
├── layout.tsx                        (existing — wrap with app shell + theme + Geist fonts)
├── globals.css                       ★ NEW — token CSS variables (:root light, .dark) per UI-SPEC
└── components/ + lib/utils.ts        ★ shadcn output (button input label table badge dialog card
                                         dropdown-menu sonner form select switch skeleton avatar tooltip separator)
components.json                       ★ shadcn config (new-york / neutral / cssVars)
```

> Note: existing global styles live in `app/styles.css` (imported by `app/layout.tsx`). shadcn init expects `app/globals.css`; the planner must reconcile — either point `components.json` `tailwind.css` at the existing file or migrate `styles.css` content into `globals.css`. Do NOT leave two competing global stylesheets.

### Pattern 1: Split edge-safe `auth.config.ts` + Node `auth.ts` (the critical one)

**What:** Auth.js v5 middleware runs on the **edge runtime**, which cannot run Prisma's engine or `bcryptjs`. The supported pattern splits config: `auth.config.ts` holds only edge-safe pieces (the `authorized` callback for the middleware gate, `jwt`/`session` callbacks, `pages`), and `auth.ts` imports it, adds the `Credentials` provider whose `authorize()` uses Prisma + bcrypt, and exports `auth`/`handlers`/`signIn`/`signOut`. `middleware.ts` imports only `auth.config.ts`.
**When to use:** Always, when you (a) use Credentials with a DB lookup and (b) gate routes in middleware — exactly this phase.
**Example:**
```typescript
// lib/auth/auth.config.ts  — edge-safe, NO prisma/bcrypt
import type { NextAuthConfig } from "next-auth";
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [], // real provider added in auth.ts (Node)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic = nextUrl.pathname.startsWith("/login");
      if (isPublic) return true;
      return isLoggedIn; // deny-by-default for everything else (SEC-03)
    },
    jwt({ token, user }) { if (user) token.role = (user as any).role; return token; },
    session({ session, token }) { if (token.role) (session.user as any).role = token.role; return session; },
  },
} satisfies NextAuthConfig;

// lib/auth/auth.ts  — Node runtime
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { authConfig } from "./auth.config";
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Credentials({
    credentials: { email: {}, password: {} },
    authorize: async (c) => {
      const user = await prisma.user.findUnique({ where: { email: String(c.email) } });
      if (!user || user.disabled) return null;
      const ok = await bcrypt.compare(String(c.password), user.passwordHash);
      return ok ? { id: user.id, email: user.email, role: user.role } : null;
    },
  })],
});
// middleware.ts (root):  import NextAuth from "next-auth"; import { authConfig } from "@/lib/auth/auth.config";
//   export const { auth: middleware } = NextAuth(authConfig);
//   export const config = { matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|api/webhooks/runpod).*)"] };
```
[CITED: authjs.dev/getting-started/installation; authjs.dev/getting-started/authentication/credentials] [ASSUMED: exact split-config file shape — Auth.js v5 beta API; verify `authorized` callback signature against installed `5.0.0-beta.31` types]

### Pattern 2: `requireRole()` server-side gate (the RBAC boundary, AUTH-03/05)

**What:** A single helper used by every mutating route handler and server action. Middleware is a coarse first gate; `requireRole` is the authoritative check (Vercel + Auth.js both warn middleware alone is insufficient).
**Example:**
```typescript
// lib/auth/rbac.ts
import { auth } from "./auth";
export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Response("Unauthorized", { status: 401 });
  return session;
}
export async function requireRole(role: "Admin" | "Operator") {
  const session = await requireSession();
  const r = (session.user as any).role as "Admin" | "Operator";
  if (role === "Admin" && r !== "Admin") throw new Response("Forbidden", { status: 403 });
  return session;
}
```
Every admin route (`/api/admin/users`, settings mutations) calls `await requireRole("Admin")` as its first line. Verification: an Operator session hitting an admin route gets **403** (not just a hidden nav item).

### Pattern 3: Prisma serverless singleton + pooled topology (DATA-02)

**What:** One `PrismaClient` on `globalThis`; app traffic uses the **pooled** `DATABASE_URL` with `connection_limit=1`; migrations use `DIRECT_URL`.
**Example:**
```typescript
// lib/db/prisma.ts
import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
```
```prisma
// schema.prisma datasource
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled: ...?pgbouncer=true&connection_limit=1
  directUrl = env("DIRECT_URL")     // direct: migrations only
}
```
[CITED: prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections]

### Pattern 4: Private Blob delivery via authed proxy (SEC-02 — corrected)

**What:** Create a **private** Blob store. Write with `put(pathname, data, { access: 'private' })`. Serve through an auth-gated route that calls `get(pathname, { access: 'private' })` and streams `result.stream`. **No signed URLs.** Verify auth in the handler next to `get()` — Vercel explicitly warns against gating private blobs via middleware (a middleware bug could expose cached content).
**Example:**
```typescript
// app/api/file/route.ts  (Node runtime)
import { NextResponse, type NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { requireSession } from "@/lib/auth/rbac";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  await requireSession();                          // auth right next to get()
  const pathname = req.nextUrl.searchParams.get("pathname");
  if (!pathname) return NextResponse.json({ error: "Missing pathname" }, { status: 400 });
  const result = await get(pathname, { access: "private" });
  if (result?.statusCode !== 200) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(result.stream, {
    headers: { "Content-Type": result.blob.contentType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-cache" },
  });
}
```
[CITED: vercel.com/docs/vercel-blob/private-storage — requires `@vercel/blob` ≥ 2.3]

### Pattern 5: Webhook shared-secret auth (SEC-04)

**What:** The RunPod webhook must be reachable unauthenticated by a session (machine-to-machine), so it is **allowlisted in middleware** and verified inside the handler by a shared secret compared in constant time.
**Example:**
```typescript
// app/api/webhooks/runpod/route.ts  (Phase-1 scaffold; full use Phase 4)
import { timingSafeEqual } from "node:crypto";
export const runtime = "nodejs";
function ok(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret") ?? "";
  if (!process.env.RUNPOD_WEBHOOK_SECRET || !ok(secret, process.env.RUNPOD_WEBHOOK_SECRET))
    return new Response("Unauthorized", { status: 401 });
  // (Phase 4 reconcile logic)
  return Response.json({ ok: true });
}
```
The secret is passed on submit as a header/query param when calling RunPod `/run` with the `webhook` field (Phase 4 wires submission; Phase 1 establishes the secret env var + verification skeleton so the auth gap never exists).

### Anti-Patterns to Avoid
- **Importing Prisma/bcrypt into `middleware.ts`** → edge-runtime crash. Use the split config.
- **Gating private blobs in middleware only** → Vercel-documented exposure risk; verify in the handler.
- **Inline `if (role==='admin')` per route** → RBAC gaps; use `requireRole()` everywhere (PITFALLS #6).
- **Direct (5432) Postgres URL from the Vercel runtime** → pool exhaustion (PITFALLS #2).
- **`prisma db push` to prod / `prisma migrate` against the pooled txn-mode URL** → drift / prepared-statement break.
- **Leaving the Blob upload route's `onBeforeGenerateToken` without a caller check** → the existing route (`app/api/blob/upload/route.ts`) issues upload tokens to anyone (PITFALLS #6/7). Add `await requireSession()` before returning the token.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session/JWT cookie + CSRF + rotation | Custom JWT-in-cookie | Auth.js v5 `strategy:"jwt"` | Re-implements CSRF, encryption, callbacks; Lucia is now archived |
| Password hashing | Custom crypto / sha256 | `bcryptjs.hash`/`.compare` | Salting, work-factor, timing handled |
| Env validation | Manual `if(!process.env.X)` scattered | `@t3-oss/env-nextjs` + zod | Fail-fast at build; one schema; serves SEC-01 |
| Private asset access control | Custom signed-URL scheme over public Blob | Vercel private Blob + `get()` proxy | Vercel's signed-URL model for private blobs doesn't exist; build the proxy, not a token scheme |
| Connection pooling | Custom pool manager | Pooled URL + singleton + `connection_limit=1` | Prisma+pooler is the supported serverless path |
| Constant-time secret compare | `===` on secrets | `crypto.timingSafeEqual` | Avoids timing side-channel on webhook secret |

**Key insight:** Every "foundation" concern here (auth, hashing, env, private delivery, pooling) has a single blessed solution in this stack. Custom solutions in Phase 1 become security liabilities the rest of the app inherits.

---

## Runtime State Inventory

This is a foundation/hardening phase that touches secrets and introduces a new datastore; the inventory matters.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing job-state JSON lives in **public** Vercel Blob under `app-state/render-jobs/<uuid>.json` (per INTEGRATIONS.md). Phase 1 does NOT migrate it (DATA-05 = Phase 8) but its schema must not preclude later backfill — keep `Job.runpodJobId` + a stable app `id` + a `JobStatus` enum so the Phase-8 importer can upsert by id and normalize legacy mixed-case statuses. | Schema-design constraint only this phase; data migration deferred to Phase 8. |
| Live service config | **RunPod endpoint** (`ubntulu9k28suy` per CLAUDE.md; `RUNPOD_ENDPOINT_ID` in env) authenticates with `RUNPOD_API_KEY`. Rotating the key is a **RunPod dashboard action** (revoke old, create new) — not a code change. The new key must be set in Vercel env + local `.env.local`; no code edit needed (`lib/runpod.ts` reads `process.env.RUNPOD_API_KEY`). | Rotate in RunPod dashboard → update Vercel env + `.env.local`. |
| OS-registered state | None — Vercel/RunPod are managed; no Task Scheduler/cron/systemd registrations carry secrets locally. (Verified: no local scheduler in repo; CI is GitHub Actions using `GITHUB_TOKEN`.) | None. |
| Secrets/env vars | `.env` and `.env.local` (both gitignored, confirmed not tracked — `git ls-files` shows only `.env.example`) currently hold **live** `RUNPOD_API_KEY` + `BLOB_READ_WRITE_TOKEN` (+ `VERCEL_OIDC_TOKEN`, `BLOB_ACCESS`). `RUNPOD_API_KEY` was exposed in chat (per CONCERNS) → rotate. `BLOB_READ_WRITE_TOKEN` also rotate (CONCERNS). New env vars to add: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `RUNPOD_WEBHOOK_SECRET` (and existing `RUNPOD_ENDPOINT_ID`). `BLOB_STORE_ID` appears when a private store is connected on Vercel. | Rotate exposed keys; add new vars to Vercel + `.env.local`; never commit. Worker container also reads `BLOB_READ_WRITE_TOKEN` → update there too after rotation. |
| Build artifacts | `.next/` present (gitignored). Upgrading `@vercel/blob` 1.x→2.x and adding Prisma require a clean `npm install` + `prisma generate` (add `"postinstall":"prisma generate"`). No stale egg-info/compiled binaries. | Add postinstall + build-step `prisma migrate deploy`; rebuild. |

**Worker-side note:** the RunPod worker (`workers/runpod-blender/handler.py`) uploads outputs with `BLOB_ACCESS` env defaulting to `"public"`. For SEC-02, **new** worker output writes should become private. Phase 1 establishes the private store + the proxy delivery route; flipping the worker's `BLOB_ACCESS`/SDK call to private is a coordinated change — note it so the planner sequences it (the worker is a separate deploy via GHCR/RunPod; a Phase-1 task can set `BLOB_ACCESS=private` in the RunPod container env once the private store exists, but the gallery/delivery consumers that read those blobs land in later phases). Decide policy for already-public legacy blobs (re-upload private vs. accept burned) — flagged in STATE.md, resolve in Phase 1 or 8.

---

## Common Pitfalls

### Pitfall 1: Prisma/bcrypt in edge middleware
**What goes wrong:** `middleware.ts` importing `auth.ts` (which imports Prisma+bcrypt) fails to build / crashes on the edge runtime.
**Why:** Next.js middleware runs on edge; Prisma's engine and bcryptjs aren't edge-compatible.
**Avoid:** Split-config pattern (Pattern 1) — middleware imports only `auth.config.ts`.
**Warning signs:** Build errors about `node:`/binary modules in middleware; "Edge runtime does not support" messages.

### Pitfall 2: Prisma pool exhaustion on Vercel (PITFALLS #2)
**What goes wrong:** `P2024: Timed out fetching a connection` / Postgres `too many connections` under modest concurrency.
**Avoid:** singleton + pooled `DATABASE_URL` (`connection_limit=1`) + `directUrl` for migrations.
**Warning signs:** intermittent 500s on DB routes that vanish on retry; connection count climbs with tab count.

### Pitfall 3: Taking `@latest` for Prisma or next-auth
**What goes wrong:** `npm i prisma` pulls **7.8.0** (needs driver adapters → breaks the locked zero-adapter setup); `npm i next-auth` pulls **v4** (`@latest` = 4.24.14, wrong App-Router model).
**Avoid:** pin `prisma@6.19.2` / `@prisma/client@6.19.2`; install `next-auth@5.0.0-beta.31` explicitly.

### Pitfall 4: Open Blob upload route survives the auth rollout (PITFALLS #6/7)
**What goes wrong:** `app/api/blob/upload/route.ts` issues client-upload tokens with no caller check; auth on other routes doesn't cover it.
**Avoid:** add `await requireSession()` in `onBeforeGenerateToken`; tighten `allowedContentTypes` to model/image types actually needed.

### Pitfall 5: Private Blob planned as "signed URLs"
**What goes wrong:** Plan assumes a `getSignedUrl()`-style API and a gallery that embeds long-lived URLs; that API doesn't exist for private blobs.
**Avoid:** plan the auth-gated proxy route (Pattern 4); gallery (later phase) fetches via `/api/file?pathname=…`.

### Pitfall 6: Migrations run against the pooled URL
**What goes wrong:** `prisma migrate` over a transaction-mode pooled connection breaks on prepared statements.
**Avoid:** `directUrl = env("DIRECT_URL")`; run `migrate dev`/`migrate deploy` against the direct URL.

### Pitfall 7: Two competing global stylesheets
**What goes wrong:** shadcn init writes `app/globals.css` while the app already imports `app/styles.css` → token vars don't apply / duplicate base layers.
**Avoid:** reconcile to one file; point `components.json`→`tailwind.css` at the canonical file and import it once in `layout.tsx`.

---

## Code Examples

### Seed script for DATA-03 (exact domain values)
```typescript
// prisma/seed.ts  — run: npx prisma db seed  (configure package.json "prisma":{"seed":"tsx prisma/seed.ts"})
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

const cameraViews = [
  { key: "view1", label: "View 1", azimuth: 30,  elevation: 25, focalMm: 187.5, fStop: 2.8 },
  { key: "view2", label: "View 2", azimuth: 180, elevation: 15, focalMm: 187.5, fStop: 2.8 },
  { key: "view3", label: "View 3", azimuth: -30, elevation: 10, focalMm: 50.0,  fStop: 2.8 },
  { key: "view4", label: "View 4", azimuth: 0,   elevation: 75, focalMm: 187.5, fStop: 2.8 },
];
const metals = [
  { key: "white",  label: "White Gold / Platinum" },
  { key: "yellow", label: "18K Yellow Gold" },
  { key: "red",    label: "Rose Gold" },
];
const objectGroups = ["alloycolour", "diamond", "stone2", "stone3"].map((k, i) => ({ key: k, label: k, sortOrder: i }));
const qualityPresets = [
  { key: "preview", label: "Preview", samples: 64,  width: 1920, height: 1920 },
  { key: "medium",  label: "Medium",  samples: 256, width: 1920, height: 1920 },
  { key: "high",    label: "High",    samples: 512, width: 1920, height: 1920 },
  { key: "ultra",   label: "Ultra",   samples: 2048, width: 1920, height: 1920 }, // PROJECT.md: ultra 2048–4096; pick 2048 default, Admin-editable
];

async function main() {
  for (const v of cameraViews)    await prisma.cameraView.upsert({ where: { key: v.key }, update: v, create: v });
  for (const m of metals)         await prisma.metal.upsert({ where: { key: m.key }, update: m, create: m });
  for (const g of objectGroups)   await prisma.objectGroup.upsert({ where: { key: g.key }, update: g, create: g });
  for (const q of qualityPresets) await prisma.qualityPreset.upsert({ where: { key: q.key }, update: q, create: q });
  // first Admin (env-driven, never hardcode a password)
  const email = process.env.SEED_ADMIN_EMAIL, pw = process.env.SEED_ADMIN_PASSWORD;
  if (email && pw) await prisma.user.upsert({
    where: { email }, update: {},
    create: { email, passwordHash: await bcrypt.hash(pw, 12), role: "Admin" },
  });
}
main().finally(() => prisma.$disconnect());
```
[CITED: PROJECT.md lines 60–63 for exact az/el/focal/fstop/samples]

### Minimal Prisma schema (User/Role required + core domain stubbed — DATA-01)
```prisma
enum Role { Admin Operator }
enum JobStatus { queued submitted in_queue in_progress completed failed cancelled } // PITFALLS #3: define enum up front for Phase-8 backfill

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(Operator)
  disabled     Boolean  @default(false)
  createdAt    DateTime @default(now())
}
// Admin-editable domain tables (NOT enums — PROJECT.md requires editability)
model CameraView   { id String @id @default(cuid()) key String @unique label String azimuth Float elevation Float focalMm Float fStop Float }
model Metal        { id String @id @default(cuid()) key String @unique label String hex String? }
model StoneType    { id String @id @default(cuid()) key String @unique label String preset Json? }
model ObjectGroup  { id String @id @default(cuid()) key String @unique label String sortOrder Int @default(0) }
model QualityPreset{ id String @id @default(cuid()) key String @unique label String samples Int width Int @default(1920) height Int @default(1920) }
// Core relational stubs (full use later phases; create now so the model is stable — DATA-01)
model Project { id String @id @default(cuid()) name String createdAt DateTime @default(now()) products Product[] }
model Product {
  id String @id @default(cuid()) projectId String? name String
  modelUrl String? modelFormat String? inspectionUrl String? status String @default("draft")
  createdAt DateTime @default(now())
  assignments ObjectGroupAssignment[] batches Batch[]
}
model ObjectGroupAssignment { id String @id @default(cuid()) productId String group String objectTokens String[] }
model Batch {
  id String @id @default(cuid()) productId String createdById String?
  status String @default("draft") matrix Json? jobCount Int @default(0) createdAt DateTime @default(now())
  jobs Job[]
}
model Job {
  id String @id @default(cuid()) batchId String status JobStatus @default(queued)
  runpodJobId String? recipe Json? combo Json? attempt Int @default(0) error String?
  outputPrefix String? submittedAt DateTime? finishedAt DateTime?
  layers Layer[]
  @@index([batchId, status])   // PITFALLS scaling note
}
model Layer { id String @id @default(cuid()) jobId String pass String format String url String metadataUrl String? isFlattened Boolean @default(false) }
```
[CITED: .planning/research/ARCHITECTURE.md data-model sketch]

### Build/scripts wiring (package.json)
```jsonc
{
  "scripts": {
    "build": "prisma generate && prisma migrate deploy && next build",
    "postinstall": "prisma generate"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```
[CITED: STACK.md installation guidance]

---

## State of the Art

| Old Approach (STACK.md / training) | Current (verified 2026-06-05) | When Changed | Impact |
|------------------------------------|-------------------------------|--------------|--------|
| `next-auth@5.0.0-beta.29` | `5.0.0-beta.31` | since STACK.md | pin `.31` |
| Prisma 6 is `@latest` | Prisma 7.8.0 is `@latest`; 6.19.2 = `@prev` | Prisma 7 GA'd | must pin `@6.19.2`, never bare `@latest` |
| Vercel Blob "signed/time-limited URLs" for private assets | Private **store** + `get(pathname,{access:'private'})` **proxy**; no signed URL | `@vercel/blob` ≥ 2.3 (private storage) | rewrite SEC-02 plan around proxy route; upgrade blob 1.x→2.x |
| `zod@^3.25` | `zod@4.4.3` is `@latest` | zod 4 released | keep v3.25 lock or adopt v4 deliberately |
| `middleware.ts` for auth gate | still `middleware.ts` on **Next 15**; renamed `proxy.ts` only on **Next 16+** | Next 16 | this app is Next 15 → `middleware.ts` is correct |

**Deprecated/outdated:** NextAuth v4 (`@latest`), Lucia (archived/"learning resource"), Vercel Postgres direct product (now Neon via Marketplace), signed-URL mental model for private Blob.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact Auth.js v5 split-config callback signatures (`authorized`, `jwt`, `session`) match the code shown | Pattern 1 | LOW–MED: beta API; verify against installed `5.0.0-beta.31` `.d.ts`. Wrong shape = compile error caught immediately, not a silent fault. |
| A2 | `RUNPOD_API_KEY` was exposed and needs rotation | Runtime State Inventory / SEC-01 | LOW: stated in PROJECT.md CONCERNS; rotation is harmless even if over-cautious. |
| A3 | Railway is the chosen Postgres host | DB sections | LOW: STACK.md + CLAUDE.md convention; if Neon is chosen instead, add `@prisma/adapter-neon` (pooling pattern otherwise identical). |
| A4 | `ultra` quality = 2048 samples default | Seed | LOW: PROJECT.md says "ultra 2048–4096"; Admin-editable, so exact default is adjustable. Confirm with team. |
| A5 | Phase 1 ships settings **view** (seed + Admin surface) but settings **edit** is DATA-04/Phase 2 | User Constraints / surfaces | MED: traceability maps only DATA-01/02/03 to Phase 1; UI-SPEC §4 describes an edit surface. Planner should confirm scope split so Phase 1 doesn't silently absorb DATA-04. |
| A6 | First Admin user is created via env-driven seed (`SEED_ADMIN_EMAIL/PASSWORD`) | Seed | LOW: avoids hardcoded creds; alternative is a one-time CLI/admin-bootstrap route. |

**Per protocol:** because slopcheck was unavailable, treat the package set with the watch-item noted in the Audit (pin the `next-auth` beta exactly). No package was discovered via WebSearch; all came from official docs.

---

## Open Questions

1. **`@auth/prisma-adapter` or plain Prisma `User`?**
   - Known: Credentials + JWT sessions don't need adapter-managed Session/Account tables.
   - Unclear: whether later phases want OAuth/db-sessions.
   - Recommendation: **plain `User` table read in `authorize()`** for Phase 1 (leaner, fewer tables); add the adapter later only if an OAuth provider or DB sessions are introduced.

2. **`zod@3.25` (locked) vs `zod@4.4.3` (`@latest`)?**
   - Known: STACK.md locks v3.25; `@t3-oss/env-nextjs` supports both.
   - Recommendation: **stay on `zod@^3.25`** for Phase 1 to honor the lock and avoid v4 API churn mid-foundation; schedule a deliberate v4 upgrade as its own task.

3. **Legacy public-Blob assets: re-upload private or accept burned?** (flagged in STATE.md)
   - Recommendation: for Phase 1, set the policy = "new writes private; legacy public blobs accepted as burned, rotate paths"; full re-upload (if wanted) is a Phase-8 concern alongside DATA-05. Confirm with stakeholder.

4. **Does Phase 1's settings surface need editability?** (see A5)
   - Recommendation: Phase 1 = seed + read/Admin-gated view; DATA-04 edit = Phase 2, per traceability.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node/npm | all install/build | ✓ | npm lockfile present (`package-lock.json`) | — |
| Next.js 15 / React 19 | existing app | ✓ | `next ^15.1.4`, `react ^19` | — |
| `@vercel/blob` | SEC-02 private store | ✓ (installed `^1.0.2`) | upgrade to `^2.4.0` required | none — must upgrade for private storage |
| Railway Postgres 16 | DATA-01/02 | ✗ (not provisioned in repo; no `DATABASE_URL` yet) | — | provision Railway DB; or Neon via Marketplace (needs `@prisma/adapter-neon`) |
| Vercel project + env | SEC-01, DEPLOY | ✓ (`jewelry-render-studio`, project id in INTEGRATIONS.md) | — | — |
| RunPod dashboard access | SEC-01 key rotation | ✓ (endpoint `ubntulu9k28suy`) | — | — |
| `tsx` (seed runner) | seed script | ✗ | — | use `ts-node` or `prisma db seed` with compiled JS |

**Missing dependencies with no fallback:** Railway Postgres must be provisioned (blocks DATA-01/02 verification) — first plan task.
**Missing with fallback:** `tsx` → add as devDep, or run seed via `ts-node`/compiled.

---

## Validation Architecture

> `workflow.nyquist_validation` not set in config (no `.planning/config.json` validation key found) → treat as enabled; include this section.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **None detected** (codebase STACK.md: "No test framework detected"). Wave 0 must install one. |
| Recommended | **Vitest** (`vitest`) for unit/integration of `lib/auth/rbac.ts`, seed, schema invariants; **Playwright** optional for login E2E (heavier — manual checks acceptable for Phase 1). |
| Config file | none — create `vitest.config.ts` in Wave 0 |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| AUTH-01 | login sets HTTP-only JWT cookie; survives refresh | integration (route) / manual | `npx vitest run tests/auth.login.test.ts` | ❌ Wave 0 |
| AUTH-02 | logout clears session | integration / manual | `npx vitest run tests/auth.logout.test.ts` | ❌ Wave 0 |
| AUTH-03 | `role` present in session server-side | unit | `npx vitest run tests/auth.session-role.test.ts` | ❌ Wave 0 |
| AUTH-04 | Admin creates user + assigns role | integration | `npx vitest run tests/admin.users.test.ts` | ❌ Wave 0 |
| AUTH-05 | Operator → 403 on admin route (server-side) | integration | `npx vitest run tests/rbac.operator-forbidden.test.ts` | ❌ Wave 0 |
| SEC-03 | unauth request → redirect/401 (deny-by-default) | integration | `npx vitest run tests/middleware.deny.test.ts` | ❌ Wave 0 |
| SEC-02 | unauth GET of private blob proxy → 401/404; public URL not readable | integration + **manual incognito** | `npx vitest run tests/blob.private.test.ts` + incognito check | ❌ Wave 0 |
| SEC-04 | webhook without secret → 401; with secret → 200 | unit | `npx vitest run tests/webhook.secret.test.ts` | ❌ Wave 0 |
| SEC-01 | old RunPod key rejected by RunPod; no secret in tree | **manual** | `git grep -nE 'rpa_|sk_' -- ':!*.example'` (expect none) + RunPod call with old key fails | n/a (manual) |
| DATA-02 | no `P2024` / pool exhaustion under concurrency | integration (load) | `npx vitest run tests/prisma.pool.test.ts` (fire N concurrent queries) | ❌ Wave 0 |
| DATA-03 | seed produces exactly 4 views / 3 metals / 4 groups / 4 presets with correct values | unit (post-seed query) | `npx vitest run tests/seed.domain.test.ts` | ❌ Wave 0 |
| DATA-01 | User/Role + core tables migrate cleanly | smoke | `npx prisma migrate deploy && npx prisma validate` | n/a (CLI) |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test>` + `npx prisma validate` (if schema touched).
- **Per wave merge:** `npx vitest run` (full) + `npx prisma migrate deploy` against a scratch DB.
- **Phase gate:** full suite green + manual checklist (incognito blob 403, old RunPod key rejected, Operator 403) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Install + configure **Vitest** (`vitest.config.ts`) — no framework exists.
- [ ] `tests/helpers/db.ts` — test DB setup/teardown (scratch Postgres or transaction rollback).
- [ ] `tests/helpers/session.ts` — fabricate Admin/Operator sessions for RBAC tests.
- [ ] Add `tsx` (or `ts-node`) devDep for seed + seed test.
- [ ] Manual-check checklist file for SEC-01/SEC-02 (incognito + old-key-rejected) — these are genuinely manual.

---

## Security Domain

`security_enforcement` not explicitly `false` → included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | **yes** | Auth.js v5 Credentials; `bcryptjs` (work factor ≥12); no user enumeration in login error (UI-SPEC: "never reveal whether email vs password was wrong") |
| V3 Session Management | **yes** | Encrypted JWT in HTTP-only, Secure, SameSite cookie (Auth.js default); logout clears session (AUTH-02) |
| V4 Access Control | **yes** | Deny-by-default middleware (SEC-03) + authoritative `requireRole()` server-side (AUTH-03/05); UI hiding is not the boundary |
| V5 Input Validation | **yes** | `zod` on login + user-create payloads before Prisma |
| V6 Cryptography | **yes** | bcrypt (never hand-rolled); `crypto.timingSafeEqual` for webhook secret; `AUTH_SECRET` from `npx auth secret` |
| V7 Error/Logging | partial | UI-SPEC: never print secret env-var names to end users; log specifics server-side |
| V14 Config | **yes** | Secrets only in env (SEC-01); `@t3-oss/env-nextjs` fail-fast; `.env*` gitignored (verified) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Exposed RunPod key abused (GPU spend) | Spoofing/Elevation | Rotate first (SEC-01); set RunPod endpoint concurrency cap |
| Open Blob upload-token route | Tampering | `requireSession()` in `onBeforeGenerateToken`; restrict content types |
| Public Blob leaks recipes/outputs by URL | Info Disclosure | Private store + auth-gated `get()` proxy (SEC-02); verify auth next to `get()` |
| Spoofed RunPod webhook | Spoofing/Tampering | Shared-secret `timingSafeEqual` (SEC-04); allowlist path but verify in handler |
| RBAC bypass (Operator → admin) | Elevation | `requireRole("Admin")` on every admin route + server action (AUTH-05) |
| SQL injection | Tampering | Prisma parameterized queries (never raw string interpolation) |
| User enumeration via login error | Info Disclosure | Generic error copy; constant-ish auth timing |
| Pool exhaustion DoS | DoS | Singleton + pooled URL + `connection_limit=1` (DATA-02) |

---

## Sources

### Primary (HIGH)
- npm registry (live, 2026-06-05): `next-auth` (beta 5.0.0-beta.31), `prisma`/`@prisma/client` (latest 7.8.0, prev 6.19.2), `bcryptjs` 3.0.3, `@vercel/blob` 2.4.0, `zod` 4.4.3, `@auth/prisma-adapter` 2.11.2, `@t3-oss/env-nextjs` 0.13.11, `@node-rs/argon2` 2.0.2, `sharp` 0.34.5
- vercel.com/docs/vercel-blob/private-storage — private store + `get(pathname,{access:'private'})` proxy delivery; "don't gate via middleware"; requires `@vercel/blob` ≥ 2.3
- vercel.com/docs/vercel-blob/using-blob-sdk — `put`/`get`/`head`/`del`/`copy` signatures, `access` param, `validUntil` on client tokens
- authjs.dev/getting-started/installation — auth.ts + route handler + middleware (proxy.ts only on Next 16+); `AUTH_SECRET`
- authjs.dev/getting-started/authentication/credentials — `authorize()` shape
- prisma.io/docs (connection management; serverless pooling) — via STACK.md/PITFALLS.md citations (HIGH)
- Repo inspection: `.env`/`.env.local` (keys present, gitignored, only `.env.example` tracked), `lib/runpod.ts`, `app/api/blob/upload/route.ts` (no caller auth), `package.json`, `vercel.json`

### Secondary (MEDIUM)
- ui.shadcn.com (Tailwind v4 init, `new-york`/`neutral`/cssVars) — via UI-SPEC's verified setup steps
- Upstream `.planning/research/{STACK,ARCHITECTURE,PITFALLS}.md` (HIGH-confidence internal, cross-checked & version-corrected here)

### Tertiary (LOW / flagged)
- Exact Auth.js v5 beta callback signatures (A1) — verify against installed `.d.ts`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version re-verified on live npm; corrected two drifts vs STACK.md.
- Architecture: HIGH — split-config + requireRole + pooling are well-established; only beta callback shape is LOW.
- Private Blob (SEC-02): HIGH — re-verified against current Vercel docs; materially corrects the "signed URL" assumption.
- Pitfalls: HIGH — sourced from PITFALLS.md + confirmed by repo inspection (open upload route, leaked-key env files).

**Research date:** 2026-06-05
**Valid until:** ~2026-06-19 (14 days — `next-auth` is a moving beta and Prisma/Blob are active; re-check `next-auth@beta` and `@vercel/blob` before install).
