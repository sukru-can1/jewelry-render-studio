# Requirements: Jewelry Render Studio — Enterprise

**Defined:** 2026-06-05
**Core Value:** An operator can take one jewelry model and reliably produce the full set of catalog images — every angle × metal × stone variant, in correctly separated metal/stone layers — without touching Blender or hand-editing recipes.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Security & Hardening

- [x] **SEC-01**: Previously-exposed RunPod API key is rotated and all secrets live only in environment variables (none committed)
- [x] **SEC-02**: Vercel Blob assets (models, renders, deliverables) are private, served via signed/time-limited URLs rather than public URLs
- [x] **SEC-03**: Every app and API route denies access by default to unauthenticated requests
- [x] **SEC-04**: Machine-to-machine endpoints (RunPod status webhook) authenticate via a shared secret, not open access
- [ ] **SEC-05**: Hardcoded `ring99` model URL and local fallback recipe path are removed from API routes

### Authentication & Roles

- [x] **AUTH-01**: A team member can log in with credentials and stay logged in across browser refresh (JWT in HTTP-only cookie)
- [x] **AUTH-02**: A user can log out from any page
- [x] **AUTH-03**: Users have a role of Admin or Operator, stored and enforced server-side
- [x] **AUTH-04**: An Admin can create, disable, and assign roles to user accounts
- [x] **AUTH-05**: Operators are blocked from Admin-only actions (domain settings, user management) by server-side checks, not just hidden UI

### Data & Domain Settings

- [x] **DATA-01**: Structured state (users, projects, products, object-group assignments, batches, jobs, outputs) is persisted in Postgres via Prisma
- [x] **DATA-02**: Prisma uses a pooled connection configuration safe for Vercel serverless (no pool exhaustion under concurrent requests)
- [x] **DATA-03**: Domain settings are seeded from the rendering team's real values: 4 camera views (view1 az30/el25, view2 az180/el15, view3 az−30/el10, view4 az0/el75), 3 metals (white = White Gold/Platinum, yellow = 18K Yellow Gold, red = Rose Gold), 4 object groups (alloycolour, diamond, stone2, stone3), quality presets (preview 64 / medium 256 / high 512 / ultra), default 1920×1920
- [x] **DATA-04**: An Admin can view and edit domain settings (camera views, metals, stone types, quality presets) and changes apply to new batches
- [ ] **DATA-05**: Existing render history from the prior Blob job-state is preserved or migrated into the new store (no silent loss of past work)

### Product Workspace

- [x] **PROD-01**: An operator can create a product and upload its 3D model (GLB/FBX/BLEND/OBJ/STL) via direct-to-Blob client upload
- [x] **PROD-02**: An operator can run material inspection on a product model and see the detected objects, material slots, and BSDF values
- [x] **PROD-03**: An operator can assign each detected object to a group (alloycolour / diamond / stone2 / stone3) and save the assignment to the product
- [x] **PROD-04**: A product's saved group assignment drives which objects are rendered or held out in each pass
- [x] **PROD-05**: An operator can browse and reopen previously created products

### Batch / Render-Job Builder

- [x] **BATCH-01**: An operator can build a render batch for a product by selecting multiple camera angles
- [x] **BATCH-02**: An operator can select multiple metals for a batch
- [x] **BATCH-03**: An operator can select a stone type per stone group (center/diamond, stone2, stone3) for a batch
- [x] **BATCH-04**: An operator can choose which layered passes to produce: metal-only (alloycolour) plus each selected stone group separately
- [x] **BATCH-05**: The builder shows a live count and cost/time estimate of the jobs the current selection will generate before submission
- [x] **BATCH-06**: The builder enforces a hard cap on total jobs per batch and defaults to a preview-quality setting to prevent runaway GPU cost
- [x] **BATCH-07**: Submitting a batch expands the matrix into one job per (angle × metal × stone-assignment × pass) combination, each with a generated recipe

### Orchestration & Status

- [ ] **ORCH-01**: Each job is submitted to RunPod and tracked with a status (queued / running / completed / failed / cancelled)
- [ ] **ORCH-02**: Job status updates arrive via RunPod webhook with a Vercel Cron reconciliation fallback — not per-request polling fan-out
- [ ] **ORCH-03**: A failed job retries automatically up to a configured limit (~2), with retries idempotent (no duplicate successful renders)
- [ ] **ORCH-04**: An operator can view a batch's progress (completed / failed / total) and read the error/log for any failed job
- [ ] **ORCH-05**: An operator can cancel a queued or running batch/job

### Outputs & Gallery

