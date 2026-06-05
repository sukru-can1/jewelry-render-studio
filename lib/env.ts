import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, fail-fast environment access (SEC-01 / T-1-CONFIG-01).
 *
 * A missing required secret throws at import time via createEnv's zod validation
 * instead of letting the app run degraded. Never read these via process.env
 * directly elsewhere — import `env` so the schema is the single source of truth.
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    RUNPOD_API_KEY: z.string().min(1),
    RUNPOD_ENDPOINT_ID: z.string().min(1),
    BLOB_READ_WRITE_TOKEN: z.string().min(1),
    RUNPOD_WEBHOOK_SECRET: z.string().min(1),
    // Optional: only present when bootstrapping the first Admin via the seed.
    SEED_ADMIN_EMAIL: z.string().min(1).optional(),
    SEED_ADMIN_PASSWORD: z.string().min(1).optional(),
  },
  client: {},
  // Next.js only inlines NEXT_PUBLIC_* at build; server vars are read at runtime.
  experimental__runtimeEnv: {},
});
