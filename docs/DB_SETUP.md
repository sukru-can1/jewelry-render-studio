# Database Setup (Prisma + Railway Postgres)

Phase-1 data substrate: Prisma 6 against Railway Postgres 16, with a
serverless-safe pooled topology and a one-shot domain seed. This document
covers the URL split, migration/seed commands, and the rules that keep the
connection pool healthy on Vercel serverless.

> No secrets appear in this document. The real values live only in `.env` /
> `.env.local` (gitignored) and in Vercel project env. Never commit them.

## Connection URLs: pooled vs. direct

Two env vars drive every database interaction. They are intentionally different
connections:

| Env var | Used by | Shape |
|---------|---------|-------|
| `DATABASE_URL` | **App runtime** (every Prisma query via the singleton) | Pooled connection. Constrain the per-instance budget — `?pgbouncer=true&connection_limit=1` is the canonical serverless setting; a small `connection_limit` (and optional `pool_timeout`) keeps many concurrent function invocations from exhausting Postgres. |
| `DIRECT_URL` | **Migrations only** (`prisma migrate dev` / `prisma migrate deploy`) | Direct connection. Migrations issue DDL + prepared statements that a transaction-mode pooler breaks. |

`prisma/schema.prisma` wires both:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")  // pooled — app traffic
  directUrl = env("DIRECT_URL")    // direct — migrations only
}
```

### The migration-URL rule (do not break)

**Never run a migration over the pooled `DATABASE_URL`.** Migrating across a
transaction-mode pooler corrupts prepared statements and can fail mid-DDL.
Prisma automatically uses `directUrl` for migrate commands when `directUrl` is
set — keep it set, and never point `migrate dev`/`migrate deploy` at the pooled
URL manually.

## Prisma client singleton (DATA-02)

`lib/db/prisma.ts` caches a single `PrismaClient` on `globalThis` (outside
production) so dev hot-reload and repeated module evaluation do not open a new
pool each time. **All** app code imports `prisma` from this module — never
`new PrismaClient()` ad hoc. Combined with `connection_limit=1` on the pooled
URL, this is what prevents `P2024: Timed out fetching a connection` /
"too many connections" under concurrent serverless invocations.

The `test/prisma-pool.test.ts` suite proves this: it fires 25 concurrent queries
through the singleton and asserts all resolve with no pool exhaustion.

## Commands

### Migrations

```bash
# Local development — create + apply a new migration (uses DIRECT_URL):
npx prisma migrate dev --name <change-name>

# Production / CI — apply already-created migrations (no schema diffing):
npx prisma migrate deploy

# Inspect drift / pending migrations:
npx prisma migrate status
```

`migrate deploy` runs automatically in the build (`package.json` →
`"build": "prisma generate && prisma migrate deploy && next build"`), so a
Vercel deploy applies pending migrations before the app boots.

> Do **not** use `prisma db push` against production — it skips the migration
> history. Use `migrate dev` (local) / `migrate deploy` (prod).

### Seeding domain settings (DATA-03)

```bash
npx prisma db seed     # runs tsx prisma/seed.ts (idempotent upsert)
```

`prisma/seed.ts` upserts the domain settings by unique `key`, so re-running
converges to the same state (no duplicate rows):

- 4 camera views, 3 metals (with swatch hex), 4 object groups, 4 quality
  presets — all presets at **1920×1920**.

### First Admin bootstrap (env-driven, never hardcoded)

The seed creates the first Admin **only** when both env vars are set:

```bash
SEED_ADMIN_EMAIL=...        # the Admin login email
SEED_ADMIN_PASSWORD=...     # plaintext; hashed with bcrypt(12) before storage
```

If they are unset, the seed logs a notice and skips the Admin (domain settings
still seed). Credentials are never committed or defaulted in code.

## Verification

```bash
npx prisma migrate status          # expect: database up to date
npx prisma db seed                 # idempotent domain seed
npx vitest run seed-domain         # exact values + metal hex + 1920x1920 + Admin
npx vitest run prisma-pool         # 25 concurrent queries, no P2024
```
