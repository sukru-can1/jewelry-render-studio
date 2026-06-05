# Pitfalls Research

**Domain:** Internal multi-user batch GPU render orchestration (Next.js 15 / Vercel + Prisma/Postgres + RunPod/Blender + Vercel Blob)
**Researched:** 2026-06-05
**Confidence:** HIGH (verified against Prisma, RunPod, and Vercel docs; cross-referenced existing `.planning/codebase/CONCERNS.md`)

> This file **extends** `.planning/codebase/CONCERNS.md`. CONCERNS catalogs existing debt in the current code. This file catalogs the *new* mistakes the team is likely to introduce while adding auth+RBAC, Prisma+Postgres, the batch matrix, RunPod async orchestration, and compositing. Where a new pitfall interacts with an existing concern, it is cross-referenced (e.g. "see CONCERNS: Public Blob").

## Critical Pitfalls

### Pitfall 1: Combinatorial batch explosion (the matrix fans out to hundreds of GPU jobs)

**What goes wrong:**
The job builder multiplies *camera angles × metals × stone-types-per-group × passes*. With the seeded defaults that is already large: 4 views × 3 metals × (1 full + alloycolour + diamond + stone2 + stone3 = 5 passes) = **60 renders per product per stone selection**. Let an operator pick 6 stone types for the diamond group and 4 for stone2 and the builder silently generates 4 × 3 × 6 × 4 × 5 ≈ **1,440 GPU jobs** from one screen. At ultra quality (2048–4096 samples) each render is minutes of GPU time; a single careless submission can burn hundreds of dollars and saturate the RunPod endpoint for hours.

**Why it happens:**
The matrix UX makes selecting "all of everything" a single click. There is no cost/count estimate, no cap, and no confirmation gate. The legacy Flask app encoded the *logic* but a human ran it deliberately one product at a time; the new UI removes that natural throttle.

**How to avoid:**
- Compute and display the **exact job count + estimated GPU-minutes + estimated cost** live as selections change, *before* submit.
- Hard cap per-batch job count (e.g. configurable Admin limit, default ~200) and require an explicit "I understand this is N jobs" confirmation above a soft threshold.
- Default new batches to **preview quality (64 samples)**; require an explicit step-up to high/ultra.
- Persist the full matrix definition (selections) as one `Batch` row and generate `Job` rows lazily/transactionally so a half-built batch can't leak orphan jobs.
- Enforce concurrency at the RunPod endpoint (max workers / max concurrent) so even a runaway batch queues rather than spending in parallel — see Pitfall 5.

**Warning signs:**
Batches with 3-digit job counts in normal use; RunPod bill spikes; operators waiting hours for "one product"; the builder has no visible count.

**Phase to address:** Batch/Job Builder phase (matrix + estimate + caps). Cost guardrail design must precede first real submission.

---

### Pitfall 2: Prisma connection-pool exhaustion on Vercel serverless

**What goes wrong:**
Each Vercel function invocation (and each concurrent invocation of the same route) instantiates its own `PrismaClient`, each opening its own pool of direct Postgres connections. Polling routes called by every open browser tab, multiplied by Vercel's per-invocation isolation, exhausts Postgres' connection limit fast (Neon/Supabase free-tier direct limits are low). Symptoms: `P2024: Timed out fetching a new connection from the connection pool` and Postgres `too many connections for role`. With the existing N+1 polling pattern (see CONCERNS: Blob-as-database N+1) ported naively onto Prisma, this triggers at very modest concurrency.

**Why it happens:**
Default Next.js patterns create a new client per module reload (dev HMR) or per cold start; developers connect Prisma to the *direct* (port 5432) database URL instead of a pooled endpoint; default `connection_limit` is `num_cpus * 2 + 1` per instance, which is far too high when there are dozens of instances.

**How to avoid:**
- Use the **singleton PrismaClient pattern** (instantiate once on `globalThis`, reuse across warm invocations).
- Connect through a **pooler**: Prisma Accelerate, the Neon pooled connection string, or PgBouncer/Supabase in **transaction mode (port 6543)**. Keep the direct URL only for migrations (`directUrl` in `schema.prisma`).
- Set `connection_limit=1` (or low) on the serverless connection string and let the pooler fan out.
- Never run `prisma migrate` against the pooled URL in transaction mode — it breaks on prepared statements; use `directUrl`.

