// DATA-03 — post-seed domain assertions against live/test Postgres.
// Runs the seed (idempotent upsert) in beforeAll, then asserts the EXACT
// camera-view / metal / object-group / quality-preset values, the three metal
// swatch hex values, the 1920x1920 resolution invariant, the first Admin user
// (created from SEED_ADMIN_* env with a bcrypt-verifiable hash), and idempotency.
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { seedDomain } from "../prisma/seed";

// Deterministic Admin creds for the test (never depends on real env secrets).
const ADMIN_EMAIL = "seed-domain-test-admin@example.com";
const ADMIN_PASSWORD = "Sup3r-Secret-Seed-Pw!";

beforeAll(async () => {
  process.env.SEED_ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.SEED_ADMIN_PASSWORD = ADMIN_PASSWORD;
  // Run the seed twice up front to prove idempotency does not duplicate rows.
  await seedDomain();
  await seedDomain();
}, 60_000); // remote Railway round-trips + bcrypt(12) exceed the default 10s hook timeout

afterAll(async () => {
  await prisma.$disconnect();
});

describe("DATA-03 domain seed", () => {
  it("creates exactly 4 camera views with the exact az/el/focal/fStop", async () => {
    const count = await prisma.cameraView.count();
    expect(count).toBe(4);

    const view1 = await prisma.cameraView.findUnique({ where: { key: "view1" } });
    expect(view1).toMatchObject({ azimuth: 30, elevation: 25, focalMm: 187.5, fStop: 2.8 });

    const view2 = await prisma.cameraView.findUnique({ where: { key: "view2" } });
    expect(view2).toMatchObject({ azimuth: 180, elevation: 15, focalMm: 187.5, fStop: 2.8 });

    const view3 = await prisma.cameraView.findUnique({ where: { key: "view3" } });
    expect(view3).toMatchObject({ azimuth: -30, elevation: 10, focalMm: 50, fStop: 2.8 });

    const view4 = await prisma.cameraView.findUnique({ where: { key: "view4" } });
    expect(view4).toMatchObject({ azimuth: 0, elevation: 75, focalMm: 187.5, fStop: 2.8 });
  });

  it("creates exactly 3 metals with the EXACT swatch hex per key", async () => {
    const count = await prisma.metal.count();
    expect(count).toBe(3);

    const white = await prisma.metal.findUnique({ where: { key: "white" } });
    const yellow = await prisma.metal.findUnique({ where: { key: "yellow" } });
    const red = await prisma.metal.findUnique({ where: { key: "red" } });

    expect(white?.hex).toBe("#C4C4C4");
    expect(yellow?.hex).toBe("#FFC356");
    expect(red?.hex).toBe("#E09973");
  });

  it("creates exactly 4 object groups with sortOrder 0..3", async () => {
    const groups = await prisma.objectGroup.findMany({ orderBy: { sortOrder: "asc" } });
    expect(groups.map((g) => g.key)).toEqual(["alloycolour", "diamond", "stone2", "stone3"]);
    expect(groups.map((g) => g.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it("creates exactly 4 quality presets at 1920x1920 with the exact sample counts", async () => {
    const presets = await prisma.qualityPreset.findMany();
    expect(presets).toHaveLength(4);

    const byKey = Object.fromEntries(presets.map((p) => [p.key, p]));
    expect(byKey.preview.samples).toBe(64);
    expect(byKey.medium.samples).toBe(256);
    expect(byKey.high.samples).toBe(512);
    expect(byKey.ultra.samples).toBe(2048);

    for (const p of presets) {
      expect(p.width).toBe(1920);
      expect(p.height).toBe(1920);
    }
  });

  it("creates a first Admin user from SEED_ADMIN_* with a bcrypt-verifiable hash", async () => {
    const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    expect(admin).not.toBeNull();
    expect(admin?.role).toBe("Admin");
    const ok = await bcrypt.compare(ADMIN_PASSWORD, admin!.passwordHash);
    expect(ok).toBe(true);
  });

  it("is idempotent: re-running the seed does not duplicate rows", async () => {
    await seedDomain();
    expect(await prisma.cameraView.count()).toBe(4);
    expect(await prisma.metal.count()).toBe(3);
    expect(await prisma.objectGroup.count()).toBe(4);
    expect(await prisma.qualityPreset.count()).toBe(4);
    expect(await prisma.user.count({ where: { email: ADMIN_EMAIL } })).toBe(1);
  }, 30_000);
});
