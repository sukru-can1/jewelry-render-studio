# Jewelry Render Studio — Enterprise

## What This Is

An internal, enterprise-grade web application for Glamira's rendering team to turn 3D jewelry models into photorealistic catalog imagery at scale. Operators upload a product model, classify its parts into metal/stone groups, then build a render batch that fans out across camera angles, metal colors, gemstone types, and layered holdout passes. Jobs render on RunPod GPU workers using the existing Blender/Cycles recipe engine; the app organizes the layered outputs, composites them, and produces catalog-ready deliverables. It replaces the current open, single-purpose dashboard with a multi-user, role-based, database-backed product.

This is a **new product layer (UI + hardened backend) built on top of the existing, proven render pipeline** (RunPod + Blender + the JSON "recipe" system). The GPU/render engine is reused, not rebuilt.

## Core Value

An operator can take one jewelry model and reliably produce the full set of catalog images — every angle × metal × stone variant, in correctly separated metal/stone layers — without touching Blender or hand-editing recipes.

## Requirements

### Validated

<!-- Inferred from existing codebase (.planning/codebase/) — already working and being reused. -->

- ✓ RunPod serverless GPU rendering with Blender/Cycles — existing (`workers/runpod-blender/`)
- ✓ Recipe-driven scene description (camera, world, lights, materials, reflection cards, postprocess) merged over a DEFAULT_RECIPE — existing (`workers/runpod-blender/render_scene.py`)
- ✓ Multi-format model import (GLB/FBX/BLEND/OBJ/STL) — existing
- ✓ Material inspection operation (extract object names, material slots, BSDF values) — existing (`workers/runpod-blender/inspect_materials.py`)
- ✓ Name-based object→material mapping and `material_strategy` override/source/hybrid — existing
- ✓ Pillow post-processing passes (studio background, product/center-stone enhancement, facets, compositing primitives) — existing (`workers/runpod-blender/postprocess.py`)
- ✓ Vercel Blob client uploads for large model files — existing (`app/api/blob/upload/route.ts`)
- ✓ Deterministic per-variant recipe generation from metal/angle/pass inputs — existing (`lib/enterprise-recipes.ts`)

### Active

<!-- New scope for this milestone. Hypotheses until shipped and validated. -->

- [ ] Authentication for the internal team (login; no anonymous access to any route)
- [ ] Role-based access — at least Admin and Operator roles
- [ ] Postgres + Prisma persistence for users, projects, products, object-group assignments, batches, jobs, and history (replaces public-Blob job-state for structured data)
- [ ] Product workspace: upload model → run material inspection → operator assigns detected objects to groups (alloycolour / diamond / stone2 / stone3) → save assignment
- [ ] Render-job builder (batch matrix): operator selects multiple **camera angles**, multiple **metals**, **stone types per stone group**, and **layered passes**, producing one job per combination
- [ ] Seed the domain with the rendering team's actual settings: 4 camera views (view1/2/3/4), 3 metals (white/yellow/red), groups alloycolour+diamond+stone2+stone3, quality presets (preview/medium/high/ultra), 1920×1920 default — all editable by an Admin
- [ ] Layered holdout passes: metal-only pass (stones hidden) as JPEG + each stone group as its own transparent PNG (metal + other groups held out) for compositing
- [ ] Job orchestration on RunPod with status tracking, failure surfacing, and retry (up to ~2×)
- [ ] Outputs gallery: browse a batch's renders organized by product/metal/angle/pass; preview and download individual layers
- [ ] In-app layer compositing/preview: stack metal + stone PNG layers in-browser to preview the assembled variant (toggle layers)
- [ ] Server-side auto-flattened, catalog-ready deliverable image generated per variant
- [ ] New UI built with the `ui-ux-pro-max` skill — design language influenced by Vercel, Notion, and RunPod: functional, cutting-edge, NOT purple
- [ ] Remove hardcoded ring99 model URL and local fallback recipe path from API routes
- [ ] Deploy to the existing Vercel project `sukrus-projects-1b84f634/jewelry-render-studio`

### Out of Scope

