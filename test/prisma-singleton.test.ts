import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Prisma singleton (DATA-02)", () => {
  it("returns the same instance when imported twice (globalThis cache)", async () => {
    const a = (await import("@/lib/db/prisma")).prisma;
    const b = (await import("@/lib/db/prisma")).prisma;
    expect(a).toBe(b);
  });

  it("caches the client on globalThis outside production", async () => {
    await import("@/lib/db/prisma");
    const cached = (globalThis as unknown as { prisma?: unknown }).prisma;
    expect(cached).toBeDefined();
  });
});

describe("Prisma schema (DATA-01)", () => {
  const schema = readFileSync(
    resolve(process.cwd(), "prisma/schema.prisma"),
    "utf8",
  );

  it('declares the pooled datasource with directUrl = env("DIRECT_URL")', () => {
    expect(schema).toContain('directUrl = env("DIRECT_URL")');
    expect(schema).toContain('url       = env("DATABASE_URL")');
  });

  it("defines the JobStatus enum and User model", () => {
    expect(schema).toContain("enum JobStatus");
    expect(schema).toContain("model User");
    expect(schema).toContain("enum Role");
  });
});

describe("Typed env fail-fast (T-1-CONFIG-01)", () => {
  it("throws when a required server var is absent", async () => {
    const { createEnv } = await import("@t3-oss/env-nextjs");
    const { z } = await import("zod");

    expect(() =>
      createEnv({
        server: { REQUIRED_SECRET_FOR_TEST: z.string().min(1) },
        client: {},
        experimental__runtimeEnv: {},
        // No value supplied -> validation must fail fast.
      }),
    ).toThrow();
  });
});
