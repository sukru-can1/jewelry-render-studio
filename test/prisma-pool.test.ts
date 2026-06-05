// DATA-02 — the pooled singleton must survive concurrency without exhausting
// the connection budget. Fire N concurrent trivial queries through the SAME
// lib/db/prisma.ts singleton and assert every one resolves with no P2024
// ("Timed out fetching a connection") or "too many connections" error. This
// proves the singleton + pooled DATABASE_URL topology holds (T-1-DATA-02).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";

const CONCURRENCY = 25;

beforeAll(async () => {
  // Warm the remote (Railway can cold-start after idle) so the concurrent
  // assertions below measure pool behavior, not the one-off connection-
  // establishment cost. Retry the warm-up to absorb a slow cold start; a P2024
  // here would still surface from the concurrent tests, not be hidden.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      if (attempt === 5) throw err;
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
}, 90_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("DATA-02 Prisma pool health under concurrency", () => {
  it(`resolves ${CONCURRENCY} concurrent queries with no P2024 / pool exhaustion`, async () => {
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`),
    );

    expect(results).toHaveLength(CONCURRENCY);
    for (const r of results) {
      expect(r[0]?.ok).toBe(1);
    }
  }, 30_000);

  it(`resolves ${CONCURRENCY} concurrent model reads through the same singleton`, async () => {
    const counts = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => prisma.cameraView.count()),
    );

    expect(counts).toHaveLength(CONCURRENCY);
    // Every concurrent read sees the seeded 4 camera views — no dropped/errored query.
    for (const c of counts) {
      expect(c).toBe(4);
    }
  }, 30_000);
});
