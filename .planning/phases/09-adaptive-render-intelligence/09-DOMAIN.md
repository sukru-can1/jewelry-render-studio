# 09-DOMAIN — Catalog-Grade Jewelry Render Quality (Scoring Rubric)

> **Purpose**: Ground a multimodal vision-AI (gpt-5.5-pro vision) rubric that scores a LOW-SAMPLE PREVIEW render of a jewelry piece (rings primarily) and recommends recipe-knob corrections fed back into `lib/enterprise-recipes.ts` `buildEnterpriseRecipe`.
> **Scope**: This is the DOMAIN layer (1b) — what a jewelry photographer / retoucher / catalog QA lead actually judges. It is NOT a code spec. The eval-planner turns this into a JSON scoring schema + a vision prompt.

---

## 1b. Domain Context

**Industry Vertical:** E-commerce jewelry catalog production (3D-rendered product imagery, replacing photo studio capture).
**User Population:** Glamira's internal rendering operators + the catalog/retouching QA lead who decides whether an image ships. The vision-AI stands in as a first-pass QA reviewer.
**Stakes Level:** **Medium-High.** A bad render does not harm a person, but it directly represents a sellable product. A milky diamond or a white-gold ring that reads as plastic/yellow drives returns, erodes brand trust, and forces costly re-renders (GPU minutes). The render team's encoded settings are hard-won and treated as ground truth.
**Output Consequence:** The AI's score decides whether a preview is (a) accepted as-is for full-quality render, (b) auto-corrected via a bounded set of named profile-override knobs and re-previewed, or (c) flagged for human review. Acting on a wrong correction wastes a render cycle and can push a good image off-spec.

---

## The Knob Vocabulary (what the AI is allowed to recommend)

The AI must NEVER hand-edit recipe JSON. It recommends **named profile overrides** only. These are the levers `buildEnterpriseRecipe` exposes (ground-truth defaults in parentheses):

| Knob | Recipe field | Default | Effect direction |
|------|-------------|---------|------------------|
| `world_strength` | `world.strength` | 0.105 | ↑ brighter environment fill; too high = milky/fake metal+stone |
| `exposure` | `render.exposure` | −0.58 | ↑ overall brightness; ↓ protects highlight clipping |
| `reflection_card_darkness` | `reflection_cards[].color` | 0.015–0.38 | darker cards = readable diamond facets + metal contrast; lighter = preserves metal shape |
| `reflection_card_position` | `reflection_cards[].position/rotation` | per-card | repositions specular streaks on metal/stone |
| `contact_shadow_strength` | `contact_shadows[].alpha` | 0.115 | ↑ grounds the product; too high = heavy/dirty; too low = floating |
| `camera_preset` | `camera` (hero/front/top/profile) | per-angle | lower front camera = facets face viewer |

**Iron law from the render team (treat as ground truth, do not relearn):**
- Diamond quality = CONTROLLED CONTRAST + dark reflection cards + catalog diamond shader + postprocess — **NOT brighter lights**. If a diamond looks dull, the AI's instinct must be *darken cards / lower world_strength*, not *raise exposure*.
- White gold must NOT be pure white (darker metal base, higher roughness, lower world strength). A white-gold piece that reads as chrome/white plastic is a FAILURE, not a success.
- Too much environment brightness → metal + diamond go milky/fake.
- Dark reflection cards create readable facets; gray cards preserve metal shape.
- Stone passes = transparent output + no studio background; metal/full passes = studio bg + contact shadow.
- Front diamond shots need a LOWER camera so facets face the camera.

---

## What Domain Experts Evaluate Against (Scoring Rubric)

Each dimension scored 1–5. **1 = reject, 3 = borderline/correctable, 5 = catalog-ready.** Anchors are written so two retouchers would agree.

