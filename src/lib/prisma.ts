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
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and fill in the Supabase connection strings.',
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