**Warning signs:**
`P2024` timeouts under light load; intermittent 500s on DB routes that vanish on retry; Postgres connection-count graph climbing with tab count.

**Phase to address:** Persistence/Prisma foundation phase — the very first DB phase. Choosing the pooled connection topology is a day-one decision, expensive to retrofit.

---

### Pitfall 3: Migrating off public-Blob job-state loses (or corrupts) history

**What goes wrong:**
Job state currently lives as public Blob JSON under `app-state/render-jobs/<uuid>.json` (see CONCERNS: Public Blob + race conditions). Cutting over to Postgres naively — "new jobs go to DB, old ones stay in Blob" — produces a split-brain where the gallery/list shows only half of history, or a one-shot import script drops jobs (the 1000-item `list()` cap, see CONCERNS, silently truncates >1000 jobs). Worse, status values are inconsistent (`"queued"` vs `"COMPLETED"`, see CONCERNS: no enum), so a careless import maps them wrong and breaks polling filters.

**Why it happens:**
The migration is treated as an afterthought to the schema work. The Blob "list" cap and mixed-case status strings aren't accounted for. There's no reconciliation pass to confirm DB count == Blob count.

**How to avoid:**
- Write an explicit, **idempotent backfill** that paginates Blob with the **cursor** (not the 1000 cap) and upserts by job id, normalizing status into the new Prisma enum.
- Run backfill in a **dual-read window**: read from DB, fall back to Blob for any id not yet imported, until counts reconcile; then flip off the Blob fallback.
- Treat the existing Blob job JSON as immutable source-of-truth during migration; never delete until DB count is verified equal and spot-checked.
- Define the `JobStatus` Prisma enum up front and map every legacy string to it explicitly (fail loudly on unknown values).

**Warning signs:**
Gallery shows fewer jobs after cutover than before; "missing" historical batches; status filters returning empty.

**Phase to address:** Persistence/Prisma phase (schema + enum + backfill script), with a dedicated migration/cutover step before the old Blob path is removed.

---

### Pitfall 4: RunPod retries are not idempotent — duplicate renders, double billing, lost results

**What goes wrong:**
RunPod requeues failed/timed-out jobs **re-using the same job ID and original input**, and the project wants app-level retry up to ~2×. If app-level retry submits a *new* RunPod request without a dedup key, a transient timeout produces two live GPU renders for one logical job, double-billing and racing two results into the same output path. Conversely, if a webhook/poll marks a job COMPLETED but the result-write to Blob/DB fails, a retry can overwrite a good render with nothing.

**Why it happens:**
Retry is bolted on as "submit again on failure" without a stable idempotency key linking the logical `Job` row to the RunPod request, and without distinguishing "render failed" from "result-handling failed."

**How to avoid:**
- Give every logical `Job` a stable app-side id; store the RunPod request id on it. On retry, **first check RunPod `/status` for the existing request id** before submitting a new one — only resubmit if truly terminal/failed.
- Make result handling idempotent: write outputs to **deterministic, job-id-derived paths** (no `Math.random()`/`Date.now()` in output naming — see CONCERNS: non-reproducible recipes) and upsert results by job id.
- Cap retries in the DB (`retryCount`) so a poison job can't loop; surface FAILED after the cap instead of silently retrying forever.
- Separate state: `RENDER_FAILED` vs `RESULT_PERSIST_FAILED` so retry does the right thing for each.

**Warning signs:**
Two renders with different RunPod ids for one logical job; GPU minutes ~2× the job count; results occasionally reverting to blank/older images; retry counters that never settle.

**Phase to address:** Orchestration/RunPod phase (status tracking + retry + result persistence).

---

### Pitfall 5: Vercel 60s function limit + per-poll fan-out = timeouts under load