- Multi-tenant / external-client SaaS (orgs, per-tenant isolation) — internal single-tenant only for this milestone; revisit if external clients are onboarded
- Rebuilding the Blender render worker or recipe format — the existing pipeline is proven and reused
- The legacy Flask renderer in `external-work/cloud-renderer-glmr/` — used only as a **requirements source** (domain settings + holdout logic), not migrated or run
- The local `scripts/` vNNN R&D toolbox — stays as offline tooling; not part of the product surface
- Public/unauthenticated access — explicitly removed
- Mobile-native app — web-first

## Context

- **Existing system** (see `.planning/codebase/`): Next.js 15 (App Router) + React 19 + TypeScript dashboard on Vercel; Vercel Blob for assets and job-state JSON; RunPod serverless GPU worker (Python) running Blender Cycles; Pillow post-processing. No database, no auth today; every API route is currently open. Job state lives as public Blob JSON under `app-state/render-jobs/`.
- **Render know-how source** — the legacy Flask app (`external-work/cloud-renderer-glmr/`) was built by a rendering employee and encodes the real catalog settings. Concrete values extracted to seed this project:
  - **Camera views (4):** view1 az30/el25/187.5mm, view2 az180/el15/187.5mm, view3 az−30/el10/50mm, view4 az0/el75/187.5mm; all f/2.8 (`models.py:215`).
  - **Metals (3):** white = White Gold/Platinum, yellow = 18K Yellow Gold, red = Rose Gold (`blender_scripts.py:16`).
  - **Groups / render modes:** alloycolour (metal), diamond (center), stone2, stone3 (sides); passes full / alloycolour (JPEG) / diamond / stone2 / stone3 (transparent PNG via holdout).
  - **Quality presets:** preview 64 / medium 256 / high 512 / ultra 2048–4096 samples; default 1920×1920; PNG/JPEG; job retry ≤2.
  - **Stones:** cut × size × quality catalog (ROUND/OVAL/HEART/PRINCESS/TRILLION/EMERALD at mm sizes; quality grades like AAAA → `ruby_aaaa`).
- **Workspace conventions** (CLAUDE.md): other Glamira projects use PostgreSQL + Prisma; deploy frontend/full-stack on Vercel, GPU on RunPod, JWT in HTTP-only cookies.
- **Known concerns to address** (`.planning/codebase/CONCERNS.md`): no auth, public Blob exposing recipes/results, no DB/race conditions in Blob job-state, hardcoded ring99 references, a nested git repo under `external-work/`, `transmission_bounces=16` (below the 48–64 ideal for diamond fire).

## Constraints

- **Tech stack**: Next.js 15 App Router + React 19 + TypeScript (keep). Add Postgres + Prisma for structured state. Keep Vercel Blob for binary assets (models, renders). Keep RunPod + Blender worker + recipe engine.
- **Hosting**: Vercel (web/API) + RunPod (GPU). Vercel functions cap at 60s — long renders stay async via RunPod with status polling/updates.
- **UI**: Built with the `ui-ux-pro-max` skill. Vercel/Notion/RunPod design influence; functional and cutting-edge; **no purple**.
- **Auth**: Internal team, accounts + roles (Admin, Operator), single tenant.
- **Domain fidelity**: Default angles/metals/groups/quality must match the rendering team's encoded settings (above), and remain editable by Admins.
- **Deploy target**: `sukrus-projects-1b84f634/jewelry-render-studio`.
- **Secrets**: No secrets committed; the previously-exposed RunPod key should be rotated.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Reuse render pipeline; rebuild UI + backend | Blender/RunPod/recipe engine is proven; product gaps are auth, persistence, and the job builder UX | — Pending |
| Internal single-tenant, accounts + roles | Users are the internal Glamira render team; no external clients yet | — Pending |
| Postgres + Prisma for structured state; Blob for binaries | Enterprise needs durable relational data (accounts/projects/batches/history); matches workspace convention; Blob unsuited for it | — Pending |
| Job builder exposes angles × metals × per-group stone types × layered passes | Direct lift of the Flask app's catalog matrix and holdout logic the rendering employee encoded | — Pending |
| Full output pipeline: gallery + compositing + auto-flattened deliverable | Operators should get catalog-ready images, not just raw layers to hand off | — Pending |
| Seed domain with Flask app's real settings (4 views, 3 metals, quality presets) | Preserve hard-won rendering know-how rather than inventing defaults | — Pending |
| UI via ui-ux-pro-max, Vercel/Notion/RunPod feel, no purple | User-specified design direction | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-05 after initialization*
