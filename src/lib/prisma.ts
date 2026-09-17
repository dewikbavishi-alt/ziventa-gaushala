import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Prisma 7 requires a driver adapter rather than a bare connection string.
 * PrismaPg wraps node-postgres, which is what lets this run unchanged on
 * Vercel's serverless runtime and on a long-lived Node process.
 *
 * DATABASE_URL must be Supabase's TRANSACTION POOLER (port 6543) with
 * `pgbouncer=true`. Migrations use DIRECT_URL instead - see prisma7.config.ts.
 */
/**
 * Placeholder used only so the module can be constructed when DATABASE_URL is
 * absent. Nothing can connect through it - any query fails at request time
 * with a clear error, which is the correct behaviour.
 *
 * This exists because `next build` loads every route to collect its config. If
 * this module throws on import, the BUILD fails and no deployment is produced
 * at all - so one missing variable takes the whole site offline rather than
 * degrading one feature. That is exactly what happened: builds died with
 * "Failed to collect page data for /api/products".
 */
const UNCONFIGURED = 'postgresql://unset:unset@127.0.0.1:1/unset';

export const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL?.trim() || UNCONFIGURED;

  if (!databaseConfigured) {
    // Loud in the log, but does not stop the build or the rest of the site.
    console.error(
      'DATABASE_URL is not set. Database features will fail until it is configured in the hosting environment.',
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/**
 * One client per process, cached on globalThis.
 *
 * Without this, Next's dev-mode hot reload would build a new client (and a new
 * connection pool) on every file save and exhaust Postgres connections within
 * a few minutes.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
