# Phase 09 — Deferred Items

## FINAL_QUEUED → DONE intelState flip (out of 09-03 scope)

- **Found during:** 09-03 execution (carried over from the 09-02 summary note).
- **What:** The analyzed job parks at `intelState: "FINAL_QUEUED"` with
  `intel.finalJobId` linking the classic FINAL render. Nothing currently flips it
  to `DONE` when that FINAL job completes — the webhook only flips
  `PREVIEW_QUEUED -> ANALYZING` (explicit 09-02 must-have).
- **Impact:** Cosmetic/state-completeness only. The operator panel treats both
  `FINAL_QUEUED` and `DONE` as settled/reviewable, the FINAL's Layer reaches the
  gallery via the classic path, and accept/reject/override work. The state badge
  just reads "Final queued" indefinitely.
- **Why deferred:** 09-03's plan tasks/files never included the webhook or
  reconcile path; flipping it there is a guarded-transition change on a hardened,
  source-guarded module and belongs in its own planned task (candidate: fold into
  09-04 or a follow-up orchestration tweak — a guarded `updateMany` where
  `intelState: "FINAL_QUEUED"` and `intel.finalJobId == completed job id`).
