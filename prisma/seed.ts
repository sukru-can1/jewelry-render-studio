// DATA-03 domain seed + first Admin bootstrap.
//
// Run standalone:  npx prisma db seed   (package.json -> tsx prisma/seed.ts)
// Re-export:       seedDomain() is imported by test/seed-domain.test.ts.
//
// All domain rows are upserted by their unique `key`, so re-running is
// idempotent (no duplicate rows). The first Admin is created ONLY from
// process.env.SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD — credentials are never
// hardcoded (T-1-SEED). Metal.hex uses the canonical Phase-1 swatch values
// derived from the domain RGB triples (UI-SPEC §4 does not publish raw hex):
//   white  (0.77, 0.77, 0.77)  -> #C4C4C4
//   yellow (1.0,  0.766, 0.336) -> #FFC356
//   red    (0.88, 0.60, 0.45)  -> #E09973
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db/prisma";

const cameraViews = [
  { key: "view1", label: "View 1", azimuth: 30, elevation: 25, focalMm: 187.5, fStop: 2.8 },
  { key: "view2", label: "View 2", azimuth: 180, elevation: 15, focalMm: 187.5, fStop: 2.8 },
  { key: "view3", label: "View 3", azimuth: -30, elevation: 10, focalMm: 50.0, fStop: 2.8 },
  { key: "view4", label: "View 4", azimuth: 0, elevation: 75, focalMm: 187.5, fStop: 2.8 },
];

const metals = [
  { key: "white", label: "White Gold / Platinum", hex: "#C4C4C4" },
  { key: "yellow", label: "18K Yellow Gold", hex: "#FFC356" },
  { key: "red", label: "Rose Gold", hex: "#E09973" },
];

const objectGroups = ["alloycolour", "diamond", "stone2", "stone3"].map((k, i) => ({
  key: k,
  label: k,
  sortOrder: i,
}));

const qualityPresets = [
  { key: "preview", label: "Preview", samples: 64, width: 1920, height: 1920 },
  { key: "medium", label: "Medium", samples: 256, width: 1920, height: 1920 },
  { key: "high", label: "High", samples: 512, width: 1920, height: 1920 },
  // PROJECT.md: ultra 2048–4096; default to 2048 (Admin-editable in Phase 2).
  { key: "ultra", label: "Ultra", samples: 2048, width: 1920, height: 1920 },
];

/**
 * Seed the DATA-03 domain settings and the first Admin user. Idempotent: every
 * row is upserted by its unique `key`/`email`, so calling this repeatedly
 * converges to the same state without duplicating rows.
 */
export async function seedDomain(): Promise<void> {
  for (const v of cameraViews) {
    await prisma.cameraView.upsert({ where: { key: v.key }, update: v, create: v });
  }
  for (const m of metals) {
    await prisma.metal.upsert({ where: { key: m.key }, update: m, create: m });
  }
  for (const g of objectGroups) {
    await prisma.objectGroup.upsert({ where: { key: g.key }, update: g, create: g });
  }
  for (const q of qualityPresets) {
    await prisma.qualityPreset.upsert({ where: { key: q.key }, update: q, create: q });
  }

  // First Admin — env-driven only, never a hardcoded credential (T-1-SEED).
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      // Do NOT rotate the hash on re-seed (idempotent); only create if absent.
      update: {},
      create: { email, passwordHash, role: "Admin" },
    });
  } else {
    console.warn(
      "[seed] SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set — skipping first-Admin bootstrap.",
    );
  }
}

// CLI entry: `prisma db seed` / `tsx prisma/seed.ts`.
// Guarded so importing this module (e.g. from the test) does not self-run.
const isDirectRun = (() => {
  const entry = process.argv[1];
  return typeof entry === "string" && /seed\.(ts|js|mjs|cjs)$/.test(entry);
})();

if (isDirectRun) {
  seedDomain()
    .then(() => {
      console.log("[seed] DATA-03 domain seed complete.");
    })
    .catch((err) => {
      console.error("[seed] failed:", err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
