# Feature Research

**Domain:** Enterprise internal cloud jewelry-rendering / catalog-image production tool (multi-user, RBAC, batch render matrix, layered compositing)
**Researched:** 2026-06-05
**Confidence:** HIGH (grounded in established render-farm managers — AWS Thinkbox/Deadline Cloud — DAM/PIM catalog tooling, and 3D product-render pipeline practice; mapped directly to the user's Active requirements and the existing recipe/holdout-pass codebase)

## Feature Landscape

The tool sits at the intersection of four established product categories. Each contributes a well-understood feature baseline:

1. **Render-farm / job managers** (Deadline, Deadline Cloud, RenderPal) → job/task hierarchy, queue, priority, retry limits, per-task logs, dependencies.
2. **3D product-render pipelines / configurator backends** → variant matrix (angle × colorway × material), material/preset libraries, batch permutation rendering.
3. **DAM / PIM catalog tooling** → asset organization, metadata, versioning, approval workflow, roles/permissions, batch operations.
4. **Layered compositing tools** → holdout/separate passes, layer stacking, flatten-to-deliverable.

The user's existing pipeline already supplies the *render engine* (RunPod + Blender + recipe JSON + holdout passes). This milestone adds the *management surface* around it. So "table stakes" below means: the minimum management features that make these four categories usable by operators — not a re-derivation of the render engine.

### Table Stakes (Users Expect These)

Missing any of these makes the tool feel broken to an operator coming from Deadline, a DAM, or the legacy Flask tool.

| Feature | Why Expected | Complexity | Notes / Maps to Requirement |
|---------|--------------|------------|------------------------------|
| **Auth + login (no anonymous access)** | Every internal enterprise tool gates access; current public Blob exposure is a known concern | LOW | Maps to "Authentication for the internal team". JWT in HTTP-only cookies per workspace convention. Foundational — almost everything else depends on it. |
| **At least Admin + Operator roles (RBAC)** | DAM/render managers universally distinguish who can *configure the system* (presets, users, domain settings) from who *runs jobs* | LOW–MEDIUM | Maps to "Role-based access — Admin and Operator". Admin edits seeded domain settings + manages users; Operator runs the product→batch→gallery flow. |
| **Persistent, queryable job/batch records (DB)** | Render managers track every job's state, history, owner, timestamps; Blob-JSON listing can't do this reliably (race conditions, no relational queries) | MEDIUM | Maps to "Postgres + Prisma persistence". Replaces public-Blob job-state. The schema (users/projects/products/group-assignments/batches/jobs/history) is the backbone the rest hangs off. |
| **Product workspace: upload model → inspect materials → assign objects to groups** | The pipeline's name-substring matching is fragile; operators must see detected objects and bind them to alloycolour/diamond/stone2/stone3 explicitly | MEDIUM | Maps to "Product workspace". Reuses existing `inspect_materials` operation; the new part is the *assignment UI* and saving it to DB. Gateway to batch building — a batch can't be built until groups are assigned. |
| **Batch / job-matrix builder (angles × metals × per-group stones × passes)** | This is the core value; render managers and configurator backends all let you fan out one base over a permutation set in one action | HIGH | Maps to "Render-job builder (batch matrix)". Must show a live count of resulting jobs ("4 views × 3 metals × N passes = X renders") before submit — standard render-manager UX. Reuses `lib/enterprise-recipes.ts` deterministic recipe-per-combo builder. |
| **Job queue with status tracking** | Operators expect to see queued / submitted / in-progress / completed / failed at a glance; Deadline's monitor is the reference UX | MEDIUM | Maps to "Job orchestration with status tracking". The RunPod status states (`IN_QUEUE`/`IN_PROGRESS`/`COMPLETED`/`FAILED`) already exist; this surfaces them per-job in a list/grid grouped by batch. |
| **Failure surfacing + retry (≤2×)** | Render-farm managers always show *why* a task failed (logs) and allow requeue; renders fail often (GPU OOM, bad mesh) | MEDIUM | Maps to "failure surfacing and retry (up to ~2×)". Legacy tool already caps retry ≤2. Surface Blender stderr (already captured in `handler.py`) per failed job. Auto-retry transient failures, manual retry button for the rest. |
| **Outputs gallery (browse by product/metal/angle/pass)** | Any catalog-image tool must let operators see and download what was produced, organized along the same axes they batched on | MEDIUM | Maps to "Outputs gallery". Group by the matrix dimensions. Per-layer preview + download. Thumbnails + full-res download. |
| **Layered holdout output (metal JPEG + per-stone transparent PNG)** | This is the deliverable structure the rendering team actually uses; compositing is impossible without separated layers | MEDIUM | Maps to "Layered holdout passes". The holdout/group-pass concept already exists (`full`/`metal`/`stone` passes from the legacy Flask logic). This formalizes it as alloycolour=JPEG + diamond/stone2/stone3 = transparent PNG. |
| **Seeded, Admin-editable domain settings** | The 4 views / 3 metals / 4 groups / quality presets / 1920×1920 are hard-won real settings; operators expect sensible defaults, Admins expect to tune them | LOW–MEDIUM | Maps to "Seed the domain with the rendering team's actual settings". Seed via Prisma; expose an Admin settings screen. Don't hardcode — make them rows. |
| **Quality presets (preview/medium/high/ultra)** | Operators iterate cheaply (preview 64 samples) then commit (ultra); every render tool offers quality tiers | LOW | Part of seeded settings. Preview for matrix dry-runs, ultra for final. Drives sample count in the recipe. |
| **Per-job / per-batch metadata + history (who, when, settings)** | DAM and render managers keep an audit trail; "who ran this batch and with what settings" is a constant operator question | LOW–MEDIUM | Falls out of the DB schema. Cheap once persistence exists; valuable for reproducing/debugging a batch. |

### Differentiators (Competitive Advantage)

Features that make *this* tool better than wiring Deadline + a DAM together, or better than the legacy Flask tool. These align with the Core Value: "produce the full catalog set, in separated layers, without touching Blender."

| Feature | Value Proposition | Complexity | Notes / Maps to Requirement |
|---------|-------------------|------------|------------------------------|
| **In-browser layer compositing / preview (toggle layers)** | Operators *see* the assembled variant — stack metal + stone PNGs, toggle each layer — before committing, instead of opening Photoshop | MEDIUM–HIGH | Maps to "In-app layer compositing/preview". Canvas/CSS layer stacking of the holdout PNGs. Generic render farms don't do this; it's domain-specific value. Depends on layered holdout output existing first. |
| **Server-side auto-flattened catalog-ready deliverable** | The tool outputs a *finished* image per variant, not just raw layers to hand off — closes the last mile competitors leave to the operator | MEDIUM | Maps to "Server-side auto-flattened deliverable". Reuses the existing Pillow `postprocess.py` compositing primitives. The differentiator vs. a render farm: it produces catalog-ready output, not just frames. |
| **Per-group stone-type selection in the matrix** | Jewelry-specific: diamond=center vs stone2/stone3=sides each get their own gemstone catalog (cut × size × quality), fanned out independently | MEDIUM | Maps to the stone-types-per-group dimension of the builder. Directly lifts the legacy stone catalog (ROUND/OVAL/...; quality grades → `ruby_aaaa`). This is what makes it a *jewelry* tool, not a generic product renderer. |
| **Deterministic, reproducible recipe generation per variant** | Same inputs → same recipe → same image; an operator (or auditor) can always reproduce a catalog render | LOW (exists) | Already built (`lib/enterprise-recipes.ts`). Surfacing this as a guarantee ("re-render this exact variant") is a differentiator over manual Blender workflows. |
| **Domain knowledge encoded as defaults** | The 4 real camera views, 3 real metal mappings, and quality/sample tiers come pre-loaded — a new operator is productive immediately | LOW | Maps to seeded settings. Competitors ship empty; this ships with the rendering team's encoded know-how. |
| **Live batch progress with per-dimension grouping** | See a batch as a matrix grid (rows = metals, cols = angles, cells = pass status) rather than a flat job list — instantly spot which cell failed | MEDIUM | Enhances the queue/gallery. A jewelry-matrix-shaped progress view is more legible than Deadline's flat task list for this use case. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem reasonable but would blow scope or duplicate the proven pipeline. Explicitly do **not** build these this milestone.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Multi-tenant / external-client SaaS (orgs, per-tenant isolation)** | "We might sell this / onboard external clients" | Tenancy isolation, billing, per-tenant data partitioning are a huge cross-cutting cost; the users are one internal team | Internal single-tenant (explicitly Out of Scope in PROJECT.md). Revisit only if external clients are real. |
| **Rebuilding the Blender render worker / recipe format** | "Let's clean up / rewrite the renderer while we're here" | The pipeline is proven and is the crown jewel; rewriting risks regressing diamond fire, materials, holdout logic | Reuse the existing RunPod + Blender + recipe engine untouched (PROJECT.md decision). Only the management layer is new. |
| **In-browser 3D model editing / re-meshing / material authoring** | "Let operators fix bad meshes or tweak materials in the UI" | This is a full 3D DCC tool (Blender's job); enormous surface, not the operator's role | Inspect + group-assign only. Material *presets* live in recipes; mesh fixes happen upstream in Blender by a modeler. |
| **Building our own render scheduler / GPU autoscaler** | "Control GPU allocation, spot pricing, worker pools like Deadline does" | RunPod already provides serverless GPU queueing/scaling; rebuilding it is a multi-quarter project | Submit to RunPod and poll status (existing pattern). Treat RunPod as the scheduler. Add only app-level priority/retry on top. |
| **Real-time WebSocket live render streaming / collaborative cursors** | "See renders update live, see who else is editing" | Renders take minutes; polling is sufficient. Real-time infra (sockets, presence) adds ops burden for little value | Status polling (existing pattern), Vercel 60s function cap keeps work async on RunPod. Refresh on GET. |
| **Full DAM: tagging taxonomies, rights management, CDN distribution, public share links** | "It stores images, make it a real DAM" | DAM is its own product category; rights/sharing/taxonomy is scope creep beyond catalog production | Outputs gallery organized by the matrix axes is enough. If a true DAM is needed later, export deliverables *to* an existing DAM. |
| **Multi-level approval / review chains (creator→editor→reviewer→approver)** | DAM workflow best-practice; "QA the catalog images" | Heavyweight workflow engine; this team produces, it doesn't run a publishing approval hierarchy yet | Simple status + history + retry is enough for v1. A lightweight "mark batch reviewed" flag can come later if QA demand emerges. |
| **Arbitrary per-job recipe hand-editing in the UI (the old Studio/Lab sandbox)** | Power users want to tweak any recipe field | Reintroduces the "touch Blender / hand-edit recipes" problem the product is meant to eliminate; widens the support surface | Keep the recipe sandbox as a separate internal/R&D surface, not the operator product. Operators work through the structured matrix builder. |

## Feature Dependencies

```
Auth + Login
    └──requires──> (nothing; foundational)

RBAC (Admin/Operator)
    └──requires──> Auth + Login

Postgres + Prisma persistence
    └──requires──> Auth (to own records by user)
        └──enables──> Seeded domain settings (settings are rows)
        └──enables──> Per-job/batch history + metadata

Product workspace (upload → inspect → assign groups)
    └──requires──> Persistence (to save group assignments)
    └──reuses────> existing inspect_materials operation

Batch / job-matrix builder
    └──requires──> Product workspace (groups must be assigned first)
    └──requires──> Seeded domain settings (angles/metals/quality come from here)
    └──reuses────> existing lib/enterprise-recipes.ts (recipe per combo)

Job queue + status tracking
    └──requires──> Batch builder (jobs come from batches)
    └──reuses────> existing RunPod submit/status pattern

Failure surfacing + retry (≤2)
    └──requires──> Job queue
    └──reuses────> existing handler.py stderr capture

Layered holdout output (metal JPEG + stone PNGs)
    └──requires──> Batch builder emitting per-pass jobs
    └──reuses────> existing full/metal/stone holdout pass concept

Outputs gallery
    └──requires──> Job queue (completed jobs) + layered output

In-browser layer compositing/preview
    └──requires──> Layered holdout output (needs separated PNGs)
    └──enhances──> Outputs gallery

Server-side auto-flattened deliverable
    └──requires──> Layered holdout output
    └──reuses────> existing Pillow postprocess.py compositing
```

### Dependency Notes

- **Everything requires Auth + Persistence first.** These are the foundation phase — no operator feature is safe to ship while routes are public and state lives in race-prone Blob JSON. This matches the known concerns in CONCERNS.md.
- **Batch builder requires the Product workspace.** A batch fans out *per stone group*, so groups must be assigned to the product before the matrix can offer per-group stone choices. Product workspace must come before (or with) the builder.
- **Batch builder requires seeded domain settings.** The angle/metal/quality dropdowns are populated from the seeded, Admin-editable settings. Seed settings early so the builder has real options.
- **Compositing and flatten both require layered holdout output.** You cannot stack or flatten layers that weren't rendered as separate passes. The holdout-pass output must be solid before the compositing/flatten features are built — they're downstream.
- **Compositing (in-browser, client) and flatten (server, Pillow) are complementary, not redundant.** In-browser is for *operator preview/decision* (toggle layers, instant); server flatten is for the *final deliverable* (consistent, high-quality, automated). Build the cheaper server flatten first if forced to choose; it produces the actual deliverable.
- **No conflicts between core features** — the main tension is anti-feature creep (recipe sandbox vs. structured builder). Keep the sandbox out of the operator product.

## MVP Definition

### Launch With (v1)

The minimum that lets an operator take one model to a full catalog set, safely.

- [ ] **Auth + login** — without it the tool can't be internal/secure; blocks everything
- [ ] **Admin/Operator RBAC** — minimum separation of system-config vs. operation
- [ ] **Postgres + Prisma persistence** — durable, queryable records replace public Blob state
- [ ] **Seeded, Admin-editable domain settings** — real 4 views / 3 metals / 4 groups / quality presets / 1920×1920
- [ ] **Product workspace (upload → inspect → assign groups)** — the entry point; reuses existing inspection
- [ ] **Batch / job-matrix builder** with live job-count preview — the core value
- [ ] **Job queue + status tracking + retry (≤2) + failure logs** — operators must see and recover failures
- [ ] **Layered holdout output (metal JPEG + per-stone transparent PNG)** — the deliverable structure
- [ ] **Outputs gallery** organized by product/metal/angle/pass — browse + download

### Add After Validation (v1.x)

Add once the core produce-the-catalog loop is proven in operator hands.

- [ ] **Server-side auto-flattened catalog-ready deliverable** — trigger: operators are still hand-flattening layers downstream
- [ ] **In-browser layer compositing / preview (toggle layers)** — trigger: operators need to QA assembled variants before download
- [ ] **Matrix-grid batch progress view** — trigger: flat job lists become hard to scan at real batch sizes
- [ ] **Per-group stone-type catalog (cut × size × quality) in the builder** — trigger: side-stone variants beyond a default are needed; lift the legacy stone catalog

### Future Consideration (v2+)

Defer until there's a proven, demanded need.

- [ ] **Lightweight "batch reviewed" QA flag** — defer until a QA step is actually requested
- [ ] **Export deliverables to an external DAM** — defer until catalog images need to leave this team's tool
- [ ] **Saved batch templates / re-run a previous batch** — defer; nice once operators repeat batch shapes
- [ ] **Notifications (email/Slack on batch complete/fail)** — defer; polling is fine while the team is small

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Auth + login | HIGH | LOW | P1 |
| Admin/Operator RBAC | HIGH | LOW–MEDIUM | P1 |
| Postgres + Prisma persistence | HIGH | MEDIUM | P1 |
| Seeded, Admin-editable domain settings | HIGH | LOW–MEDIUM | P1 |
| Product workspace (upload→inspect→assign groups) | HIGH | MEDIUM | P1 |
| Batch / job-matrix builder | HIGH | HIGH | P1 |
| Job queue + status tracking | HIGH | MEDIUM | P1 |
| Failure surfacing + retry (≤2) | HIGH | MEDIUM | P1 |
| Layered holdout output (metal JPEG + stone PNGs) | HIGH | MEDIUM | P1 |
| Outputs gallery | HIGH | MEDIUM | P1 |
| Server-side auto-flattened deliverable | HIGH | MEDIUM | P2 |
| In-browser layer compositing/preview | MEDIUM–HIGH | MEDIUM–HIGH | P2 |
| Per-group stone-type catalog in builder | MEDIUM | MEDIUM | P2 |
| Matrix-grid batch progress view | MEDIUM | MEDIUM | P2 |
| Per-batch history/audit (who/when/settings) | MEDIUM | LOW | P2 |
| Saved batch templates / re-run | MEDIUM | MEDIUM | P3 |
| Notifications on complete/fail | LOW–MEDIUM | LOW–MEDIUM | P3 |
| Multi-level approval workflow | LOW | HIGH | P3 (anti-feature for now) |
| External DAM export | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Render-farm manager (Deadline / Deadline Cloud) | DAM / PIM catalog tool | Our Approach |
|---------|--------------------------------------------------|------------------------|--------------|
| Batch / matrix submission | Job → tasks; frame chunking; one job per submission, plugin-driven | Bulk asset upload/edit/download | Domain-specific matrix builder: angles × metals × per-group stones × passes → one job per combo, with live count |
| Queue + priority | Priority 1–100, queue ordering, budgets | n/a (not a renderer) | RunPod is the scheduler; app surfaces status per batch. App-level retry/priority only |
| Failure handling | Requeue reports, job/task error limits, per-task logs | n/a | Surface Blender stderr per job; auto-retry transient, manual retry, cap ≤2 (matches legacy tool) |
| Asset organization | Job output folders | Metadata schemas, faceted search, versioning | Gallery grouped by product/metal/angle/pass; DB-backed records (no full DAM taxonomy) |
| Layered / pass output | Renders frames; passes via DCC setup, not the manager | n/a | First-class holdout passes: metal JPEG + per-stone transparent PNG (lifted from legacy Flask logic) |
| Compositing / flatten | Out of scope (handoff to comp tools) | Some derivative/transform generation | In-browser layer toggle + server-side Pillow auto-flatten to catalog-ready image (our differentiator) |
| Roles / permissions | Operator/admin/power-user pools | Creator/editor/reviewer/approver/publisher | Just Admin + Operator for v1; defer richer roles (anti-feature now) |
| Material / variant library | n/a | Finish/colour libraries for configurators | Seeded metals + recipe material presets + stone catalog (cut×size×quality) |

## Sources

- [AWS Thinkbox Deadline — Render Farm Manager](https://aws.amazon.com/thinkbox-deadline/) — job/task model, priority, queues, requeue, logs (HIGH)
- [Deadline — Controlling Jobs (10.4 docs)](https://docs.thinkboxsoftware.com/products/deadline/latest/1_User%20Manual/manual/job-controlling.html) — job/task error limits, requeue, dependencies (HIGH)
- [Deadline Cloud — Task chunking for job templates](https://docs.aws.amazon.com/deadline-cloud/latest/developerguide/build-job-bundle-chunking.html) — batch task grouping model (HIGH)
- [Deadline Cloud — FAQs](https://aws.amazon.com/deadline-cloud/faqs/) — priority 1–100, budgets, job submission/monitoring (HIGH)
- [Deadline Cloud — Troubleshooting](https://docs.aws.amazon.com/deadline-cloud/latest/userguide/troubleshooting.html) — per-task failure logs, monitor (HIGH)
- [A Playbook: 3D Product Rendering for Manufacturers — Industry Today](https://industrytoday.com/a-playbook-3d-product-rendering-for-manufacturers/) — variant matrices, finish libraries, batch permutations (MEDIUM)
- [Building Production-Ready 3D Pipelines with AWS VAMS — AWS](https://aws.amazon.com/blogs/physical-ai/building-production-ready-3d-pipelines-with-aws-visual-asset-management-system-vams-and-4d-pipeline/) — pipeline stages, batch render at scale, DAM handoff (MEDIUM)
- [What is Digital Asset Management (DAM)? — Sitecore](https://www.sitecore.com/solutions/topics/digital-asset-management/what-is-digital-asset-management) — metadata, versioning, permissions baseline (MEDIUM)
- [Digital Asset Management Workflow — IntelligenceBank](https://intelligencebank.com/insights/what-is-a-digital-asset-management-workflow/) — creator/editor/reviewer/approver roles, approval chains (MEDIUM)
- [DAM Workflows — ImageKit Blog](https://imagekit.io/blog/digital-asset-management-workflows/) — batch upload/edit, approval routing (MEDIUM)
- Project context: `.planning/PROJECT.md` (Active requirements, seeded domain settings) and `.planning/codebase/ARCHITECTURE.md` (existing recipe engine, holdout `full/metal/stone` passes, RunPod job flow) (HIGH)

---
*Feature research for: enterprise internal cloud jewelry-rendering / catalog-image production tool*
*Researched: 2026-06-05*
