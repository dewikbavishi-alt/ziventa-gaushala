import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

/**
 * Next.js reads .env.local; the Prisma CLI does not. Load it explicitly so
 * `prisma migrate` and `prisma studio` see the same values the app does.
 * .env is loaded second as a fallback and will not override .env.local.
 */
loadEnv({ path: '.env.local' });
loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    /**
     * Migrations must go over the DIRECT connection (port 5432).
     * `prisma migrate` takes advisory locks and runs DDL, and Supabase's
     * transaction pooler on 6543 supports neither - it fails with confusing
     * "prepared statement already exists" errors.
     *
     * The application itself uses the pooled DATABASE_URL at runtime; see
     * src/lib/prisma.ts.
     */
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
});
