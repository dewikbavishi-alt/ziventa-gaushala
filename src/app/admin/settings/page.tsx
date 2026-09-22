import { getAdminUser, ownerEmail } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { smtpConfigured } from '@/lib/email';
import { Badge, Card, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const me = await getAdminUser();
  if (!me) return null;

  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

  /**
   * What the deployment has, as yes/no only. Never a value: this page is
   * owner-only, but a key does not belong on a screen someone might share.
   */
  const checks: [string, boolean, string][] = [
    ['Database', dbOk, dbOk ? 'Connected' : 'Not reachable'],
    [
      'Email sending',
      smtpConfigured(),
      smtpConfigured() ? `Via ${process.env.SMTP_HOST}` : 'SMTP not configured',
    ],
    ['Payment gateway', false, 'Not connected - payments are recorded by hand'],
    ['Visitor counting', true, 'First-party, no cookies or third parties'],
  ];

  return (
    <>
      <PageHeader title="Settings" description="Who can use this dashboard, and what the shop is connected to." />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Dashboard access">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-a-line p-4">
            <span className="min-w-0">
              <span className="block text-xs text-a-muted">Owner</span>
              <span className="block truncate text-a-text">{ownerEmail()}</span>
            </span>
            <Badge tone="green">Only account with access</Badge>
          </div>

          <p className="mt-4 text-sm text-a-muted">
            This dashboard belongs to one person. Nobody else can be given access from here - there is
            no admin role and no way to add one.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-a-muted">
            <li>
              &middot; Access is set by <code className="text-a-text">ADMIN_EMAILS</code> in Vercel, which
              must hold exactly one address.
            </li>
            <li>&middot; If it ever lists two or more, nobody can sign in until it is fixed.</li>
            <li>&middot; The account must have a verified email address.</li>
          </ul>
        </Card>

        <Card title="Connections">
          <ul className="divide-y divide-a-line">
            {checks.map(([label, ok, detail]) => (
              <li key={label} className="flex items-center justify-between gap-3 py-3">
                <span>
                  <span className="block text-a-text">{label}</span>
                  <span className="text-xs text-a-muted">{detail}</span>
                </span>
                <Badge tone={ok ? 'green' : 'amber'}>{ok ? 'OK' : 'Not set up'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
