// ORCH-04 — batch progress aggregation + derived batch status.
// Asserts groupBy(status) produces completed/failed/running/queued/total counts
// and the derived status mapping. Import target: @/lib/orchestration/batch-status
// (Wave 3, NOT yet built) — RED at Wave 0 until that module lands.
//
// Also pins the shared status-map terminal contract (GREEN now) so the derived
// mapping in Wave 3 reuses the single source of truth.
import { describe, expect, it } from "vitest";

import { TERMINAL_STATUSES, isTerminal } from "@/lib/orchestration/status-map";

// Wave 3 module is now built (04-05) — these are the GREEN imports.
import { deriveBatchStatus, summarizeJobs } from "@/lib/orchestration/batch-status";

describe("status-map terminal contract (shared, GREEN)", () => {
  it("TERMINAL_STATUSES is exactly completed/failed/cancelled", () => {
    expect([...TERMINAL_STATUSES]).toEqual(["completed", "failed", "cancelled"]);
  });
  it("isTerminal reflects membership", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("in_progress")).toBe(false);
  });
});

describe("summarizeJobs (ORCH-04, RED)", () => {
  it("produces completed/failed/running/queued/total counts from a groupBy", () => {
    const counts = summarizeJobs([
      { status: "completed", _count: 3 },
      { status: "failed", _count: 1 },
      { status: "in_progress", _count: 2 },
      { status: "queued", _count: 4 },
    ]);
    expect(counts.completed).toBe(3);
    expect(counts.failed).toBe(1);
    expect(counts.running).toBe(2);
    expect(counts.queued).toBe(4);
    expect(counts.total).toBe(10);
  });
});

describe("deriveBatchStatus (ORCH-04, RED)", () => {
  it("all completed → completed", () => {
    expect(deriveBatchStatus({ total: 3, completed: 3, failed: 0, running: 0, queued: 0 }, null)).toBe("completed");
  });
  it(">=1 running → running", () => {
    expect(deriveBatchStatus({ total: 3, completed: 1, failed: 0, running: 1, queued: 1 }, null)).toBe("running");
  });
  it("all terminal mixed → partly failed", () => {
    expect(deriveBatchStatus({ total: 3, completed: 2, failed: 1, running: 0, queued: 0 }, null)).toBe("partly failed");
  });
  it("all failed → failed", () => {
    expect(deriveBatchStatus({ total: 3, completed: 0, failed: 3, running: 0, queued: 0 }, null)).toBe("failed");
  });
  it("cancelRequestedAt set + non-terminal jobs → cancelling", () => {
    expect(deriveBatchStatus({ total: 3, completed: 1, failed: 0, running: 1, queued: 1 }, new Date())).toBe("cancelling");
  });
});
