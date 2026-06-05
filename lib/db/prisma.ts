import { PrismaClient } from "@prisma/client";

// Serverless-safe singleton (DATA-02): one PrismaClient cached on globalThis so
// hot-reload / repeated module evaluation in dev does not exhaust the connection
// pool. Only attach to globalThis outside production.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