### D1 — Diamond Brilliance & Fire (the make-or-break dimension)
**Measures:** Does the center stone read as a real, lively diamond with crisp facet-to-facet micro-contrast and visible sparkle — or as a flat, dull, cloudy lump?
**Good cues:** Bright facet highlights sitting against dark facet valleys (high micro-contrast); pinpoint specular sparkles; the table reflects a clean bright/dark pattern; stone looks 3-dimensional and "alive."
**Bad cues (MILKINESS — the #1 failure):** The stone is a uniform pale gray/white wash with no internal dark structure; facets are indistinguishable; looks like frosted glass or plastic; no sparkle.
- **5** — Strong facet micro-contrast, clear bright/dark mosaic, crisp sparkle, reads instantly as a diamond.
- **3** — Facets visible but low contrast; some sparkle; slightly washed but recoverable.
- **1** — Milky/cloudy/uniform; no readable facets; reads as glass or plastic.
**Stakes:** Critical.
**Source:** Retoucher practice — micro-contrast between facets is what makes a diamond read as 3D, not flat ([colorclipping](https://www.colorclipping.com/blog/amazing-diamond-jewelry-retouching-techniques-to-boost-sales), [jewelryretouchers](https://www.jewelryretouchers.com/diamond-photo-retouching-tips/)). Milkiness in renders stems from excess uniform fill / too-bright environment ([blenderartists](https://blenderartists.org/t/how-to-achieve-realistic-diamond-caustics-and-light-play-in-cycles/1605044)). Render-team iron law.

### D2 — Metal Highlight Integrity (clipping / blown whites)
**Measures:** Are the bright metal highlights controlled and detailed, or blown out to pure paper-white with no shape?
**Good cues:** Highlights are bright but hold gradient/shape; you can see the curvature of the band; specular streaks read as polished metal.
**Bad cues:** Large pure-white (255) regions on the band with zero detail; the metal silhouette "melts" into the background; highlights have hard clipped edges.
- **5** — Highlights bright, crisp, fully detailed; no clipped white blobs.
- **3** — Small isolated clipped spots; band shape still readable.
- **1** — Large blown-white areas; band shape lost; metal merges with background.
**Stakes:** High.
**Source:** Jewelry photographers underexpose to protect highlights on reflective metal — "better to slightly underexpose and recover than blow out" ([pixelretouching](https://pixelretouching.com/best-camera-settings-for-jewelry-photography)).

### D3 — Metal Material Believability (metal vs plastic vs chrome)
**Measures:** Does the metal read as the *intended alloy* (yellow/white/rose gold) — warm, lustrous, with believable roughness — or as flat plastic, mirror chrome, or the wrong color?
**Good cues:** Even warm luster; correct hue per metal; surface roughness reads as polished-but-real gold; subtle gradient sheen.
**Bad cues:** Dead-flat matte (plastic); perfect mirror with no roughness (chrome); white gold gone pure-white; rose/yellow gone gray or desaturated.
- **5** — Reads unmistakably as the correct gold alloy; lustrous, not plastic, not chrome.
- **3** — Slightly off — a bit flat or a bit too shiny, or hue slightly drifted, but recognizable.
- **1** — Reads as plastic, chrome, or the wrong metal entirely (e.g., white gold as bright white).
**Stakes:** High.
**Source:** Retouchers match true metal type, "no rose gold masquerading as platinum" ([colorclipping](https://www.colorclipping.com/blog/amazing-diamond-jewelry-retouching-techniques-to-boost-sales)); render-team rule that white gold must not be pure white.

### D4 — Overall Exposure / Tonal Balance (milky-vs-rich)
**Measures:** Is the whole image at the right brightness — rich and contrasty — or washed-out/milky-bright (or muddy-dark)?
**Good cues:** Clean bright background, product carries a full tonal range with true blacks/dark accents present; image feels "premium" and crisp.
**Bad cues:** Everything elevated toward light gray; no true darks; flat, foggy, low-contrast "milky" look (over-bright environment). Or the inverse: muddy, underlit, dull.
- **5** — Full tonal range, rich contrast, clean exposure.
- **3** — Slightly flat or slightly bright; correctable.
- **1** — Washed-out/milky across the frame, or muddy-dark; no contrast.
**Stakes:** High.
**Source:** Render-team rule (too much environment brightness → fake/milky); contrast adjustments give gems depth ([colorclipping](https://www.colorclipping.com/blog/amazing-diamond-jewelry-retouching-techniques-to-boost-sales)).

### D5 — Center-Stone Bilateral Symmetry
**Measures:** On front/top angles, is the center stone's facet pattern visually balanced left-to-right?
**Good cues:** The stone's highlight/shadow mosaic is near-mirror-symmetric about its vertical axis; settings/prongs evenly placed.
**Bad cues:** One side of the stone bright, the other dark; lopsided facet pattern; the stone looks tilted/skewed.
- **5** — Visually symmetric; balanced facet pattern.
- **3** — Minor imbalance; acceptable on non-front angles.
- **1** — Obviously lopsided/tilted; distracting asymmetry.
**Stakes:** Medium (Critical on `top` and `front` angles).
**Source:** Symmetry is a core catalog QA check; the recipe already has a `center_stone_symmetry` postprocess pass, confirming it is a tracked concern.

### D6 — Contact Shadow Believability (grounding)
**Measures:** Does the product sit believably on the surface (metal/full passes), or float / sink into a heavy dirty shadow?
**Good cues:** Soft, subtle shadow directly under the contact point; grounds the ring without drawing attention.
**Bad cues:** No shadow → product floats; or a heavy, dark, hard-edged shadow → looks dirty/composited; shadow offset from the contact point.
- **5** — Subtle, well-placed, believable grounding shadow.
- **3** — Slightly too light/heavy but plausible.
- **1** — Floating (no shadow) or heavy/dirty/misplaced shadow.
**Stakes:** Medium. (Stone passes are transparent → shadow N/A; do not penalize.)
**Source:** Catalog grounding convention; recipe `contact_shadows.alpha` is the dedicated knob.

### D7 — Framing / Crop / Centering
**Measures:** Is the product well-composed in frame — centered, fully inside, with sane padding — for the given angle?
**Good cues:** Product centered with even margin; nothing clipped at edges; scale consistent with catalog norm.
**Bad cues:** Product cut off at an edge; off-center; too small (lost in frame) or too large (cramped, touching edges).
- **5** — Well-centered, fully in frame, catalog-standard scale.
- **3** — Slightly off-center or padding tight; usable.
- **1** — Clipped at frame edge, badly off-center, or wildly mis-scaled.
**Stakes:** Medium.
**Source:** Catalog-wide consistency requirement ([snappyit](https://snappyit.ai/blog/jewelry-retouching-company)).

### D8 — Background Cleanliness & Holdout Integrity
**Measures:** Is the background clean (metal/full = clean studio white; stone = clean transparent), with no fringing, halos, or stray geometry?
**Good cues:** Metal/full: smooth seamless white gradient. Stone pass: clean transparent alpha around the stone, no dark fringe.
**Bad cues:** Dark fringing/halo around the holdout stone edge; metal bleeding into a stone pass; studio background leaking into a transparent pass; specks/noise in the background.
- **5** — Background pristine; holdout alpha clean; no fringing.
- **3** — Minor edge fringe or faint noise; correctable in composite.
- **1** — Heavy dark fringe, wrong pass contents (metal in stone pass / bg in transparent), unusable holdout.
**Stakes:** High (holdout fringing breaks the layered compositing pipeline downstream).
**Source:** Render-team pass rules + layered-compositing pipeline dependency (Phase 5/6).

---

## Symptom → Cause → Knob Mapping Table

The single most important deliverable: when the AI detects a symptom, this maps to the bounded correction. (Anti-pattern guardrails inline.)

| # | Symptom (visual) | Likely root cause | Recommended knob move | Guardrail |
|---|------------------|-------------------|----------------------|-----------|
| 1 | **Milky/cloudy diamond** — uniform pale stone, no facet contrast | Environment fill too bright; reflection cards too light | **↓ world_strength** AND/OR **↓ reflection_card_darkness** (make cards darker) | Do **NOT** raise exposure — that worsens milkiness. Diamond fix = contrast, not brightness. |
| 2 | **Blown-out / clipped metal highlights** (pure-white blobs, lost band shape) | Exposure too high; environment too bright | **↓ exposure** (more negative) first; if still bright, **↓ world_strength** | Lowering exposure may dull the diamond — re-check D1 after. |
| 3 | **Plastic / flat / dull metal** (no luster) | Too little specular structure; cards not feeding reflections | **darken + reposition reflection cards** to throw specular streaks across the band | Do NOT raise world_strength to "brighten" metal — causes milkiness (symptom 1). |
| 4 | **White gold reads as pure white / chrome** | Over-bright environment elevating the metal base | **↓ world_strength** (and confirm metal preset, not a knob — flag if base looks wrong) | White gold target is a desaturated mid-gray, never 255-white. |
| 5 | **Whole image washed-out / foggy / low-contrast (milky overall)** | world_strength too high | **↓ world_strength** | Most common over-bright failure; prefer this before touching exposure. |
| 6 | Front diamond facets edge-on / not facing camera (dull stone on `front`) | Camera too high for the stone | **camera_preset → lower front camera** | Render-team rule: front shots need a lower camera. |
| 7 | Product floating (no grounding) on metal/full pass | Contact shadow too weak | **↑ contact_shadow_strength** | Stone passes are transparent — never apply on stone pass. |
| 8 | Heavy / dirty / hard contact shadow | Contact shadow too strong | **↓ contact_shadow_strength** | — |
| 9 | Lopsided center stone (asymmetric facets) on front/top | Camera/orientation off-axis | **camera_preset adjust**; if minor, accept (symmetry postprocess pass handles small deltas) | Don't over-correct on hero/profile where some asymmetry is expected. |
| 10 | Dark fringing on stone holdout / wrong pass contents | Holdout include/exclude token mismatch | **Flag for human** — NOT a render-knob fix (token/grouping issue, out of knob scope) | Do not attempt to correct with exposure/cards; escalate. |

---

## Accept / Reject Bar ("good enough for catalog")

Industry bar synthesized from retoucher standards ([snappyit](https://snappyit.ai/blog/jewelry-retouching-company), [colorclipping](https://www.colorclipping.com/blog/amazing-diamond-jewelry-retouching-techniques-to-boost-sales)) + render-team ground truth:

- **Clean background** (seamless white for metal/full; clean transparent alpha for stone).
- **Stone reads as a tack-sharp diamond with visible fire** — facet micro-contrast present, not milky.
- **Metal reads as the correct alloy** — not chrome, not plastic, not pure white.
- **No blown highlights** destroying band shape.
- **Product framed and grounded** per angle convention.

**Decision logic for the loop:**
- **ACCEPT (proceed to full render)**: D1 ≥ 4 AND D3 ≥ 4 AND no dimension scores 1, AND D2/D8 ≥ 3.
- **AUTO-CORRECT (apply knobs, re-preview)**: any dimension scores 2–3 AND a single bounded knob move from the table addresses it. Cap iterations (recommend ≤ 2 correction rounds) to avoid GPU-burn loops.
- **REJECT / ESCALATE TO HUMAN**: any dimension = 1 that the knob table cannot fix (esp. D8 holdout fringing / wrong pass = symptom 10), OR correction rounds exhausted without crossing the accept bar.

Hard gates (a single failure = not catalog-ready regardless of other scores): **D1 milkiness (=1)**, **D3 wrong-metal/chrome (=1)**, **D8 broken holdout (=1)**.

---

## Per-Metal Weighting Notes

| Metal | Dominant risk | Rubric emphasis |
|-------|--------------|-----------------|
| **White gold** | Reads as pure white / chrome under bright environment | Weight **D3** (material believability) and **D4/D5 over-bright** heaviest. Bias corrections toward **↓ world_strength**. Pure-white = automatic D3 fail. |
| **Yellow gold** | Highlight clipping in the warm-bright regions; hue washing to pale | Weight **D2** (clipping) and **D3 hue** highest. Warm saturation must survive — watch for desaturated/gray gold. |
| **Rose gold** | Hue drift to gray/orange; subtle pink lost under high exposure | Weight **D3 hue accuracy** highest; the pink must remain distinct from yellow. White-balance sensitivity is greatest here. |

Cross-metal: a yellow/warm cast that makes white gold look like yellow gold is a recognized catalog defect ([vocal.media](https://vocal.media/earth/transform-your-jewelry-photos-master-color-accuracy-monitoring-today)) — color accuracy is non-negotiable per alloy.

---

## Per-Angle Weighting Notes

| Angle | Dominant quality concern | Rubric emphasis |
|-------|-------------------------|-----------------|
| **hero** (3/4) | The "money shot" — overall premiumness, diamond fire, metal luster | Weight **D1, D3, D4** highest. Some stone asymmetry tolerated (off-axis view). |
| **front** | Facet visibility — camera height so facets face the viewer | Weight **D1** + **camera height (symptom 6)** + **D5 symmetry** highest. A dull front stone usually = camera too high. |
| **top** | Bilateral **symmetry** of the stone and setting from above | Weight **D5 symmetry** highest; **D7 centering** also critical (top view exposes off-center). |
| **profile** | Band silhouette, metal luster, side-stone reading | Weight **D2 (highlight)** + **D3 metal** highest. Center-stone fire less dominant; symmetry not applicable. |

---

## Known Failure Modes in This Domain (3D-render-specific)

1. **Milky diamond** (most common, most damaging) — over-bright/uniform fill kills facet micro-contrast → stone reads as frosted glass.
2. **White-gold-as-chrome/white-plastic** — metal base elevated to pure white by environment brightness.
3. **Blown metal highlights** — reflective metal clips to 255, band silhouette dissolves into background.
4. **Flat/dull metal** — insufficient dark-card specular structure → metal looks like matte plastic.
5. **Holdout fringing / wrong-pass contents** — dark edge halo on transparent stone pass, or metal leaking into a stone pass → breaks layered compositing (escalate, not a knob fix).
6. **Floating product** — missing/weak contact shadow on metal/full pass.

---

## Domain Expert Roles for Evaluation

| Role | Responsibility in Eval |
|------|----------------------|
| Catalog/Retouching QA lead | Label the 10–20 reference preview images (good/borderline/reject); calibrate the 1–5 anchors per dimension; sign off the accept/reject bar. |
| Senior render operator | Calibrate the symptom→knob mappings against real knob behavior; review every AI-recommended correction in the first batches; own the "escalate" edge cases (holdout/token issues). |
| Jewelry photographer (advisory) | Validate that the "good cues" match real photographic standards per metal/angle. |
| Eval engineer | Turn this rubric into the JSON scoring schema + gpt-5.5-pro vision prompt; measure judge↔human agreement (target ≥0.7) before trusting auto-correct. |

---

## Research Sources
- Diamond/jewelry retouching quality criteria (facet micro-contrast, fire/brilliance, metal color matching): https://www.colorclipping.com/blog/amazing-diamond-jewelry-retouching-techniques-to-boost-sales · https://www.jewelryretouchers.com/diamond-photo-retouching-tips/ · https://snappyit.ai/blog/jewelry-retouching-company
- Why 3D-rendered diamonds look milky/fake (uniform fill, contrast, IOR/dispersion): https://blenderartists.org/t/how-to-achieve-realistic-diamond-caustics-and-light-play-in-cycles/1605044 · https://medium.com/@PhoenixIgnitedTech/creating-an-accurate-diamond-material-in-blender-e6564b3c936a
- Metal exposure/highlight protection + per-gold white balance/color accuracy: https://pixelretouching.com/best-camera-settings-for-jewelry-photography · https://vocal.media/earth/transform-your-jewelry-photos-master-color-accuracy-monitoring-today
- **Render-team encoded ground truth** (controlled contrast + dark cards over brighter lights; white gold ≠ pure white; lower front camera; stone-pass transparency): provided in phase brief and reflected in `lib/enterprise-recipes.ts` defaults (treated as authoritative, expanded above).
