# Phase 4: Orchestration & Status - Research

**Researched:** 2026-06-05
**Domain:** Async job orchestration on RunPod within Vercel's 60s function cap — chunked cron dispatcher, webhook-driven status, cron reconciliation fallback, idempotent retry, cancel. Next.js 15 App Router (Route Handlers + Server Actions + Server Components), Prisma/Postgres.
**Confidence:** HIGH (codebase patterns verified by reading; RunPod/Vercel specifics verified against current official docs)

## Summary

Phase 3 already creates `Batch` (status `"queued"`) + N `Job` rows (`status: queued`, carrying a generated `recipe` JSON and a `combo`) inside one transaction, and deliberately does **not** dispatch. Phase 4 owns everything from dispatch onward. The hard architectural constraint is **Vercel's 60s function cap** (`vercel.json` `maxDuration: 60` on all `app/api/**`): a 48-job batch cannot be dispatched synchronously in one request, and the UI must **never** fan out N RunPod `/status` calls on page load.

The solution is a **three-mover status model that writes the DB out-of-band**, exactly mirroring the already-shipped inspection slice (`lib/products/inspection.ts` + `test/inspection-dispatch.test.ts`):

1. **A chunked Vercel Cron dispatcher** picks up `queued` jobs in bounded chunks (recommend ≤10 per tick), calls `submitRunPod(input)` with the job's `recipe` + a `webhook` URL + secret, and persists `runpodJobId` + `status: submitted`. This is the only approach that never blows 60s for a large batch. `[VERIFIED: codebase + Vercel docs]`
2. **The webhook receiver** (`app/api/webhooks/runpod/route.ts`, already auth-gated in Phase 1, already allowlisted in `middleware.ts`) maps RunPod's terminal callback (`{id, status, output, ...}`) to the `Job` by `runpodJobId` and writes `status`/`result`/`error` **idempotently**.
3. **A Vercel Cron reconciliation job** polls `getRunPodStatus` for the *non-terminal* jobs only (webhook-missed fallback) and also **re-dispatches** failed-and-under-cap jobs (ORCH-03 retry). User pages read Postgres only.

**Primary recommendation:** Implement dispatch as a **secret-authed Vercel Cron route** (`/api/cron/dispatch`) that claims a bounded chunk of `queued` jobs per tick; implement the webhook reconcile + a second cron `/api/cron/reconcile` that polls non-terminal jobs and drives idempotent retry. Cancel is a Server Action calling RunPod `/cancel/{id}` + setting DB `cancelled`, guarded by `requireSession` + IDOR. **A `[BLOCKING]` Prisma migration is required first** (see Schema). Pro plan is required for per-minute crons (Hobby caps at once/day — deployment-critical).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dispatch queued jobs to RunPod | API/Backend (Vercel Cron route) | — | Must run in bounded chunks under 60s; not user-triggered (ORCH-01) |
| Receive terminal status | API/Backend (webhook Route Handler) | — | M2M push; the one public secret-gated route (ORCH-02, SEC-04) |
| Reconcile missed webhooks + retry | API/Backend (Vercel Cron route) | — | Polls non-terminal jobs only; fallback + retry trigger (ORCH-02/03) |
| Cancel batch/job | API/Backend (Server Action) | RunPod `/cancel` | requireSession + IDOR; RunPod-side stop + DB state (ORCH-05) |
| Read batch progress / job status | Frontend Server (Server Component, DB-only) | — | DB-only reads; never RunPod per request (ORCH-02/04) |
| "Live-ish" freshness | Browser/Client | Frontend Server | Client polls a lightweight DB GET; freshness chip (UI-SPEC) |
| Render execution | RunPod GPU (worker) | — | Reused, NOT rebuilt — worker untouched (CLAUDE.md constraint) |

## User Constraints (from project context — no CONTEXT.md exists for this phase)

> No `04-CONTEXT.md` exists (`has_context: false`). Constraints are drawn from CLAUDE.md, the approved 04-UI-SPEC.md, the ROADMAP success criteria, and the Phase 3 boundary.

### Locked (from CLAUDE.md / UI-SPEC / ROADMAP)
- **Worker is untouched.** `workers/runpod-blender/handler.py` already uploads results + returns `{image_url, image_key, metadata_*}` (or `{error, stdout, stderr}` on failure). Only the `/run` **payload** gains a `webhook` field. Do NOT change the worker. `[CITED: CLAUDE.md, reuse_context]`
- **DB-only reads.** Every page load/refresh in the monitor reads Postgres only — never RunPod `/status/:id` per row. `[CITED: 04-UI-SPEC.md §"DB-only status model"]`
- **Webhook + cron reconcile, NOT per-request polling fan-out.** `[CITED: ORCH-02]`
- **No new hues / no purple.** Status carried by inherited Phase 1 status tokens. `[CITED: 04-UI-SPEC.md, CLAUDE.md]`
- **Vercel 60s cap.** All `app/api/**/*.ts` pinned to `maxDuration: 60` in `vercel.json`. `[VERIFIED: vercel.json]`
- **No new shadcn registries.** Only official shadcn + first-party components. `[CITED: 04-UI-SPEC.md §Registry Safety]`
- **GSD workflow:** edits go through a GSD command (CLAUDE.md enforcement).

### Claude's Discretion
- Dispatch chunk size, cron cadence values (recommend ≤10/tick, ~1 min reconcile), retry cap default (~2), claim-row mechanism.
- Whether manual "Retry failed jobs" ships this phase or degrades to read-only Attempt surface (UI-SPEC explicitly allows degrade).

