// INTEL (09-01 Task 4) — T-09-MIG: the add_job_intel migration is PROVABLY
// additive. Source-text assertion over the newest migration.sql (mirrors the
// Phase 4/5 additive-migration discipline): it may only ADD columns — no DROP,
// no RENAME, no retroactive NOT NULL on existing columns. Existing Job rows keep
// intelState/intel null and behave exactly as today; existing Batch rows get
// optimizeWithAi=false (the G9 kill-switch default).
//
// Also locks the createBatchSchema contract: optimizeWithAi is OPTIONAL and
// defaults to false (the per-batch opt-in crossing the Server-Action boundary).
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createBatchSchema } from "@/lib/validation/batch";

const MIGRATIONS_DIR = resolve(process.cwd(), "prisma", "migrations");

function newestMigrationSql(): { name: string; sql: string } {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(); // timestamp-prefixed -> lexicographic == chronological
  const newest = dirs[dirs.length - 1];
  const sql = readFileSync(join(MIGRATIONS_DIR, newest, "migration.sql"), "utf8");
  return { name: newest, sql };
}

describe("add_job_intel migration — additive-only (T-09-MIG)", () => {
  const { name, sql } = newestMigrationSql();

  it("is the add_job_intel migration", () => {
    expect(name).toMatch(/add_job_intel$/);
  });

  it('ADDs the two nullable intelligence columns to "Job"', () => {
    expect(sql).toMatch(/ALTER TABLE "Job" ADD COLUMN/);
    expect(sql).toMatch(/"intelState" TEXT/);
    expect(sql).toMatch(/"intel" JSONB/);
    // Nullable: neither intel column may carry NOT NULL.
    expect(sql).not.toMatch(/"intelState" TEXT NOT NULL/);
    expect(sql).not.toMatch(/"intel" JSONB NOT NULL/);
  });

  it('ADDs the optimizeWithAi kill-switch to "Batch" with DEFAULT false (G9)', () => {
    expect(sql).toMatch(
      /ALTER TABLE "Batch" ADD COLUMN\s+"optimizeWithAi" BOOLEAN NOT NULL DEFAULT false/,
    );
  });

  it("contains NO destructive statements (drop/rename/retroactive NOT NULL)", () => {
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/RENAME/i);
    // Retroactive NOT NULL on an EXISTING column (ALTER COLUMN ... SET NOT NULL)
    // is forbidden; ADD COLUMN ... NOT NULL DEFAULT is additive-safe and allowed.
    expect(sql).not.toMatch(/ALTER COLUMN[^;]*SET NOT NULL/i);
  });

  it("touches nothing beyond ALTER TABLE ADD COLUMN statements", () => {
    const statements = sql
      .split(";")
      .map((statement) =>
        statement
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .trim(),
      )
      .filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(/^ALTER TABLE "(Job|Batch)" ADD COLUMN/);
    }
  });
});

describe("createBatchSchema.optimizeWithAi — optional, default false (G9)", () => {
  const validSelection = {
    productId: "prod_1",
    angleViewKeys: ["view-hero"],
    metalKeys: ["white"],
    stoneTypeByGroup: { diamond: "diamond" },
    passes: ["metal", "diamond"],
    qualityKey: "final",
  };

  it("absent -> parses with optimizeWithAi === false", () => {
    const parsed = createBatchSchema.parse(validSelection);
    expect(parsed.optimizeWithAi).toBe(false);
  });

  it("explicit true is accepted", () => {
    const parsed = createBatchSchema.parse({ ...validSelection, optimizeWithAi: true });
    expect(parsed.optimizeWithAi).toBe(true);
  });

  it("explicit false is accepted", () => {
    const parsed = createBatchSchema.parse({ ...validSelection, optimizeWithAi: false });
    expect(parsed.optimizeWithAi).toBe(false);
  });

  it("a non-boolean is rejected at the boundary", () => {
    expect(() =>
      createBatchSchema.parse({ ...validSelection, optimizeWithAi: "yes" }),
    ).toThrow();
  });
});
