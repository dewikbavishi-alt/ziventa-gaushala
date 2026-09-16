import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * What this deployment actually has wired up.
 *
 * Reports only whether each setting is PRESENT - never a value, never a key,
 * never a connection string. That makes it safe to leave public, and it turns
 * "is the email key live yet?" into a one-second check instead of a guess.
 *
 * Deliberately no-store: a cached answer would report yesterday's deployment.
 */
export const dynamic = 'force-dynamic';

const present = (v: string | undefined) => Boolean(v && v.trim().length > 0);

export async function GET() {
  let database = 'down';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'up';
  } catch {
    database = 'down';
  }

  const body = {
    status: database === 'up' ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    checks: {
      database,
      // Email: configured means RESEND_API_KEY is set on THIS deployment.
      email: present(process.env.RESEND_API_KEY) ? 'configured' : 'not-configured',
      emailTo: present(process.env.MAIL_TO) ? 'set' : 'using default',
      // How many addresses can reach /admin. A count, not the addresses.
      adminAccounts: (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean).length,
      supabase: present(process.env.NEXT_PUBLIC_SUPABASE_URL) ? 'configured' : 'not-configured',
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? '(not set)',
    },
  };

  return NextResponse.json(body, {
    status: database === 'up' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