### Deferred (OUT OF SCOPE)
- Layered-output gallery / per-layer download → Phase 5 (OUT-01..03). This phase reads `Layer` rows only for a thumbnail.
- Compositing/flatten → Phase 6.
- Legacy Blob job-store cutover → Phase 7/8.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORCH-01 | Each job submitted to RunPod and tracked with a status (queued/running/completed/failed/cancelled) | Chunked cron dispatcher (Pattern 1) submits `recipe`+`webhook`+secret, persists `runpodJobId`+`submitted`; status enum already exists. Worker `input` shape from `handler.py`. |
| ORCH-02 | Status via RunPod webhook + Vercel Cron reconciliation fallback — not per-request polling | Webhook reconcile (Pattern 2, idempotent) + reconcile cron (Pattern 3) polling non-terminal only; DB-only Server Component reads (Pattern 6). |
| ORCH-03 | Failed job retries ~2× idempotently (no duplicate successful renders) | `attempt` counter + cap; reconcile cron re-dispatches failed-under-cap; idempotency via run-once-per-attempt + terminal-state guard (Pattern 4). |
| ORCH-04 | View batch progress (completed/failed/total) + read error/log per failed job | DB `groupBy` status counts (Pattern 5); `Job.error` stores worker stdout/stderr tail (schema: needs `log` or reuse `error`). |
| ORCH-05 | Cancel a queued/running batch/job | Server Action → RunPod `/cancel/{id}` + set `cancelled`; don't re-dispatch cancelled; requireSession + IDOR (Pattern 7). |
</phase_requirements>

## Standard Stack

**No new packages required.** This phase composes existing, already-installed building blocks. `[VERIFIED: package.json]`

### Core (all already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^15.1.4 | Route Handlers (webhook, cron), Server Actions (cancel/retry), Server Components (monitor) | Already the app framework |
| @prisma/client / prisma | (Phase 1) | Job/Batch state, `groupBy` counts, claim updates | System-of-record |
| @t3-oss/env-nextjs | ^0.13.11 | Typed env for `CRON_SECRET` (new), `RUNPOD_WEBHOOK_SECRET`, `RUNPOD_*` | Existing `lib/env.ts` pattern |
| node:crypto `timingSafeEqual` | builtin | Constant-time secret compare (webhook + cron) | Already used in webhook scaffold |
| vitest | ^4.1.8 | Unit tests with mocked runpod + prisma | Phase 1–3 harness |

### Supporting (reused functions — DO NOT reimplement)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/runpod.ts` → `submitRunPod`, `getRunPodStatus` | POST `/run` (already wraps `{input}`), GET `/status/:id` | Dispatch + reconcile. **Add** `cancelRunPod(id)` for `/cancel/{id}`. |
| `lib/db/prisma.ts` → `prisma` | Pooled singleton (connection_limit=1, pgbouncer) | All DB access |
| `lib/auth/rbac.ts` → `requireSession` | Fail-closed 401 guard | First line of cancel/retry Server Actions |
| `lib/products/inspection.ts` | **Reference implementation** of dispatch+poll+status-mapping over the SAME RunPod statuses | Copy its structure for job dispatch/reconcile |

### New env var
| Var | Purpose | Notes |
|-----|---------|-------|
| `CRON_SECRET` | Authenticate Vercel Cron → cron route handlers | Vercel auto-sends `Authorization: Bearer ${CRON_SECRET}`. Add to `lib/env.ts` server schema (`z.string().min(1)`). `[VERIFIED: Vercel docs]` |

**Installation:** none. `npm` unchanged. New schema fields via `prisma migrate` (below).

## Package Legitimacy Audit

> No external packages are added in this phase. Every dependency is already installed and used in Phases 1–3.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none added) | — | N/A — phase composes existing deps only |

**Packages removed due to slopcheck [SLOP] verdict:** none (no installs).
**Packages flagged as suspicious [SUS]:** none.

## SCHEMA — [BLOCKING] Prisma Migration (run directly; DB is live)

Read against `prisma/schema.prisma` (lines 21–29 enum, 143–159 `Job`, 131–141 `Batch`). The DB **already has**: `Job.runpodJobId String?`, `Job.attempt Int @default(0)`, `Job.error String?`, `Job.recipe`, `Job.combo`, `Job.submittedAt`, `Job.finishedAt`, `Job.outputPrefix`, `@@index([batchId, status])`; `Batch.status String`, `Batch.jobCount`. The `JobStatus` enum already includes `queued submitted in_queue in_progress completed failed cancelled`. `[VERIFIED: schema read]`

**Fields ORCH needs that are MISSING** (drive the migration):

| Field | Model | Type | Why needed | Req |
|-------|-------|------|-----------|-----|
| `result` | Job | `Json?` | Persist webhook `output` (`image_url`, `image_key`, `metadata_*`) so Phase 5 reads layers from DB without re-fetching RunPod | ORCH-02/04 |
| `log` | Job | `String?` (or reuse `error`) | Worker stdout/stderr **tail** for the error-log viewer. Repo convention: `error` holds `status.error || status.output`. UI-SPEC says viewer reads `Job.error`. **Decision: reuse `Job.error` for the tail (no new column needed)** — but if a one-line summary + raw tail must be split, add `log String?`. **Recommend: reuse `error`** (matches inspection slice). | ORCH-04 |
| `startedAt` | Job | `DateTime?` | Running-job live duration in the monitor (UI-SPEC duration column). `submittedAt` exists but is dispatch time, not render start | ORCH-04 |
| `runpodRequestId` | Job | `String?` | **Idempotency key** — the `id` returned by `submitRunPod` for the CURRENT attempt. (NOTE: `runpodJobId` already exists and can serve this role — see Pitfall 2.) **Decision: reuse `runpodJobId`**; it is overwritten on each re-dispatch and is the join key the webhook uses. No new column. | ORCH-03 |
| `cancelRequestedAt` | Job/Batch | `DateTime?` | Distinguish "cancelling" (requested) from "cancelled" (applied) for the UI-SPEC cancelling state | ORCH-05 |

