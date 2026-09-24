import { getAdminUser } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { day, num, pct } from '@/lib/admin/format';
import { LEAD_STATUSES, LEAD_TONE, type LeadStatusKey } from '@/lib/admin/status';
import { Badge, Card, Empty, PageHeader, StatCard, TableWrap, td, th } from '@/components/admin/ui';
import { ActionForm } from '@/components/admin/action-form';
import { IconCheck, IconClock, IconUser, IconVisitors } from '@/components/admin/icons';
import { approveMembership, updateLeadStatus } from './actions';

export const metadata = { title: 'Gir Gold Club' };

/** The founding membership is capped here and by a CHECK in the database. */
const SEATS = 250;

export default async function MembershipPage() {
  if (!(await getAdminUser())) return null;

  const [leads, byStatus, members, seated] = await Promise.all([
    prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.membership.count(),
    /**
     * Who actually holds a seat, by email.
     *
     * Whether to offer "Confirm seat" is decided on this rather than on the
     * lead's status. Status is a label someone sets by hand, and marking an
     * enquiry "converted" was how seats were recorded before this button
     * existed - so gating on it hid the button from families who had been
     * labelled converted but never given a seat, which is exactly the state
     * three of these were in.
     */
    prisma.membership.findMany({ select: { seatNumber: true, customer: { select: { email: true } } } }),
  ]);

  const seatByEmail = new Map(
    seated
      .filter((m) => m.customer.email)
      .map((m) => [m.customer.email!.toLowerCase(), m.seatNumber]),
  );

  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const total = byStatus.reduce((n, b) => n + b._count._all, 0);
  const conversion = total ? (count('converted') / total) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Gir Gold Club"
        description="Founding membership enquiries and seats. Every family is spoken to before a seat is confirmed."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Seats taken"
          value={`${num(members)} / ${SEATS}`}
          hint={<span className="text-xs text-a-muted">{num(SEATS - members)} left</span>}
          icon={<IconUser />}
        />
        <StatCard label="Enquiries" value={num(total)} icon={<IconVisitors />} tone="blue" />
        <StatCard
          label="Waiting for a call"
          value={num(count('new'))}
          icon={<IconClock />}
          tone={count('new') ? 'amber' : 'grey'}
        />
        <StatCard
          label="Converted"
          value={num(count('converted'))}
          hint={<span className="text-xs text-a-muted">{pct(conversion)} of enquiries</span>}
          icon={<IconCheck />}
          tone="green"
        />
      </div>

      <Card title="Enquiries" className="mt-4">
        {leads.length === 0 ? (
          <Empty title="No enquiries yet">They arrive from the Reserve Your Membership form.</Empty>
        ) : (
          <TableWrap label="Membership enquiries">
            <thead>
              <tr>
                <th className={th}>Family</th>
                <th className={th}>Contact</th>
                <th className={th}>City</th>
                <th className={th}>Received</th>
                <th className={th}>Status</th>
                <th className={th}>
                  <span className="sr-only">Update</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const status = (LEAD_STATUSES as readonly string[]).includes(l.status)
                  ? (l.status as LeadStatusKey)
                  : 'new';
                return (
                  <tr key={l.id} className="hover:bg-a-raised/50">
                    <td className={td}>
                      <span className="block text-a-text">{l.fullName}</span>
                      {l.reference && <span className="text-xs text-a-gold">{l.reference}</span>}
                    </td>
                    <td className={td}>
                      <a className="block text-a-text hover:text-a-gold" href={`mailto:${l.email}`}>
                        {l.email}
                      </a>
                      {l.phone && (
                        <a className="block text-xs text-a-muted hover:text-a-gold" href={`tel:${l.phone}`}>
                          {l.phone}
                        </a>
                      )}
                    </td>
                    <td className={`${td} text-a-muted`}>{l.city ?? '—'}</td>
                    <td className={`${td} whitespace-nowrap text-a-muted`}>{day(l.createdAt)}</td>
                    <td className={td}>
                      <Badge tone={LEAD_TONE[status]}>{status}</Badge>
                    </td>
                    <td className={td}>
                      <ActionForm
                        action={updateLeadStatus}
                        submitLabel="Update"
                        tone="quiet"
                        className="flex items-center justify-end gap-2"
                      >
                        <input type="hidden" name="leadId" value={l.id} />
                        <label htmlFor={`lead-${l.id}`} className="sr-only">
                          Status for {l.fullName}
                        </label>
                        <select
                          id={`lead-${l.id}`}
                          name="status"
                          defaultValue={status}
                          className="rounded-lg border border-a-line bg-a-bg px-2 py-1.5 text-sm text-a-text"
                        >
                          {LEAD_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </ActionForm>

                      {/*
                        Confirming a seat is a different kind of act from moving a
                        status along: it creates a membership, takes one of the 250
                        seats, and emails the family a link to pay. Its own button so
                        it cannot happen by nudging a dropdown, and hidden once the
                        enquiry is converted or declined so it is never offered twice.
                      */}
                      {seatByEmail.has(l.email.toLowerCase()) ? (
                        // Say which seat, rather than showing nothing. A button
                        // that is simply absent looks like a fault.
                        <p className="mt-2 text-right text-xs text-a-muted">
                          Holds seat {seatByEmail.get(l.email.toLowerCase())}
                        </p>
                      ) : status === 'declined' ? null : (
                        <ActionForm
                          action={approveMembership}
                          submitLabel="Confirm seat"
                          className="mt-2 flex items-center justify-end"
                          confirm={{
                            title: 'Confirm this seat?',
                            body: `${l.fullName} will be given one of the 250 seats and emailed a link to pay the Rs 5,000 refundable deposit.`,
                            confirmLabel: 'Confirm seat',
                          }}
                        >
                          <input type="hidden" name="leadId" value={l.id} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
