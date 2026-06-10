# Phase 7 — UI Review

**Audited:** 2026-06-10
**Baseline:** Locked design system (`app/globals.css` 3-tier tokens; teal accent, NO purple, Geist, 8pt, 2 weights, dual theme) + 31 shadcn components in `app/components/ui/`. Phase 7 goal: ONE coherent design system + full loading/empty/error/in-progress state coverage on primary workflows (UI-01 + UI-02).
**Screenshots:** Not captured — no dev server on :3000/:5173/:8080. Code-only audit (Tailwind class audit, token-bypass grep, state-coverage read, a11y read).
**Scope discipline:** This is a coherence + polish pass on already-shipped surfaces (mode=mvp), NOT a redesign. PASS items are marked so the planner does not gold-plate.

---

## Dimension Scores

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Token fidelity / no-purple | 3/5 | NO purple anywhere (PASS). But 12 raw-palette status colors (`amber-500`/`sky-500`/`emerald-500`) bypass `warning`/`info`/`success` tokens in 3 builder/product files. |
| 2 | Component consistency | 5/5 | Button/Card/Badge/Alert/Table used consistently; ad-hoc `<button>`s are all legitimate custom controls with aria-labels. Status pills fully centralized. PASS. |
| 3 | Spacing / typography rhythm | 5/5 | Only `font-medium` + `font-semibold` in use (exactly 2 weights). Every `<h1>` is identical. 8pt spacing holds. PASS. |
| 4 | State coverage (UI-02) | 4/5 | Products, batches list, monitor, gallery, compositing, admin-users all carry empty+error states. One gap: batch-builder/products surfaces use raw-color status frames (same root as Dim 1); no true "loading" skeleton gap that breaks a flow. |
| 5 | Accessibility quick-wins | 5/5 | Icon-only buttons carry aria-label; nav has aria-current + 44px hit area; focus-visible rings preserved on custom buttons; decorative icons aria-hidden. PASS. |
| 6 | Cross-surface coherence | 5/5 | Uniform page-header pattern, single teal active-nav indicator, one primary CTA per view. PASS. |

**Overall: 27/30** — the app is in strong coherence shape. There is essentially ONE real, repeated defect (raw status-palette drift) plus its second-order effects. Do not over-plan.

---

## Top 3 Priority Fixes

1. **Raw status-palette colors bypass semantic tokens in the batch builder & group assignment** — the estimate "big number" panel, builder inline notices, and stone-group chips render `amber-500`/`sky-500`/`emerald-500` while the rest of the app (status-pill, compositor warn banner) correctly uses `warning`/`info`/`success` tokens. Breaks theme fidelity and the single-source-of-truth contract. → Replace each with the named semantic token (the code comments already name the correct token — e.g. batch-builder.tsx:67 says "stone2=info, stone3=warning" but hardcodes `sky-500`/`amber-500`).
2. **Stone-group chip color map is duplicated and divergent** — `STONE_GROUP_CHIP` / `CHIP_CLASS` is defined independently in `group-assignment.tsx:53-54` and `batch-builder.tsx:70-71` with the same raw colors. → Extract one shared token-based map so diamond=primary / stone2=info / stone3=warning is defined once.
3. **"Creating batch…" / submitting copy uses raw `text-sky-500`** (estimate-panel.tsx:119, mirrored in batch-builder.tsx:119) — an in-progress state colored off-token. → Use `text-info` (or `text-muted-foreground`) so the in-progress state matches the running/info convention used by the monitor.

---

## Detailed Findings

### Dimension 1: Token fidelity / no-purple (3/5)

**PASS — no purple/violet/indigo/fuchsia anywhere.** The only hit was a code comment reaffirming "NO purple" (`batch-builder.tsx:10`).

**PASS — no `text-[#...]`/`bg-[...]` arbitrary hex** Tailwind values in the surfaces. The 2 raw-hex hits are legitimate dynamic values, not styling drift:
- `admin/settings/settings-forms.tsx:351` — `value={m.hex ?? "#000000"}` is the value of a native `<input type="color">` metal-swatch editor. Correct.
- `products/inventory-viewer.tsx:43` — `rgba(...)` computed from model material data for a live swatch. Correct.