**Recommended minimal migration (additive, backward-compatible):**
```prisma
model Job {
  // ...existing...
  result            Json?      // webhook output (image_url, keys, metadata) — ORCH-02/04
  startedAt         DateTime?  // render start for live duration — ORCH-04
  cancelRequestedAt DateTime?  // cancelling vs cancelled — ORCH-05
  // error  String?  -> REUSE for stdout/stderr tail (already exists)
  // runpodJobId String? -> REUSE as idempotency/join key (already exists)
}
model Batch {
  // ...existing...
  cancelRequestedAt DateTime?  // batch-level cancelling state — ORCH-05
}
```
Run with the **direct** connection (migrations use `DIRECT_URL` per schema header):
```bash
npx prisma migrate dev --name orch_job_result_started_cancel
# CI/prod: npx prisma migrate deploy
```
`[ASSUMED — confirm with user]` whether `Batch.status` should adopt a typed enum vs. the current free `String` (Phase 3 left it `String`, default `"draft"`, set to `"queued"` on create). Phase 4 owns batch-status progression; recommend keeping `String` and deriving batch status from job counts (UI-SPEC: "Derived batch status — computed from its jobs, not stored").

## Architecture Patterns

### System Architecture Diagram
```
                         ┌──────────── Vercel (Next.js 15, all maxDuration:60) ────────────┐
                         │                                                                  │
 Vercel Cron ──GET──────►│  /api/cron/dispatch   ── claim ≤N queued Jobs (FOR UPDATE        │
 (~1 min, Pro)           │  (CRON_SECRET Bearer)    SKIP LOCKED / status guard) ────┐       │
                         │        │ submitRunPod(recipe + webhook + secret)         │       │
                         │        ▼ persist runpodJobId, status=submitted           │       │
                         │  ┌─────────────────────────────────────────────┐        │       │
 Vercel Cron ──GET──────►│  │ /api/cron/reconcile  (CRON_SECRET Bearer)    │        │       │
 (~1 min, Pro)           │  │  for non-terminal jobs w/ runpodJobId:       │        ▼       │
                         │  │   getRunPodStatus → map → DB (fallback)      │   ┌─────────┐  │
                         │  │  re-dispatch failed & attempt<cap (retry)    │   │ Postgres│  │
                         │  └─────────────────────────────────────────────┘   │  Job /  │  │
                         │                                                     │  Batch  │  │
 RunPod ──POST callback─►│  /api/webhooks/runpod  (x-webhook-secret, 200)      └────▲────┘  │
 (terminal state)        │   parse {id,status,output} → match Job by           write│ read  │
                         │   runpodJobId → idempotent status/result/error ──────────┘ only  │
                         │                                                          │       │
 Operator browser ──────►│  /batches, /batches/[id]  (Server Component)  ──read─────┘       │
   (poll lightweight     │   Cancel/Retry Server Actions → cancelRunPod(/cancel/id)+DB      │
    DB GET, freshness)   └──────────────────────────────────────────────────────────────────┘
                                          │ submitRunPod /run (input+webhook)   │ /cancel/{id}
                                          ▼                                     ▼
                         ┌──────────────────── RunPod Serverless GPU ──────────────────────┐
                         │  handler.py (UNCHANGED): download model → Blender render →       │
                         │  upload to Blob → return {image_url, keys, metadata} | {error..} │
                         └──────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
app/api/
├── webhooks/runpod/route.ts     # EXISTS (Phase 1 scaffold) — implement reconcile TODO
├── cron/
│   ├── dispatch/route.ts        # NEW — chunked dispatcher (GET, CRON_SECRET)
│   └── reconcile/route.ts       # NEW — fallback poll + retry re-dispatch (GET, CRON_SECRET)
└── batches/[id]/status/route.ts # NEW (optional) — lightweight DB GET for client freshness poll
app/(app)/batches/
├── page.tsx                     # NEW — Batches list (Server Component, DB-only)
└── [id]/page.tsx                # NEW — jobs monitor (Server Component, DB-only)
lib/
├── runpod.ts                    # EXTEND — add cancelRunPod(id)
├── orchestration/
│   ├── dispatch.ts              # claim+submit one chunk (pure-ish, testable)
│   ├── reconcile.ts             # map RunPod status → Job update (idempotent)
│   ├── webhook.ts               # parse callback → Job update (idempotent)
│   ├── retry.ts                 # failed-under-cap re-dispatch
│   ├── cancel.ts                # Server Action: cancel batch/job
│   └── batch-status.ts          # derive batch status + counts from jobs (DB-only)
vercel.json                      # ADD "crons": [...]
lib/env.ts                       # ADD CRON_SECRET
```

### Pattern 1: Chunked Cron Dispatcher (ORCH-01) — the 60s-safe answer
**What:** A `GET /api/cron/dispatch` route, secret-authed, that claims a bounded chunk of `queued` jobs and submits each to RunPod. Bounded chunk × per-call latency stays well under 60s.
**When to use:** Always — this is the recommended dispatch site. Alternatives below are inferior.
**Decision — WHERE dispatch happens (the core question):**

