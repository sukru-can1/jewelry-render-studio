# Calibration reference dataset (INTEL-06 — 09-AI-SPEC §5.7)

The labelled reference set that gates **auto-correct trust**: the vision judge
(`lib/intelligence/analyze-preview.ts`) must demonstrably agree with the QA lead
(**judge↔human agreement ≥ 0.7**) before the adaptive loop is allowed to apply
knob deltas to a re-render unsupervised. Until then the loop runs in
**recommend-only** mode (`INTEL_AUTOCORRECT_ENABLED` unset/false — see
`lib/env.ts`).

## Files

| File | Purpose |
|------|---------|
| `dataset.json` | The labelled cases (schema below). Labels are the HUMAN side of the comparison. |
| `fixtures/adversarial-black.png` | Committed structurally-empty adversarial frame (expects `emptyOrBroken`). |
| `verdicts.cache.json` | Model verdicts keyed by case id (created by `--record`; committed so CI never burns vision calls). |

## Running the harness

```bash
# Cached-verdicts only — CI-safe, ZERO AI calls. Skips any case without a cached verdict.
npx tsx scripts/calibrate-intel.ts

# LIVE recording — scores uncached cases with the REAL vision model (burns OpenAI
# vision tokens; needs .env.local with OPENAI_API_KEY + BLOB_READ_WRITE_TOKEN and
# the full required env). This is the operator-triggered calibration run.
npx tsx scripts/calibrate-intel.ts --record

# CI alias (09-AI-SPEC §5.8) — cached-only, identical assertions:
npx tsx test/intelligence/run-eval.ts
```

Output: `.planning/phases/09-adaptive-render-intelligence/CALIBRATION-REPORT.md`
(+ `.json` next to it). The process exits **non-zero when an expected hard gate
did not fire on a scored bad-set case** (a safety regression — T-09-15), even
though agreement is still reported.

Verdicts are cached per case id under the dataset's `promptVersion`. **Bump
`promptVersion` in `dataset.json` AND `CALIBRATION_PROMPT_VERSION` in
`scripts/calibrate-intel.ts` whenever the vision SYSTEM prompt or
`visionVerdictSchema` changes** — stale cache entries are then ignored and
re-recorded on the next `--record` run.

## Case schema

```jsonc
{
  "id": "unique-stable-id",
  "todo": false,              // true = unlabelled coverage slot (skipped by the harness)
  "provisional": true,        // true = engineer-provisional labels, pending QA-lead review
  "source": { "type": "local", "path": "outputs/ring99/….png" },
  //        or { "type": "blob", "pathname": "renders/<jobId>/<jobId>.png" }  (PRIVATE blob)
  "metal": "white|yellow|rose",
  "stoneGroup": "diamond|none|…",
  "angle": "hero|front|top|profile",
  "pass": "full|metal|stone",
  "expectVerdict": "accept|autoCorrect|escalate",
  "humanScores": { /* all 8 dimensions, 1–5 (QA lead) */ },
  "expectGates": { /* explicit expected flag states; omitted = unchecked */ },
  "expectDeltaSign": { /* -1|0|1 per knob (senior operator); graded on non-accept only */ },
  "notes": "free text"
}
```

## Labelling protocol (who labels what)

Domain experts label — **not engineers** (09-AI-SPEC §5.7):

- **Catalog/Retouching QA lead** — the 1–5 score per dimension + the
  accept/reject verdict per case.
- **Senior render operator** — the expected knob-delta **direction** (sign) per
  non-accept case + the hard-gate expectations on the bad set.

The currently-filled cases are **engineer-provisional anchors** (obvious
known-good ring99 catalog renders + the broken zanessa batch + the adversarial
black frame). They are marked `provisional: true` and the harness reports any
agreement computed over them as **NON-trust-gating**. The `todo:*` slots list
the remaining required coverage (per-metal, per-angle, per-failure-mode) to
reach the 12–20 case target (minimum 12 labelled).

## Trust-gate flow

1. QA lead + senior operator review/replace every provisional label and fill
   every `todo` slot (then set `provisional: false` per case and at the top).
2. Operator runs `npx tsx scripts/calibrate-intel.ts --record`.
3. The report prints per-dimension within-±1 rates, the hard-gate hit rate on
   the bad set, the delta sign-agreement rate and the overall agreement.
4. **Agreement ≥ 0.7 on real (non-provisional) labels** → a human sets
   `INTEL_AUTOCORRECT_ENABLED=true` in the deployment env. That is the entire
   act of opening the gate; nothing flips automatically.
5. Below 0.7 (or with provisional labels) the loop keeps scoring, deciding and
   recommending — but every render ships the classic path until recalibrated.
