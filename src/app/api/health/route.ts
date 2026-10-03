import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { smtpConfigured } from '@/lib/email';
import { isAdmin } from '@/lib/admin';
import { razorpayConfigured, razorpayIsLive } from '@/lib/payments/razorpay';

/**
 * What this deployment actually has wired up.
 *
 * Anyone gets the headline - "ok" or "degraded" - which is all an uptime
 * monitor needs. The details are for the owner only: open this URL in a
 * browser that is signed in to the admin dashboard.
 *
 * The details never include a key, a password or a connection string, but
 * they did name the mail server, the From address and how many admin
 * accounts exist - the kind of thing that helps someone plan an attack, so
 * they are no longer public.
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

  const status = database === 'up' ? 'ok' : 'degraded';
  const httpStatus = database === 'up' ? 200 : 503;
  const headers = { 'Cache-Control': 'no-store' };

  if (!(await isAdmin())) {
    return NextResponse.json({ status, time: new Date().toISOString() }, { status: httpStatus, headers });
  }

  const body = {
    status,
    time: new Date().toISOString(),
    checks: {
      database,
      // Email: configured means host, user and password are all set on THIS
      // deployment. The host is named because it is not a secret and it is the
      // fastest way to see which mail server a deployment is actually using.
      email: smtpConfigured() ? 'configured' : 'not-configured',
      emailHost: process.env.SMTP_HOST ?? '(not set)',
      emailFrom: process.env.MAIL_FROM ?? '(using default)',
      emailTo: present(process.env.MAIL_TO) ? 'set' : 'using default',
      // How many addresses can reach /admin. A count, not the addresses.
      adminAccounts: (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean).length,
      supabase: present(process.env.NEXT_PUBLIC_SUPABASE_URL) ? 'configured' : 'not-configured',
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? '(not set)',
      payments: razorpayConfigured() ? (razorpayIsLive() ? 'live' : 'test') : 'not-configured',
      paymentsWebhook: present(process.env.RAZORPAY_WEBHOOK_SECRET) ? 'set' : 'not-set',
    },
  };

  return NextResponse.json(body, { status: httpStatus, headers });
}
