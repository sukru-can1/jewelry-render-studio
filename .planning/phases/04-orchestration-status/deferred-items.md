# Deferred Items — Phase 04 Orchestration & Status

## Out-of-scope discoveries (do NOT fix in current plan)

### test/orch-progress.test.ts is RED (Wave 3, expected)
- **Found during:** 04-03 execution (full-suite verification)
- **Detail:** `test/orch-progress.test.ts` fails to import `@/lib/orchestration/batch-status` (`deriveBatchStatus`, `summarizeJobs`). The test file itself carries `// @ts-expect-error — Wave 3 module not built yet; import is RED by design`.
- **Why deferred:** This is a deliberately-RED test for a Wave 3 plan. Plan 04-03 is Wave 2 and touches only reconcile.ts / retry.ts / route.ts — none of which relate to batch-status. Not a regression from 04-03 work.
- **Resolved by:** The Wave 3 plan that creates `lib/orchestration/batch-status.ts`.
