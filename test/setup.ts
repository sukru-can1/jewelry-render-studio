// Vitest global setup (Wave 0). Import-safe: no live DB connection opens here.
// Integration tests that need a live Postgres are gated in Plan 02.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { prisma } from "@/lib/db/prisma";

/**
 * Dependency-free .env loader so the test harness has no undeclared package
 * dependency. Loads `.env.local` (live pooled DATABASE_URL/DIRECT_URL/AUTH_SECRET)
 * then `.env`, without overwriting variables already present in the environment.
 */
function loadEnvFile(file: string): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

/**
 * Shared session stub for RBAC/admin tests in later waves.
 */
export function fakeSession(role: "Admin" | "Operator") {
  return {
    user: {
      id: `test-${role.toLowerCase()}-id`,
      email: `${role.toLowerCase()}@example.com`,
      role,
    },
  };
}

/**
 * Prisma test-client accessor — re-exports the app singleton. Tests that need a
 * live DB are gated in Plan 02; this opens no connection at module load.
 */
export const testPrisma = prisma;
