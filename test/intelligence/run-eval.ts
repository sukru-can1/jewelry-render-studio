// INTEL-06 (Phase 9, 09-04) — the CI calibration runner (09-AI-SPEC §5.8):
//
//   npx tsx test/intelligence/run-eval.ts
//
// Delegates to scripts/calibrate-intel.ts in CACHED-VERDICTS-ONLY mode: the
// labelled set (calibration/dataset.json) is scored against verdicts previously
// recorded from analyzePreview / analyzeImageDataUrl (the REAL vision judge) by
// `npx tsx scripts/calibrate-intel.ts --record` — CI burns ZERO vision calls
// (T-09-16). Cases without a cached verdict are skipped with a note, so CI
// stays green without secrets.
//
// Asserts per scored case: every dimension within ±1 of the human label, delta
// sign-agreement on every non-accept case (the "raise brightness to fix milky"
// anti-pattern catcher), and every expected hard gate firing on the bad set.
// Computes the judge<->human agreement + the autoCorrectTrusted (>=0.7) verdict
// and exits NONZERO when an expected hard gate did not fire (safety regression)
// — even though agreement is still reported. Auto-correct stays RECOMMEND-ONLY
// in production until agreement >= 0.7 on real (non-provisional) labels.

import { runCalibration } from "../../scripts/calibrate-intel";

runCalibration({ record: false })
  .then(({ report, skipped, exitCode }) => {
    if (report.scoredCases === 0) {
      console.log(
        `run-eval: no cached verdicts yet (${skipped.length} case(s) skipped) — ` +
          "agreement not computable; the loop stays recommend-only. " +
          "Operator: run `npx tsx scripts/calibrate-intel.ts --record` to score the set.",
      );
    }
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