| Option | Verdict | Reason |
|--------|---------|--------|
| Dispatch synchronously in Phase 3 `createBatch` | **REJECT** | A 48-job batch × ~100–300ms/`/run` call + transaction = blows 60s; also couples create to RunPod availability (Phase 3 boundary explicitly forbids importing runpod). |
| Fire-and-forget per job from create | **REJECT** | No retry/idempotency surface; serverless may kill the function before all complete; unobservable. |
| **Chunked Vercel Cron dispatcher** | **RECOMMEND** | Each tick claims ≤N (recommend ≤10) `queued` jobs, submits them, persists `runpodJobId`+`submitted`. Naturally bounded; resumes next tick; retriable; respects RunPod concurrency. `[VERIFIED: Vercel docs + 60s math]` |

**Example (claim-then-submit, race-safe):**
```typescript
// app/api/cron/dispatch/route.ts
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { submitRunPod } from "@/lib/runpod";

export const runtime = "nodejs";
const CHUNK = 10;

function authed(req: Request): boolean {
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || !authed(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Claim a bounded chunk WITHOUT re-dispatching cancelled/terminal jobs.
  // updateMany on a SELECT'd id set flips queued->submitted atomically so a
  // concurrent tick can't grab the same row (status guard = optimistic claim).
  const candidates = await prisma.job.findMany({
    where: { status: "queued", batch: { status: { notIn: ["cancelled"] } } },
    take: CHUNK,
    select: { id: true, recipe: true, batchId: true },
  });
  const webhookUrl = `${process.env.APP_URL}/api/webhooks/runpod`;
  for (const job of candidates) {
    // Optimistic claim: only proceed if THIS update flips a still-queued row.
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, status: "queued" },
      data: { status: "submitted", submittedAt: new Date(), attempt: { increment: 0 } },
    });
    if (claimed.count === 0) continue; // another tick took it
    try {
      const { id } = await submitRunPod({
        operation: "render",
        job_id: job.id,            // worker key == our Job.id (drives output prefix)
        model: /* from batch.product.modelUrl via workerModelUrl() */ undefined,
        recipe: job.recipe,
        output: { prefix: `renders/${job.id}` },
        webhook: webhookUrl,       // RunPod calls back on terminal state
      });
      await prisma.job.update({
        where: { id: job.id },
        data: { runpodJobId: id, status: "in_queue" },
      });
    } catch (e) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "queued" }, // release for retry next tick
      });
    }
  }
  return NextResponse.json({ dispatched: candidates.length });
}
```
> **Webhook secret transport:** RunPod's `webhook` field is just a URL — it does NOT add a custom header. Put the secret in the URL or rely on the worker echoing it. **The existing scaffold reads `x-webhook-secret` header**, which RunPod will NOT send. **Decision (Pitfall 5):** carry the secret as a URL query/path token (`/api/webhooks/runpod?s=<secret>` or `/api/webhooks/runpod/<secret>`) and have the route compare it in constant time — OR keep verifying by matching the callback's `id` to a known `runpodJobId` (defense-in-depth) plus the secret-in-URL. Confirm RunPod cannot send a custom header. `[ASSUMED — verify]`

### Pattern 2: Idempotent Webhook Reconcile (ORCH-02)
**What:** Parse RunPod's callback `{id, status, output, ...}`, find the `Job` by `runpodJobId === id`, write status/result/error. **Idempotent:** a duplicate/late callback must no-op.
**When:** The primary status path. RunPod retries the webhook up to 2 more times (10s apart) on non-200, so duplicates are expected. `[VERIFIED: RunPod docs]`
**Idempotency rule:** only transition **non-terminal → terminal**; if the Job is already terminal (`completed`/`failed`/`cancelled`), no-op. Use a guarded `updateMany`:
```typescript
// inside POST after secret check
const body = await req.json();           // {id, status, output, error?}
const map = { COMPLETED: "completed", FAILED: "failed", CANCELLED: "cancelled",
              IN_PROGRESS: "in_progress", IN_QUEUE: "in_queue", TIMED_OUT: "failed" } as const;
const next = map[body.status as keyof typeof map];
if (!next) return Response.json({ ok: true }); // unknown -> ignore
const terminal = ["completed", "failed", "cancelled"] as const;
// Guard: only write if the row is NOT already terminal (idempotent / no clobber).
await prisma.job.updateMany({
  where: { runpodJobId: body.id, status: { notIn: [...terminal] } },
  data: next === "completed"
    ? { status: "completed", result: body.output, finishedAt: new Date(), error: null }
    : next === "failed"
    ? { status: "failed", error: tail(body.output ?? body.error), finishedAt: new Date() }
    : { status: next },
});
return Response.json({ ok: true });       // ALWAYS 200 (else RunPod retries)
```
Worker failure shape is `{error, stdout, stderr}` (see `handler.py:116`), surfaced under `status.output` on RunPod COMPLETED-with-error or under FAILED. `tail()` truncates to ~4000 chars (matches worker convention).

### Pattern 3: Cron Reconciliation Fallback (ORCH-02) + Retry trigger (ORCH-03)
**What:** `GET /api/cron/reconcile` (secret-authed). For each **non-terminal** Job with a `runpodJobId`, call `getRunPodStatus(runpodJobId)` and apply the SAME mapping as the webhook (idempotent). Then re-dispatch failed-under-cap jobs.
**Why:** A missed/failed webhook would otherwise strand a job forever. Polls only non-terminal jobs (bounded), never on user page load.
```typescript
const stuck = await prisma.job.findMany({
  where: { runpodJobId: { not: null },
           status: { in: ["submitted", "in_queue", "in_progress"] } },
  take: 50, select: { id: true, runpodJobId: true },
});
for (const j of stuck) {
  const s = await getRunPodStatus(j.runpodJobId!);  // same map+guard as webhook
  // ...applyStatus(j.id, s)...
}
```

