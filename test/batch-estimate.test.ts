// BATCH-05/06 — Pure estimate + threshold config. Zero mocks (pure module).
// Asserts:
//  - countJobs = |angles| × |metals| × |passes|; stone-type NEVER multiplies (BATCH-05).
//  - zone() exact edges 0, 48, 49, 200, 201 (BATCH-06 thresholds).
//  - BATCH_LIMITS constants are the single source (SOFT=48, HARD=200).
//  - estimate() cost/time rise monotonically with samples and scale linearly with jobs.
import { describe, expect, it } from "vitest";

import {
  BATCH_LIMITS,
  COST_MODEL,
  countJobs,
  estimate,
  zone,
} from "@/lib/batches/estimate";

describe("BATCH_LIMITS (single-source thresholds, BATCH-06)", () => {
  it("SOFT_THRESHOLD === 48 and HARD_CAP === 200", () => {
    expect(BATCH_LIMITS.SOFT_THRESHOLD).toBe(48);
    expect(BATCH_LIMITS.HARD_CAP).toBe(200);
  });

  it("COST_MODEL exposes the placeholder GPU constants", () => {
    expect(typeof COST_MODEL.gpuRatePerMinuteUsd).toBe("number");
    expect(typeof COST_MODEL.baseSecondsPerJob).toBe("number");
    expect(typeof COST_MODEL.secondsPerKSample).toBe("number");
  });
});

describe("countJobs (BATCH-05: stone-type never multiplies)", () => {
  it("= angle × metal × pass", () => {
    expect(countJobs({ angleCount: 4, metalCount: 3, passCount: 3 })).toBe(36);
    expect(countJobs({ angleCount: 1, metalCount: 1, passCount: 1 })).toBe(1);
  });

  it("ignores a stoneTypeCount field — it does NOT multiply the count", () => {
    const base = countJobs({ angleCount: 4, metalCount: 3, passCount: 2 });
    const withStones = countJobs({
      angleCount: 4,
      metalCount: 3,
      passCount: 2,
      stoneTypeCount: 10,
    });
    expect(withStones).toBe(base);
    expect(withStones).toBe(24);
  });
});

describe("zone (BATCH-06 exact edges)", () => {
  it("0 -> idle", () => {
    expect(zone(0)).toBe("idle");
  });
  it("48 -> safe (at SOFT)", () => {
    expect(zone(48)).toBe("safe");
  });
  it("49 -> warn (just over SOFT)", () => {
    expect(zone(49)).toBe("warn");
  });
  it("200 -> warn (at HARD)", () => {
    expect(zone(200)).toBe("warn");
  });
  it("201 -> block (just over HARD)", () => {
    expect(zone(201)).toBe("block");
  });
  it("negative/zero treated as idle", () => {
    expect(zone(-5)).toBe("idle");
  });
});

describe("estimate (monotonic in samples, linear in jobs)", () => {
  it("returns jobs equal to countJobs of the selection", () => {
    const e = estimate({ angleCount: 4, metalCount: 3, passCount: 3, samples: 256 });
    expect(e.jobs).toBe(36);
  });

  it("minutes and cost rise strictly as samples rise", () => {
    const lo = estimate({ angleCount: 2, metalCount: 1, passCount: 1, samples: 64 });
    const mid = estimate({ angleCount: 2, metalCount: 1, passCount: 1, samples: 512 });
    const hi = estimate({ angleCount: 2, metalCount: 1, passCount: 1, samples: 2048 });
    expect(mid.minutes).toBeGreaterThan(lo.minutes);
    expect(hi.minutes).toBeGreaterThan(mid.minutes);
    expect(mid.costUsd).toBeGreaterThan(lo.costUsd);
    expect(hi.costUsd).toBeGreaterThan(mid.costUsd);
  });

  it("scales linearly with jobs (doubling jobs doubles minutes & cost)", () => {
    const one = estimate({ angleCount: 1, metalCount: 1, passCount: 1, samples: 256 });
    const two = estimate({ angleCount: 2, metalCount: 1, passCount: 1, samples: 256 });
    expect(two.minutes).toBeCloseTo(one.minutes * 2, 6);
    expect(two.costUsd).toBeCloseTo(one.costUsd * 2, 6);
  });
});