**What goes wrong:**
The existing `GET /api/render-jobs` does 1 list + N Blob fetches + up to N RunPod calls + up to N writes per poll, all inside the 60s Vercel cap (see CONCERNS: N+1). Porting this shape onto Postgres+RunPod and then fanning a batch into hundreds of jobs guarantees the status route exceeds 60s and returns 504/partial data. Submitting a large batch synchronously inside one request also blows the limit.

**Why it happens:**
The polling endpoint conflates *listing* (cheap DB query) with *status refresh* (expensive external RunPod calls), and batch submission is done inline instead of enqueued.

**How to avoid:**
- **Separate listing from refresh.** List reads only from Postgres (fast, paginated). A separate, bounded refresh updates only non-terminal jobs and only a capped batch per call.
- Prefer **RunPod webhooks** over polling: pass a webhook URL on submit; RunPod POSTs the completed payload to an authenticated callback route that updates the DB. This collapses N status polls to ~0.
- Never refresh terminal jobs (COMPLETED/FAILED/CANCELLED) — read them straight from DB.
- Submit batches by **enqueuing job rows** and dispatching to RunPod from a queue/cron/background worker, not in the user's request.
- If any genuinely long op is unavoidable, raise `maxDuration` (Vercel Fluid/Pro allows longer than 60s) — but treat that as a smell, not a fix.

**Warning signs:**
504s on the jobs list as job count grows; poll latency rising linearly with job count; RunPod rate-limit errors during polls.

**Phase to address:** Orchestration phase (webhook callback + listing/refresh split); revisited in Gallery/polling phase.

---

### Pitfall 6: Auth/RBAC added late, applied per-route, with gaps

**What goes wrong:**
Auth is retrofitted route-by-route onto six currently-open endpoints (see CONCERNS: no auth). One route gets missed (e.g. the Blob upload-token route, or a new webhook callback), leaving an unauthenticated hole that still burns GPU credits or leaks recipes. RBAC degenerates into scattered `if (role === 'admin')` checks that are easy to forget on new endpoints, so Operators can hit Admin-only mutations (editing seeded angle/metal/quality config).

**Why it happens:**
Auth is treated as a feature on the same footing as others rather than a cross-cutting gate; middleware coverage is assumed but not enforced; the RunPod **webhook callback** is forgotten because it's not browser-facing.

