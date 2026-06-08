// DATA-04 prerequisite — post-seed StoneType assertions against live/test Postgres.
// StoneType was never seeded in Phase 1 (Pitfall 6), so the Admin "Stone types"
// editor would have edited an empty table. This test runs the seed (idempotent
// upsert) and asserts: diamond is present, at least 8 canonical rows exist, and
// re-running the seed does not double the count (idempotency).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { seedDomain } from "../prisma/seed";

beforeAll(async () => {
  // Run the seed twice up front to prove idempotency does not duplicate rows.
  await seedDomain();
  await seedDomain();
}, 60_000); // remote Railway round-trips exceed the default 10s hook timeout

afterAll(async () => {
  await prisma.$disconnect();
});

describe("DATA-04 StoneType seed", () => {
  it("seeds the canonical diamond row", async () => {
    const diamond = await prisma.stoneType.findUnique({ where: { key: "diamond" } });
    expect(diamond).not.toBeNull();
    expect(diamond?.label).toBe("Diamond");
    expect(diamond?.preset).toMatchObject({ type: "diamond" });
  });

  it("seeds at least 8 canonical StoneType rows", async () => {
    const count = await prisma.stoneType.count();
    expect(count).toBeGreaterThanOrEqual(8);
  });

  it("is idempotent: re-running the seed does not double the StoneType count", async () => {
    const before = await prisma.stoneType.count();
    await seedDomain();
    const after = await prisma.stoneType.count();
    expect(after).toBe(before);
  }, 30_000);
});