### Pattern 4: Idempotent Retry (ORCH-03)
**What:** A `failed` job with `attempt < CAP` (CAP≈2) is re-queued by the reconcile cron, which increments `attempt` and flips it back to `queued` so the dispatcher re-submits (a fresh `/run` → new `runpodJobId`, overwriting the old).
**Idempotency guarantee:** a job that is **already `completed` is never retried** (terminal guard), so no duplicate *successful* render. The "RunPod request id" tracked is `runpodJobId`; reusing/overwriting it per attempt means at most one in-flight RunPod job per Job row at a time. Re-dispatch only ever happens from `failed`, never from `completed`/`cancelled`.
```typescript
const CAP = Number(process.env.RETRY_CAP ?? 2);
await prisma.job.updateMany({
  where: { status: "failed", attempt: { lt: CAP },
           batch: { status: { notIn: ["cancelled"] } } },
  data: { status: "queued", attempt: { increment: 1 }, error: null, runpodJobId: null },
});
```
**UI surface (read-only, required):** Attempt column renders `attempt {n} of {CAP}` (UI-SPEC). Manual "Retry failed jobs" is **optional** this phase; if shipped it re-queues failed jobs with the same idempotent guard, gated by `requireSession` + IDOR.

### Pattern 5: DB-derived progress (ORCH-04)
```typescript
const counts = await prisma.job.groupBy({
  by: ["status"], where: { batchId }, _count: { _all: true },
});  // -> {completed, failed, in_progress, queued+submitted+in_queue, cancelled}
```
Derive batch status from counts (UI-SPEC mapping): all completed → completed; ≥1 running → running; all terminal w/ mix → "partly failed" (warning). **Never store a 6th color.**

### Pattern 6: DB-only Server Component reads (ORCH-02)
The `/batches` and `/batches/[id]` pages are **Server Components** that import `prisma` only — **never** `lib/runpod`. A plan-checker / test asserts no `submitRunPod`/`getRunPodStatus`/`runpod` import in any `page.tsx`. The client gets "live-ish" via a lightweight `GET /api/batches/[id]/status` that re-reads Postgres; the freshness chip shows recency.

### Pattern 7: Cancel (ORCH-05)
Server Action, `requireSession` first (fail-closed), IDOR-load the batch/job (reject if not found / not owner-visible). Call RunPod `cancelRunPod(runpodJobId)` (`POST /v2/{endpoint}/cancel/{id}`) for cancelable (`queued`/`submitted`/`in_queue`/`in_progress`) jobs, set `cancelRequestedAt` + `status: cancelled`. **Completed jobs are kept.** The dispatcher's `notIn: ["cancelled"]` batch guard prevents re-dispatch.

### Anti-Patterns to Avoid
- **Per-request RunPod fan-out on page load** — forbidden (ORCH-02); 60s-fatal at batch scale.
- **Synchronous dispatch in `createBatch`** — blows 60s; violates Phase 3 boundary.
- **Returning non-200 from the webhook on a duplicate** — triggers RunPod's 2 retries; always 200 after auth.
- **Unguarded status writes** — a late webhook could flip a `completed` job back; always guard `status notIn terminal`.
- **Importing `lib/runpod` in a Server Component** — breaks the DB-only contract.
- **Re-dispatching `cancelled`/`completed` jobs** — must be excluded in every claim/retry `where`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background job runner | A custom in-process queue/worker loop | **Vercel Cron** route handlers | No background workers in Next.js/Vercel serverless; cron is the platform primitive |
| Cron auth | Custom token scheme | `CRON_SECRET` + `Authorization: Bearer` (Vercel auto-sends) | Standard, documented; constant-time compare |
| Webhook secret compare | `===` string compare | `node:crypto.timingSafeEqual` (already in scaffold) | Timing-safe; matches Phase 1 |
| RunPod submit/status/cancel | New fetch wrappers | Extend `lib/runpod.ts` | One client; tests already mock `@/lib/runpod` |
| Status mapping | Bespoke per-route logic | One shared `mapRunPodStatus()` used by webhook + reconcile | DRY; identical idempotent guard everywhere |
| Concurrency claim | DB advisory locks / external lock | Optimistic `updateMany where status='queued'` (claim flips state) | Postgres-native, serverless-safe, no extra infra |

**Key insight:** Vercel serverless has **no durable background process**. The ONLY correct dispatcher is a cron-triggered route that does bounded work per tick. Everything else is the same RunPod + Prisma plumbing the inspection slice already proved.

## Runtime State Inventory

> Not a rename/refactor phase — but there is critical **deploy-time/runtime config state** that a code-only audit misses.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `Batch.status` is free `String` (default `"draft"`, Phase 3 sets `"queued"` on create). Existing rows may carry `"draft"`. | Code: derive batch status from job counts; treat any non-terminal as queued/running. No migration of existing strings strictly required. |
| Live service config | **Vercel Cron entries** live in `vercel.json` (in git) — but they only take effect **on deploy to production**. Crons do NOT run on preview deployments. | Add `crons` to `vercel.json`; verify in the Vercel dashboard post-deploy. |
| OS-registered state | None (serverless). | None. |
| Secrets/env vars | `CRON_SECRET` (NEW) and `APP_URL`/deployed base URL must be set in **Vercel project env**, not just `.env.local`. `RUNPOD_WEBHOOK_SECRET` already exists. Webhook URL must be the **deployed** app URL. | Add `CRON_SECRET` to Vercel env + `lib/env.ts`; ensure a base-URL env (e.g. `APP_URL` or `VERCEL_PROJECT_PRODUCTION_URL`) for building the webhook URL. |
| Build artifacts | Prisma Client must be regenerated after the migration (`prisma generate`, typically in `postinstall`/build). | Run `prisma migrate deploy` + `prisma generate` in the deploy pipeline. |

