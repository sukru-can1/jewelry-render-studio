# Calibration Report — judge↔human agreement (INTEL-06)

- Generated: 2026-06-11T07:28:24.889Z
- Prompt/schema version: `v1-2026-06-11`
- Scored cases: 0 · Skipped: 9
- Labels: **PROVISIONAL (engineer-assigned — NON-trust-gating)**

## Verdict

- **Judge↔human agreement: n/a**
- **Auto-correct trusted (≥ 0.7): NO**
- The loop runs in **RECOMMEND-ONLY** mode: verdicts + proposed deltas are persisted and surfaced; the operator applies/declines; no auto re-preview.

## Per-dimension within-±1 agreement

| Dimension | Checked | Within ±1 | Rate |
|-----------|---------|-----------|------|
| diamondBrilliance | 0 | 0 | n/a |
| metalHighlight | 0 | 0 | n/a |
| metalBelievability | 0 | 0 | n/a |
| exposureTonal | 0 | 0 | n/a |
| stoneSymmetry | 0 | 0 | n/a |
| contactShadow | 0 | 0 | n/a |
| framing | 0 | 0 | n/a |
| backgroundHoldout | 0 | 0 | n/a |

## Hard-gate hit rate (the labelled bad set)

- Expected gates: 0 · Fired: 0 · Rate: n/a
- All expected hard gates fired.

## Delta sign-agreement (non-accept cases)

- Checked: 0 · Agreed: 0 · Rate: n/a

## Per-case results

| Case | Passed | Total | Hard-gate failure |
|------|--------|-------|-------------------|

## Skipped cases

- good-ring99-goal77-front: no cached verdict — run `npx tsx scripts/calibrate-intel.ts --record` to score live
- good-ring99-goalcut-balanced-hero: no cached verdict — run `npx tsx scripts/calibrate-intel.ts --record` to score live
- good-ring99-goalcut-crisp-hero: no cached verdict — run `npx tsx scripts/calibrate-intel.ts --record` to score live
- good-ring99-goalcut-fire-hero: no cached verdict — run `npx tsx scripts/calibrate-intel.ts --record` to score live
- bad-zanessa-metal-hero-yellow: no cached verdict — run `npx tsx scripts/calibrate-intel.ts --record` to score live
- bad-zanessa-stone-hero-yellow: no cached verdict — run `npx tsx scripts/calibrate-intel.ts --record` to score live
- bad-zanessa-metal-front-yellow: no cached verdict — run `npx tsx scripts/calibrate-intel.ts --record` to score live
- bad-zanessa-stone-front-yellow: no cached verdict — run `npx tsx scripts/calibrate-intel.ts --record` to score live
- adversarial-empty-black: no cached verdict — run `npx tsx scripts/calibrate-intel.ts --record` to score live