**How to avoid:**
- Enforce auth in **`middleware.ts` with a deny-by-default matcher** covering all `/api/*` and app routes; explicitly allowlist only the login and webhook routes.
- Authenticate the **webhook callback with a shared secret / signature**, not a user session (it's machine-to-machine).
- Centralize RBAC in a single `requireRole()` helper used by every mutating route + server action; don't inline role checks.
- Gate Admin-only config mutations (angles/metals/quality presets) behind that helper and test an Operator session is rejected.
- Rotate the **exposed `RUNPOD_API_KEY`** (and `BLOB_READ_WRITE_TOKEN`, `VERCEL_OIDC_TOKEN`) *before* any auth work ships — it was pasted in chat (see CONCERNS: exposed credentials). Auth on routes is moot if the underlying RunPod key is already public.

**Warning signs:**
A route with no `requireSession`/`requireRole`; an Operator able to edit seed config; the webhook route reachable unauthenticated; the old RunPod key still active.

**Phase to address:** Auth/RBAC phase (foundation, early). **Key rotation is a pre-phase prerequisite** — do it first, independent of feature work.

---

### Pitfall 7: Output assets stay public; recipes/results readable by URL

**What goes wrong:**
Auth gets added to API routes but Blob stays `access: "public"` (hardcoded — see CONCERNS: public Blob). Render outputs, full recipes (lighting/material/camera IP), model files, and material inventories remain readable by anyone who has or guesses a URL, bypassing the new auth entirely. For an internal catalog tool this leaks unreleased product imagery and proprietary render know-how.

**Why it happens:**
"We added auth" feels complete; Blob access is a separate setting that's easy to leave at the existing public default, and switching to private requires reworking how the gallery displays images (signed URLs).

**How to avoid:**
- Switch new writes to **private Blob** and serve images via **short-lived signed URLs** generated only in authenticated sessions.
- Validate caller identity inside `onBeforeGenerateToken` of the upload route before issuing an upload token (see CONCERNS: open upload endpoint).
- Plan the gallery/compositing UI around signed-URL fetching from the start (canvas/`<img>` need fresh URLs; long-cached signed URLs expire mid-session).
- Decide a policy for already-public legacy blobs (re-upload as private, or accept they're burned and rotate paths).

**Warning signs:**
Output/recipe URLs load in an incognito window with no login; `access: "public"` still in the submit path; gallery images use raw permanent Blob URLs.

**Phase to address:** Auth/security phase for the switch + token guard; Gallery/Compositing phase must consume signed URLs.

---

### Pitfall 8: Layer compositing assumes pixel-aligned, correctly-masked passes

**What goes wrong:**
In-browser layer stacking (metal JPEG + per-group transparent PNGs) and the server-side auto-flatten assume every pass is the same resolution, same camera, and has clean alpha holdouts. If any pass renders at a different size, or a holdout leaks (stone visible in the metal pass, or metal bleeding into a stone PNG), composites show double-exposed edges, halos, or missing layers. Name-based holdout selection inherits the same fragility as material matching: a renamed object (see CONCERNS: object_signature) silently drops out of its pass, so the stone layer is empty and the flatten looks "fine" but is wrong.

**Why it happens:**
Compositing trusts the render worker's outputs without validating dimensions/alpha; holdout correctness depends on the fragile name matcher; failures are visual-only and pass automated checks.

**How to avoid:**
- Validate at composite time: **all layers of a variant share identical dimensions**; reject/flag mismatches.
- Verify each transparent pass actually has non-trivial alpha coverage in the expected region (empty stone PNG = warning, not silent flatten).
- Log unmatched objects at WARNING during holdout assignment; offer a strict mode that fails a job with unmatched required groups (ties into the object-group assignment UX).
- Keep all passes of one variant on a single deterministic resolution from the recipe; don't let quality presets change dimensions per pass.
- Guard against the magenta-missing-texture failure (see CONCERNS) before it reaches the flatten.

**Warning signs:**
Halos/double edges at layer boundaries; an "empty" stone layer; flattened deliverable missing a stone; composites that look off only on certain models (renamed objects).

**Phase to address:** Compositing/Deliverable phase; depends on object-group assignment + render-worker output contract.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep job-state in Blob, add DB only for users | Less migration work now | Race conditions persist (see CONCERNS); split-brain history; two sources of truth | Never — job state is the core relational data this milestone exists to fix |
| Direct (5432) Postgres URL from serverless | Works in dev immediately | Pool exhaustion in prod (Pitfall 2); painful to retrofit topology | Local dev only; never the Vercel runtime URL |
| Poll RunPod from the list route (port existing N+1) | No webhook plumbing | 60s timeouts, RunPod rate limits at scale (Pitfall 5) | Tiny demo only; replace with webhooks before real batches |
| Submit whole batch synchronously in the request | Simple code path | Blows 60s on large matrices; partial submits/orphans | Only with a hard small cap; enqueue for anything real |
| Inline `if (role==='admin')` per route | Fast to write | RBAC gaps on new routes; Operators reach Admin mutations | Never — use one `requireRole()` helper |
| Leave Blob `access: public`, gate only routes | Gallery "just works" with raw URLs | All recipes/outputs leak by URL (Pitfall 7) | Never for this internal/IP-sensitive tool |
| No per-batch cost estimate/cap | Faster builder UI | Runaway GPU spend in one click (Pitfall 1) | Never — estimate is cheap, overspend is not |
| `Math.random()`/`Date.now()` in output/recipe naming | Quick uniqueness | Non-idempotent retries, can't reproduce a run (see CONCERNS) | Never for anything persisted or retried |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Prisma + Vercel | New `PrismaClient` per request / direct DB URL | `globalThis` singleton; pooled URL (Accelerate/Neon pooler/PgBouncer txn mode); `directUrl` only for migrations |
| RunPod async | Re-submit on every failure without checking existing request | Check `/status` for stored request id first; only resubmit if terminal-failed; cap `retryCount` |
| RunPod status | Poll all jobs every tick (including terminal) | Webhook callback updates DB on completion; never refresh terminal jobs; read those from Postgres |
| Vercel Blob | Leave `access: public`; raw permanent URLs in UI | Private blob + short-lived signed URLs in authenticated sessions; auth the upload-token route |
| Vercel functions | Long batch submit / heavy poll inline | Enqueue + background dispatch; split list (DB) from refresh; webhooks; raise `maxDuration` only as escape hatch |
| Auth.js webhook callback | Protected by user session middleware (breaks machine callback) | Allowlist webhook route in middleware; authenticate via shared secret/signature |
| Postgres migrations | `prisma migrate` against pooled (txn-mode) URL | Run migrations against `directUrl`; app traffic uses pooled URL |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 status poll (Blob/RunPod per job) | List latency grows with job count; 504s | Webhooks + DB-only listing; refresh non-terminal only | ~50+ in-flight jobs within 60s wall clock |
| Connection-pool exhaustion | `P2024`, `too many connections` | Pooler + singleton + `connection_limit=1` | Dozens of concurrent invocations / tabs |
| Combinatorial batch | Hundreds of jobs from one submit; GPU bill spike | Live count/cost estimate + hard cap + preview default | First time someone selects "all" across groups |
| Blob `list()` 1000 cap | History silently truncated past 1000 | Cursor pagination; archive terminal jobs; migrate to DB | >1000 lifetime jobs (one busy week of sweeps) |
| Pixel-loop postprocess (existing) | Seconds/render of billed CPU (see CONCERNS) | Vectorize with numpy/PIL | Every render; worse at higher res |
| Unbounded RunPod concurrency | Parallel GPU spend, rate limits | Set endpoint max workers/concurrency as cost cap (~20% over expected) | Any large batch dispatched at once |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Not rotating the chat-exposed RunPod key | Anyone can burn GPU credits / run arbitrary renders | Rotate `RUNPOD_API_KEY` first, before feature work; also `BLOB_READ_WRITE_TOKEN`, `VERCEL_OIDC_TOKEN` (see CONCERNS) |
| Auth on routes but Blob stays public | Recipes/outputs/models leak by URL despite login | Private Blob + signed URLs; auth upload-token issuance |
| Forgetting the webhook callback in auth | Unauthenticated endpoint mutates job state / triggers spend | Shared-secret/signature auth on callback; deny-by-default middleware |
| Scattered inline role checks | Operators reach Admin config mutations | Single `requireRole()` gate on all mutations |
| Allow-any-content-type upload token (existing) | Arbitrary writes to Blob store | Validate caller + restrict content types in `onBeforeGenerateToken` |
| Committing/regenerating `.env` with live values | Re-leak after rotation | `.gitignore` verified + pre-commit secret scanner (git-secrets/detect-secrets) |
| Trusting RunPod webhook payload blindly | Spoofed completion / result poisoning | Verify shared secret/signature; only accept status transitions for known job ids |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No job-count/cost estimate before submit | Operator accidentally launches 1000+ renders | Live count + GPU-minutes + cost, confirmation above threshold |
| Default quality = ultra | Slow, expensive previews for routine work | Default preview (64); explicit step-up to high/ultra |
| Polling-only status with no per-job detail | "Is it stuck or working?" confusion; tab spam | Webhook-driven live status; clear queued/running/failed/retrying states |
| Silent material/holdout mismatch on rename | "Correct-looking" but wrong renders/empty layers | Surface unmatched objects in the assignment UI; strict mode option |
| Signed URLs expiring mid-session | Gallery images break after a few minutes | Refresh signed URLs on demand; don't cache them long |

## "Looks Done But Isn't" Checklist

- [ ] **Auth:** Often missing the webhook callback + Blob upload route — verify *every* `/api/*` is covered by deny-by-default middleware and the RunPod key is rotated.
- [ ] **RBAC:** Often missing on new mutating routes — verify an Operator session is *rejected* from Admin config edits.
- [ ] **Blob privacy:** Often left public — verify output/recipe URLs 404 (or 403) in an unauthenticated/incognito session.
- [ ] **Prisma on Vercel:** Often uses direct URL — verify pooled connection string + singleton + migrations run on `directUrl`.
- [ ] **Batch builder:** Often missing guardrails — verify count/cost estimate, hard cap, and confirmation exist.
- [ ] **Retry:** Often non-idempotent — verify retry checks existing RunPod request id and caps `retryCount`; outputs use deterministic paths.
- [ ] **History migration:** Often truncated — verify DB job count == Blob job count (cursor-paginated) after backfill.
- [ ] **Compositing:** Often assumes alignment — verify dimension + alpha-coverage checks; empty layer warns instead of silently flattening.
- [ ] **Status route:** Often still N+1 — verify listing reads only Postgres and never refreshes terminal jobs.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Runaway batch already submitted | MEDIUM | Cancel non-terminal RunPod jobs by stored request id; mark Jobs CANCELLED; lower endpoint max concurrency; add the cap that was missing |
| Pool exhaustion in prod | MEDIUM | Switch to pooled URL + `connection_limit=1` + singleton; scale pooler; restart functions to drop leaked connections |
| Leaked public assets discovered | HIGH | Rotate Blob token; re-upload sensitive assets as private under new paths; invalidate old URLs; audit access |
| Exposed RunPod key abused | HIGH | Rotate immediately; review RunPod usage/billing for unauthorized jobs; set spend/concurrency caps |
| Duplicate/double-billed renders | MEDIUM | Dedup by job id; reconcile RunPod request ids to Job rows; add idempotency check to retry path |
| Truncated history after migration | LOW–MEDIUM | Re-run cursor-paginated backfill (idempotent upsert); reconcile counts; keep Blob until verified |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Exposed RunPod/Blob keys | Pre-phase prerequisite (rotate first) | Old key rejected by RunPod; new keys only in Vercel env, not in tree |
| Auth/RBAC gaps | Auth/RBAC foundation (early) | Every `/api/*` denies anon; Operator rejected from Admin routes |
| Public Blob assets | Auth/security phase | Incognito 403/404 on output+recipe URLs |
| Prisma pool exhaustion | Persistence/Prisma foundation | Load test holds steady; no `P2024`; pooled URL in use |
| History migration loss | Persistence/Prisma (migration step) | DB count == cursor-paginated Blob count; statuses mapped to enum |
| Combinatorial explosion | Batch/Job Builder | Builder shows count+cost; cap + confirmation enforced |
| RunPod retry non-idempotency | Orchestration/RunPod | Retry reuses request id; `retryCount` capped; no duplicate GPU jobs |
| 60s timeout / N+1 polling | Orchestration + Gallery | Listing is DB-only; webhook updates status; no terminal-job refresh |
| Compositing misalignment/holdout | Compositing/Deliverable | Dimension+alpha checks pass; empty layer warns; renamed object flagged |

## Sources

- [Prisma — Database connections (serverless, pool size)](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections) — HIGH
- [Prisma — Connection pooling (Accelerate / pooler)](https://www.prisma.io/docs/postgres/database/connection-pooling) — HIGH
- [Prisma — Connection management](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management) — HIGH
- [Supabase — Prisma troubleshooting (transaction mode port 6543, directUrl)](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting) — HIGH
- [Vercel Community — Connection pool timeout with Prisma + Vercel Postgres](https://community.vercel.com/t/connection-pool-timeout-with-prisma-and-vercel-postgres/475) — MEDIUM
- [RunPod — Endpoint configurations (max workers, concurrency, cost cap)](https://docs.runpod.io/serverless/endpoints/endpoint-configurations) — HIGH
- [RunPod — Concurrent handlers](https://docs.runpod.io/serverless/workers/handlers/handler-concurrency) — HIGH
- `.planning/codebase/CONCERNS.md` (existing-debt audit, 2026-06-05) — HIGH
- `.planning/PROJECT.md` (seeded matrix: 4 views × 3 metals × 5 passes, quality presets, retry ≤2) — HIGH

---
*Pitfalls research for: batch GPU render orchestration on Next.js/Vercel + Prisma + RunPod + Blob*
*Researched: 2026-06-05*