**Nothing found for OS-registered state — verified by serverless architecture (no host processes).**

## Common Pitfalls

### Pitfall 1: Hobby plan crons run only once/day
**What goes wrong:** A `*/1 * * * *` (per-minute) cron **fails deployment** on Hobby ("Hobby accounts are limited to daily cron jobs"). The reconcile/dispatch model needs ~1-min cadence.
**Why:** Vercel limits Hobby to once-per-day crons; Pro/Enterprise allow per-minute. `[VERIFIED: Vercel usage docs]`
**How to avoid:** Confirm the deploy target (`sukrus-projects-1b84f634/jewelry-render-studio`) is on **Pro**. If Hobby, dispatch/reconcile cannot be minutely — surface as a `[BLOCKING]` deploy question.
**Warning signs:** Deployment fails with the daily-cron error.

### Pitfall 2: Two distinct ids — worker `job_id` vs RunPod `id`
**What goes wrong:** Conflating the app-minted worker key (`input.job_id`, drives output prefix) with RunPod's returned job `id` (drives `/status`, `/cancel`, and the webhook join).
**Why:** The inspection slice proves they're **deliberately distinct** (`test/inspection-dispatch.test.ts:95-113`): `input.job_id` is the worker key; `runpodJobId === submitRunPod().id`.
**How to avoid:** For renders, you may set `input.job_id = Job.id` (clean output prefix `renders/<Job.id>`), but **persist `runpodJobId` = the value RunPod returns**, and the webhook matches on `body.id === runpodJobId`.
**Warning signs:** Webhook can't find the Job; `/cancel` 404s.

### Pitfall 3: Duplicate/late webhooks corrupting terminal state
**What goes wrong:** RunPod retries the webhook 2× on non-200; a late COMPLETED arrives after a retry already set FAILED, or vice-versa.
**Why:** At-least-once delivery. `[VERIFIED: RunPod docs — "retries up to 2 more times"]`
**How to avoid:** Guard every write with `status: { notIn: [terminal] }`; always return 200; first terminal write wins.
**Warning signs:** A completed job flips to failed, or attempt count drifts.

### Pitfall 4: Concurrent cron ticks double-dispatching the same job
**What goes wrong:** Two overlapping dispatch ticks both read the same `queued` row and submit it twice → duplicate RunPod jobs.
**Why:** `findMany` then `submit` is a read-then-act race.
**How to avoid:** Optimistic claim — `updateMany where {id, status:'queued'} set status:'submitted'`; only proceed if `count === 1`. (Postgres `SELECT … FOR UPDATE SKIP LOCKED` via `$queryRaw` is an alternative if stronger guarantees are needed.)
**Warning signs:** Two `runpodJobId`s for one logical render; double GPU spend.

### Pitfall 5: RunPod webhook can't send a custom header
**What goes wrong:** The Phase 1 scaffold reads `x-webhook-secret`, but RunPod's `webhook` field is a plain URL — it likely won't attach a custom header.
**Why:** RunPod docs show only the URL; no header config documented.
**How to avoid:** Carry the secret in the webhook **URL** (path or query) and compare it constant-time; additionally verify `body.id` matches a known `runpodJobId`. Update the scaffold's auth source accordingly. `[ASSUMED — verify RunPod cannot send a header; HIGH-impact if wrong]`
**Warning signs:** Every webhook 401s in production.

### Pitfall 6: Cron doesn't run on preview deploys
**What goes wrong:** Status never updates on a preview URL; works only in production.
**Why:** Vercel Cron triggers the **production** deployment only.
**How to avoid:** Test dispatch/reconcile/webhook logic via unit tests + manual `curl` with the Bearer/secret; expect live cron only in prod.

## Code Examples