**BLOCKER-class drift (the real finding): 12 raw Tailwind palette colors used for semantic status, bypassing tokens.**
- `products/[id]/batches/new/estimate-panel.tsx:24` — `border-l-emerald-500/70` (should be `success`)
- `products/[id]/batches/new/estimate-panel.tsx:25` — `border-l-amber-500 border-amber-500/40` (should be `warning`)
- `products/[id]/batches/new/estimate-panel.tsx:74` — `text-amber-500` warn icon (should be `text-warning`)
- `products/[id]/batches/new/estimate-panel.tsx:119` — `text-sky-500` "Creating batch…" (should be `text-info`)
- `products/[id]/batches/new/batch-builder.tsx:70-71` — `border-sky-500/50 text-sky-500`, `border-amber-500/50 text-amber-500` stone chips (should be `info`/`warning`)
- `products/[id]/batches/new/batch-builder.tsx:232,265,357,429` — `text-amber-500` validation notices (should be `text-warning`)
- `products/[id]/group-assignment.tsx:53-54` — `border-sky-500/50 text-sky-500`, `border-amber-500/50 text-amber-500` stone chips (should be `info`/`warning`)
- `products/[id]/group-assignment.tsx:258` — `text-amber-500` notice (should be `text-warning`)

The token vocabulary already exists (`--info`, `--warning`, `--success` in `globals.css:88-93` / `:141-146`) and is already used correctly elsewhere — these files just didn't adopt it. This is the single most impactful fix for UI-01.

### Dimension 2: Component consistency (5/5) — PASS

- Status pills are fully centralized in `batches/status-pill.tsx` (`JobStatusPill` + `BatchStatusPill`), token-driven, one `Badge variant="outline"` base. No ad-hoc status pills found elsewhere.
- The 6 raw `<button>` elements are all legitimate non-`Button` custom controls, each correctly built:
  - `products/model-dropzone.tsx:251` — full-area dropzone (aria-label "Upload a model file").
  - `admin/settings/settings-forms.tsx:341` — color-swatch popover trigger (aria-label present).
  - `products/[id]/group-assignment.tsx:217` — dashed "Suggested → Accept" chip (token-based `border-primary/60 text-primary`).
  - `gallery/preview-lightbox.tsx:119,127` — prev/next nav arrows (aria-label + focus-visible ring).
  - `gallery/layer-card.tsx:79` — thumbnail trigger (aria-label + focus-visible ring).
- Icons are lucide-only across surfaces; sizes are consistent (`size-3`/`size-4`/`size-5`).

### Dimension 3: Spacing / typography rhythm (5/5) — PASS

- Font-weight audit: only `font-medium` and `font-semibold` appear across all 27 surface files — exactly the 2-weight contract. Zero `font-bold`/`font-light`/`font-normal` sprawl.
- Heading audit: every `<h1>` across products, batches, batch detail, gallery, compositing, admin, forbidden is the identical role `text-xl font-semibold leading-tight text-foreground`. Section `<h2>`/`<h3>` are uniformly `text-base font-semibold`. The 40px estimate "big number" (`estimate-panel.tsx:83`) is the one declared, documented typographic exception — correct.
- Spacing is on the 8pt scale (`gap-6`/`p-6`/`gap-3`/`py-16` etc.); no arbitrary `[NNpx]` spacing values found.

### Dimension 4: State coverage (UI-02) (4/5)

Verified per-surface (read, not assumed):
- **Products list** (`products/page.tsx`) — error (l.56), empty (l.65 "No products yet" + CTA), populated. Server component → loading handled by layout `<Suspense>` skeleton. PASS.
- **Batch monitor** (`jobs-monitor.tsx`) — in-progress (poll loop + AggregateBar + Freshness), filtered empty (l.263 "No jobs in this batch."), per-job failed/expandable. PASS.
- **Compositing** (`compositor.tsx`) — per-layer error+retry (l.106), warn banner (l.125, token-based), in-progress flatten. PASS.
- **Gallery** (`layer-card.tsx`) — per-thumbnail "Couldn't load" error (l.88). PASS.
- **Admin users** (`users-table.tsx`) — error+Retry (l.145), empty (l.154 "No users yet" + CTA), per-row busy state. PASS.
- **App shell** (`layout.tsx`) — global `<Suspense>` skeleton fallback. PASS.