- [ ] **OUT-01**: Completed renders are produced as layered outputs: the metal pass as JPEG and each stone group as a transparent PNG via holdout
- [ ] **OUT-02**: An operator can browse a batch's outputs in a gallery organized by product / metal / angle / pass
- [ ] **OUT-03**: An operator can preview any output and download an individual layer or the full set

### Compositing & Deliverable

- [ ] **COMP-01**: An operator can stack a variant's metal + stone layers in-browser to preview the assembled image, toggling layers on/off
- [ ] **COMP-02**: The server flattens a variant's layers into a single catalog-ready deliverable image (correctly aligned), generated per variant
- [ ] **COMP-03**: An operator can download the flattened catalog-ready deliverable for a variant or a whole batch

### UI / Design System

- [ ] **UI-01**: The interface is built with the `ui-ux-pro-max` skill, with a coherent design system (tokens, components) — influenced by Vercel, Notion, and RunPod: functional and cutting-edge, with no purple as the primary brand color
- [x] **UI-02**: Primary operator workflows (product workspace, batch builder, job monitor, gallery/compositing) are navigable, responsive, and show clear loading/empty/error/in-progress states

### Deployment

- [ ] **DEPLOY-01**: The app builds and deploys to the existing Vercel project `sukrus-projects-1b84f634/jewelry-render-studio` with the new env vars (DB URL, auth secret, webhook secret) configured

## v2 Requirements

Acknowledged but deferred — not in the current roadmap.

### Collaboration / Workflow

- **NOTF-01**: In-app or email notifications when a batch completes or fails
- **REVW-01**: The rating/tournament feedback loop (rate renders → auto-generate next-gen recipes), rebuilt for the enterprise app
- **AUDIT-01**: Full activity/audit log of who created/cancelled/edited what

### Asset Management

- **DAM-01**: Tagging, search, and collections across products and outputs (light DAM)
- **EXPORT-01**: Push deliverables to an external catalog/PIM or cloud bucket

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-tenant SaaS (orgs, per-tenant isolation) | Internal single-tenant team only for this milestone |
| Rebuilding the Blender worker / recipe engine | Existing pipeline is proven and reused |
| Custom GPU scheduler / render-farm | RunPod serverless handles scheduling |
| Migrating or running the legacy Flask app (`external-work/`) | Used only as a requirements source (domain settings + holdout logic) |
| The local `scripts/` vNNN R&D toolbox in the product | Stays as offline tooling |
| Public / unauthenticated access | Explicitly removed for an internal enterprise tool |
| Recipe-editing sandbox as the operator surface | Operators use the structured builder, not raw recipe JSON |
| Mobile-native app | Web-first |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 1 | Complete |
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| PROD-01 | Phase 2 | Complete |
| PROD-02 | Phase 2 | Complete |
| PROD-03 | Phase 2 | Complete |
| PROD-04 | Phase 2 | Complete |
| PROD-05 | Phase 2 | Complete |
| DATA-04 | Phase 2 | Complete |
| BATCH-01 | Phase 3 | Complete |
| BATCH-02 | Phase 3 | Complete |
| BATCH-03 | Phase 3 | Complete |
| BATCH-04 | Phase 3 | Complete |
| BATCH-05 | Phase 3 | Complete |
| BATCH-06 | Phase 3 | Complete |
| BATCH-07 | Phase 3 | Complete |
| ORCH-01 | Phase 4 | Pending |
| ORCH-02 | Phase 4 | Pending |
| ORCH-03 | Phase 4 | Pending |
| ORCH-04 | Phase 4 | Pending |
| ORCH-05 | Phase 4 | Pending |
| OUT-01 | Phase 5 | Pending |
| OUT-02 | Phase 5 | Pending |
| OUT-03 | Phase 5 | Pending |
| COMP-01 | Phase 6 | Pending |
| COMP-02 | Phase 6 | Pending |
| COMP-03 | Phase 6 | Pending |
| UI-01 | Phase 7 | Pending |
| UI-02 | Phase 7 | Complete |
| SEC-05 | Phase 8 | Pending |
| DATA-05 | Phase 8 | Pending |
| DEPLOY-01 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 41 total
- Mapped to phases: 41 (100%) ✓
- Unmapped: 0 ✓

> Note: the prior summary line read "38 total" but the requirement list enumerates 41 distinct REQ-IDs (SEC×5, AUTH×5, DATA×5, PROD×5, BATCH×7, ORCH×5, OUT×3, COMP×3, UI×2, DEPLOY×1). All 41 are mapped.

---
*Requirements defined: 2026-06-05*
*Last updated: 2026-06-05 after roadmap creation (traceability mapped, 41/41 covered)*