### Add cancelRunPod to lib/runpod.ts
```typescript
// Source: pattern of existing submitRunPod/getRunPodStatus + RunPod cancel docs
export async function cancelRunPod(runpodJobId: string) {
  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  if (!apiKey || !endpointId) throw new Error("RunPod env not configured.");
  const res = await fetch(
    `https://api.runpod.ai/v2/${endpointId}/cancel/${runpodJobId}`,
    { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();   // RunPod sets job status -> CANCELLED
}
// Source: RunPod cancel endpoint — POST /v2/<endpoint>/cancel/<job_id> [VERIFIED: docs.runpod.io]
```

### vercel.json crons (Pro plan)
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "functions": { "app/api/**/*.ts": { "maxDuration": 60 } },
  "crons": [
    { "path": "/api/cron/dispatch",   "schedule": "* * * * *" },
    { "path": "/api/cron/reconcile",  "schedule": "* * * * *" }
  ]
}
```
> Vercel triggers crons by GET to the production URL; user agent `vercel-cron/1.0`; auto-sends `Authorization: Bearer ${CRON_SECRET}`. `[VERIFIED: vercel.com/docs/cron-jobs]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy public-Blob job store + per-request RunPod status fan-out (`lib/jobs.ts`, `app/api/render-jobs`) | Postgres `Job`/`Batch` + webhook + cron reconcile, DB-only reads | This product layer (Phase 1–4) | No N RunPod calls per page; scalable status |
| Client-driven polling of RunPod | Push webhook (primary) + cron poll (fallback) | ORCH-02 | Removes 60s-fatal fan-out |

**Deprecated/outdated:** Do not reuse `lib/jobs.ts` Blob job-state or the `app/api/render-jobs` per-request RunPod refresh for the new batch flow — that's the legacy single-tenant path being replaced (cutover is Phase 7/8).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 (`vitest run`), node env, `test/setup.ts` |
| Config file | `vitest.config.ts` (tsconfig paths, next/server alias, next-auth inlined) |
| Quick run command | `npm run test:dot` |
| Full suite command | `npm test` |
| Mocking pattern | `vi.mock("@/lib/runpod")`, `vi.mock("@/lib/db/prisma")`, `vi.mock("@/lib/auth/rbac")`, `vi.hoisted` mocks — see `test/inspection-dispatch.test.ts`, `test/webhook-auth.test.ts` |

### Phase Requirements → Test Map
| Req | Behavior | Type | Automated Command | File Exists? |
|-----|----------|------|-------------------|-------------|
| ORCH-01 | dispatch builds RunPod input incl. `recipe` + `webhook` URL + `job_id`; persists `runpodJobId` + status | unit | `vitest run test/orch-dispatch.test.ts` | ❌ Wave 0 |
| ORCH-01 | dispatch claims ≤CHUNK queued jobs; skips cancelled batches; releases on submit error | unit | `vitest run test/orch-dispatch.test.ts` | ❌ Wave 0 |
| ORCH-02 | webhook bad/missing secret → 401; valid → 200 (extend existing) | unit | `vitest run test/webhook-auth.test.ts` | ✅ extend |
| ORCH-02 | webhook maps COMPLETED→completed (+result), FAILED→failed (+error tail) by `runpodJobId` | unit | `vitest run test/orch-webhook.test.ts` | ❌ Wave 0 |
| ORCH-02 | webhook idempotency: duplicate/late callback no-ops a terminal job; always returns 200 | unit | `vitest run test/orch-webhook.test.ts` | ❌ Wave 0 |
| ORCH-02 | reconcile cron polls only non-terminal jobs, applies same mapping; bad CRON_SECRET → 401 | unit | `vitest run test/orch-reconcile.test.ts` | ❌ Wave 0 |
| ORCH-03 | retry re-queues failed-under-cap (attempt++, runpodJobId=null); never re-queues completed/cancelled | unit | `vitest run test/orch-retry.test.ts` | ❌ Wave 0 |
| ORCH-04 | progress counts via groupBy; derived batch status mapping | unit | `vitest run test/orch-progress.test.ts` | ❌ Wave 0 |
| ORCH-04 | failed job error tail stored/readable | unit | `vitest run test/orch-webhook.test.ts` | ❌ Wave 0 |
| ORCH-05 | cancel sets cancelled + calls cancelRunPod(/cancel/id); requireSession first; IDOR rejects; completed kept | unit | `vitest run test/orch-cancel.test.ts` | ❌ Wave 0 |
| ORCH-05 | dispatcher/retry never re-dispatch cancelled jobs | unit | `vitest run test/orch-dispatch.test.ts` | ❌ Wave 0 |
| ORCH-02 | DB-only reads: no `runpod` import in any `app/**/page.tsx` (source-text assert, like `deny-default.test.ts`) | unit | `vitest run test/orch-db-only.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:dot`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/orch-dispatch.test.ts` — ORCH-01 (mock runpod + prisma)
- [ ] `test/orch-webhook.test.ts` — ORCH-02/04 mapping + idempotency
- [ ] `test/orch-reconcile.test.ts` — ORCH-02 fallback + CRON_SECRET auth
- [ ] `test/orch-retry.test.ts` — ORCH-03 cap + idempotency
- [ ] `test/orch-cancel.test.ts` — ORCH-05 RunPod cancel + IDOR + requireSession
- [ ] `test/orch-progress.test.ts` — ORCH-04 counts/derived status
- [ ] `test/orch-db-only.test.ts` — source-text guard (no runpod import in page components)
- [ ] Extend `test/webhook-auth.test.ts` for the reconcile body path
- [ ] Shared `mapRunPodStatus()` helper covered by webhook + reconcile tests
- [ ] No framework install needed — Vitest harness exists.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Webhook shared secret (timingSafeEqual); `CRON_SECRET` Bearer for cron routes |
| V3 Session Management | yes | Cancel/retry Server Actions call `requireSession` first (fail-closed) |
| V4 Access Control | yes | IDOR — never trust client `batchId`/`jobId`; load + authorize before cancel/retry (mirror `createBatch` (3)) |
| V5 Input Validation | yes | zod-validate webhook body + Server Action inputs before use |
| V6 Cryptography | yes | Constant-time secret compare only; never hand-roll crypto |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook flips job state | Spoofing/Tampering | Secret in URL (constant-time) + `body.id` must match a known `runpodJobId`; idempotent terminal guard |
| Unauthenticated cron trigger (anyone curls the URL) | Spoofing/EoP | `CRON_SECRET` Bearer compare; 401 otherwise (Vercel won't send secret to non-cron callers) |
| IDOR: cancel another operator's batch | Tampering/EoP | requireSession + load-and-authorize the batch/job |
| Duplicate dispatch → runaway GPU cost | DoS/cost | Optimistic claim + bounded CHUNK; cancelled/terminal excluded |
| Leaking env/secret names in error-log viewer | Info Disclosure | UI-SPEC rule: never render secret/env names; tail only worker stdout/stderr |

## Assumptions Log
| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | RunPod's `webhook` field cannot attach a custom request header → secret must travel in the URL (scaffold currently reads `x-webhook-secret`) | Pattern 1/2, Pitfall 5 | If RunPod CAN send a header, scaffold is fine as-is; if it can't and we don't change auth source, every webhook 401s in prod |
| A2 | Reuse `Job.error` for the stdout/stderr tail and `Job.runpodJobId` as the idempotency/join key (no new columns for these) | Schema | If a split log/summary or separate idempotency key is wanted, add `log`/`runpodRequestId` columns |
| A3 | Deploy target is on Vercel **Pro** (per-minute crons) | Pitfall 1 | On Hobby, minutely dispatch/reconcile fails deployment → architecture blocked |
| A4 | `Batch.status` stays a free `String`; batch status is derived from job counts, not stored as a 6th value | Schema | If a stored enum is required, a migration + write path changes |
| A5 | A base-URL env (`APP_URL` / `VERCEL_PROJECT_PRODUCTION_URL`) is available to build the absolute webhook URL | Runtime State, Pattern 1 | Without it the webhook URL can't be constructed at dispatch |
| A6 | Setting `input.job_id = Job.id` for renders is safe (worker uses it only for output prefix) | Pattern 1, Pitfall 2 | If a worker key collision matters, mint a separate key and still persist RunPod's returned id |

## Open Questions
1. **Webhook secret transport (A1).** Confirm whether RunPod can send a custom header on the callback. Known: scaffold reads `x-webhook-secret`. Recommendation: move secret into the webhook URL + match `body.id` to `runpodJobId`; update the scaffold's auth source in this phase.
2. **Vercel plan (A3).** Confirm Pro. If Hobby, escalate as `[BLOCKING]` — minutely crons won't deploy.
3. **Manual retry scope.** UI-SPEC allows degrading "Retry failed jobs" to the read-only Attempt surface. Confirm whether the manual control ships this phase (auto-retry via cron is required regardless).
4. **RunPod concurrency limit.** Endpoint max-worker/concurrency caps the useful CHUNK size and how fast a 48-job batch clears. Recommend CHUNK ≤ endpoint max workers; confirm the endpoint's configured worker count. `[ASSUMED]`

## Environment Availability
| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| RunPod `/run`,`/status`,`/cancel` | dispatch/reconcile/cancel | ✓ (live endpoint) | v2 API | — |
| RunPod `webhook` field on `/run` | ORCH-02 push status | ✓ | documented | cron reconcile is the fallback |
| Vercel Cron (per-minute) | dispatch + reconcile | ✓ on **Pro** | — | Hobby = once/day (BLOCKING) |
| Postgres (pooled) | all state | ✓ (Phase 1) | — | — |
| `CRON_SECRET` env | cron auth | ✗ (new) | — | none — must add to Vercel env + lib/env.ts |
| Deployed base URL env | build webhook URL | ? confirm | — | `VERCEL_PROJECT_PRODUCTION_URL` |

**Missing dependencies with no fallback:** `CRON_SECRET` (must be added before deploy); a production base-URL env for the webhook URL.
**Missing with fallback:** webhook delivery → cron reconcile covers misses.

## Sources

### Primary (HIGH confidence)
- Codebase (read this session): `lib/runpod.ts`, `app/api/webhooks/runpod/route.ts`, `prisma/schema.prisma`, `lib/batches/actions.ts`, `workers/runpod-blender/handler.py`, `vercel.json`, `lib/env.ts`, `lib/auth/rbac.ts`, `middleware.ts` (webhook allowlisted), `test/inspection-dispatch.test.ts`, `test/webhook-auth.test.ts`, `test/user-admin.test.ts`, `test/setup.ts`, `vitest.config.ts`, `04-UI-SPEC.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `03-RESEARCH.md`.
- Vercel Cron Jobs — https://vercel.com/docs/cron-jobs (crons schema, `x-vercel-cron-schedule`, GET to prod URL)
- Vercel Cron Usage & Pricing — https://vercel.com/docs/cron-jobs/usage-and-pricing (Hobby once/day vs Pro per-minute)
- RunPod Send Requests — https://docs.runpod.io/serverless/endpoints/send-requests (`webhook` field; "return 200"; retries 2×/10s)
- RunPod Job States — https://docs.runpod.io/serverless/endpoints/job-states (IN_QUEUE/IN_PROGRESS/COMPLETED/FAILED/CANCELLED/TIMED_OUT; terminal set)

### Secondary (MEDIUM confidence)
- Vercel cron auth via `CRON_SECRET` + `Authorization: Bearer` — multiple corroborating sources (techulus, codingcat.dev) + Vercel KB
- RunPod webhook payload shape `{id, status, output, delayTime, executionTime, input, webhook}` — community worker docs (ashleykleynhans, jags111) corroborating

### Tertiary (LOW confidence)
- RunPod `/cancel/{id}` exact response body — endpoint path verified; response JSON not quoted in docs (treat status→CANCELLED as the contract)

## Metadata
**Confidence breakdown:**
- Standard stack (no new deps): HIGH — verified against package.json + existing slices
- Architecture (chunked cron dispatcher + webhook + reconcile): HIGH — mirrors shipped inspection slice; Vercel/RunPod specifics doc-verified
- Schema migration: HIGH — read against live schema; only additive fields
- Pitfalls: HIGH — webhook-header (A1) and Pro-plan (A3) are the two MEDIUM items flagged

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (RunPod/Vercel are moderately fast-moving; re-verify webhook-header + plan limits before execution)