**Gap (minor, same root as Dim 1):** the batch-builder/estimate validation + in-progress states ARE present but rendered with off-token raw colors (warn=`amber-500`, submitting=`sky-500`), so the in-progress/warn states visually diverge from the rest of the app. Functionally covered; stylistically off-contract. No surface is MISSING a required state, so this stays at 4/5 (the −1 is the raw-color state rendering, not an absence).

### Dimension 5: Accessibility quick-wins (5/5) — PASS

- Every icon-only button carries an aria-label (lightbox arrows, dropzone, color swatch, thumbnail trigger).
- Sidebar nav: `aria-current="page"` on active item, `min-h-11` (44px) hit area, teal active indicator via tokens (`sidebar.tsx:43-56`).
- Custom buttons preserve `focus-visible:ring-2 focus-visible:ring-ring`; no `outline-none` left without a focus-visible replacement.
- Decorative icons consistently `aria-hidden`.
- Status pills carry text labels (not color-only), so status is not conveyed by color alone.

### Dimension 6: Cross-surface coherence (5/5) — PASS

- Page-header pattern is uniform (`<header>` with `<h1 text-xl font-semibold>` + optional mono count + single primary `Button`).
- Active-nav state is one consistent treatment (left 2px teal bar + accent tint + teal icon).
- Primary-CTA discipline holds: one primary `Button` per view; secondary actions use `variant="secondary"`/`"ghost"` (e.g. products error Retry, batch-builder Cancel).

---

## Registry Safety

`components.json` present (shadcn). UI-SPEC declares no third-party registries (all 31 components are shadcn-official primitives). Registry audit: 0 third-party blocks, no flags.

---

## Prioritized MVP Fix List (work units for the planner)

### Work Unit A — Status-token sweep (the one real defect) — SMALL
Replace the 12 raw status-palette colors with the existing semantic tokens, mapping by role: warn→`warning`, info/running→`info`, safe→`success`, submitting→`info`. Files: `products/[id]/batches/new/estimate-panel.tsx` (l.24,25,74,119), `products/[id]/batches/new/batch-builder.tsx` (l.70-71,119,232,265,357,429), `products/[id]/group-assignment.tsx` (l.53-54,258). The correct token is already named in the surrounding comments — pure 1:1 substitution, no new tokens needed. Closes the UI-01 gap and the Dim-4 −1 in one pass.

### Work Unit B — De-duplicate the stone-group chip map — TINY
Extract the divergent, duplicated `STONE_GROUP_CHIP` (`batch-builder.tsx:68-72`) and `CHIP_CLASS` (`group-assignment.tsx:53-54`) into one shared token-based map (diamond=`primary`, stone2=`info`, stone3=`warning`) so the group color contract is defined once. Folds naturally into Work Unit A; can be the same plan.

### Work Unit C — (Optional, only if time) verify-only state pass — NONE/NO-OP
State coverage is already strong across every primary surface. No state-fill work is warranted. Recommend the planner mark UI-02 as already-satisfied (verified by this audit) rather than spawning fill plans. Do NOT gold-plate Products/Admin with redundant skeletons — they are server components covered by the layout `<Suspense>` fallback.

---

## Files Audited
- `app/globals.css` (token source of truth)
- `app/(app)/layout.tsx`, `app/components/app-shell/sidebar.tsx`
- `app/(app)/products/page.tsx`, `product-card.tsx`, `model-dropzone.tsx`, `inventory-viewer.tsx`
- `app/(app)/products/[id]/group-assignment.tsx`
- `app/(app)/products/[id]/batches/new/batch-builder.tsx`, `estimate-panel.tsx`
- `app/(app)/batches/page.tsx`, `status-pill.tsx`, `aggregate-bar.tsx`
- `app/(app)/batches/[id]/jobs-monitor.tsx`, `error-log.tsx`, `freshness.tsx`, `cancel-controls.tsx`, `segment-switcher.tsx`
- `app/(app)/batches/[id]/gallery/layer-card.tsx`, `preview-lightbox.tsx`, `gallery-controls.tsx`, `page.tsx`
- `app/(app)/batches/[id]/compositing/compositor.tsx`, `page.tsx`
- `app/(app)/admin/users/users-table.tsx`, `page.tsx`; `admin/settings/settings-forms.tsx`, `page.tsx`
- `app/(app)/forbidden/page.tsx`
- `app/components/ui/` (31 components — inventory + consistency check)
