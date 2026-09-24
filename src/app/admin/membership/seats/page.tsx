import { getAdminUser } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { day, num, rupees } from '@/lib/admin/format';
import {
  DEPOSIT_LABEL,
  DEPOSIT_TONE,
  MEMBERSHIP_LABEL,
  MEMBERSHIP_TONE,
  type DepositStatusKey,
  type MembershipStatusKey,
} from '@/lib/admin/status';
import { SEATS } from '@/lib/membership';
import { Badge, Card, Empty, PageHeader, StatCard, TableWrap, td, th } from '@/components/admin/ui';
import { ActionForm } from '@/components/admin/action-form';
import { IconCheck, IconClock, IconUser } from '@/components/admin/icons';
import { releaseSeat } from '../actions';

export const metadata = { title: 'Seats' };

export default async function SeatsPage() {
  if (!(await getAdminUser())) return null;

  const memberships = await prisma.membership.findMany({
    orderBy: [
      // Seated families first, by seat. Departed families have no seat to sort
      // by, so they fall to the bottom in the order they left.
      { seatNumber: { sort: 'asc', nulls: 'last' } },
      { leftOn: 'desc' },
    ],
    select: {
      id: true,
      seatNumber: true,
      formerSeatNumber: true,
      status: true,
      depositStatus: true,
      depositPaise: true,
      joinedOn: true,
      leftOn: true,
      customer: {
        select: { fullName: true, email: true, phone: true, _count: { select: { orders: true } } },
      },
    },
  });

  const seated = memberships.filter((m) => m.seatNumber !== null);
  const active = seated.filter((m) => m.status === 'ACTIVE').length;
  const awaiting = seated.filter((m) => m.status === 'PENDING').length;
  const left = memberships.filter((m) => m.seatNumber === null);

  return (
    <>
      <PageHeader
        title="Seats"
        description={`The ${SEATS} founding seats. Releasing a seat returns it to the count for the next family — it does not delete anything.`}
      >
        <a
          href="/admin/membership"
          className="rounded-lg border border-a-line px-3 py-1.5 text-sm text-a-muted transition hover:border-a-gold/40 hover:text-a-text"
        >
          &larr; Enquiries
        </a>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Seats taken"
          value={`${num(seated.length)} / ${SEATS}`}
          hint={<span className="text-xs text-a-muted">{num(SEATS - seated.length)} free</span>}
          icon={<IconUser />}
        />
        <StatCard label="Active" value={num(active)} icon={<IconCheck />} tone="green" />
        <StatCard
          label="Awaiting deposit"
          value={num(awaiting)}
          icon={<IconClock />}
          tone={awaiting ? 'amber' : 'grey'}
        />
        <StatCard
          label="Families who left"
          value={num(left.length)}
          hint={<span className="text-xs text-a-muted">seats returned to the count</span>}
          icon={<IconUser />}
          tone="grey"
        />
      </div>

      <Card title="Members" className="mt-4">
        {memberships.length === 0 ? (
          <Empty title="No seats confirmed yet">
            Seats are created from the enquiries list, once you have spoken to the family.
          </Empty>
        ) : (
          <TableWrap label="Gir Gold Club members">
            <thead>
              <tr>
                <th className={th}>Seat</th>
                <th className={th}>Family</th>
                <th className={th}>Contact</th>
                <th className={th}>Status</th>
                <th className={th}>Deposit</th>
                <th className={th}>Since</th>
                <th className={th}>
                  <span className="sr-only">Release seat</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => {
                const status = m.status as MembershipStatusKey;
                const deposit = m.depositStatus as DepositStatusKey;
                const family = m.customer.fullName?.trim() || '—';
                const gone = m.seatNumber === null;

                return (
                  <tr key={m.id} className={`hover:bg-a-raised/50 ${gone ? 'opacity-70' : ''}`}>
                    <td className={td}>
                      {gone ? (
                        <>
                          <span className="block text-a-muted">—</span>
                          {m.formerSeatNumber !== null && (
                            <span className="text-xs text-a-muted">
                              was {m.formerSeatNumber}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="font-display text-lg text-a-gold">{m.seatNumber}</span>
                      )}
                    </td>

                    <td className={td}>
                      <span className="block text-a-text">{family}</span>
                      <span className="text-xs text-a-muted">
                        {num(m.customer._count.orders)}{' '}
                        {m.customer._count.orders === 1 ? 'order' : 'orders'}
                      </span>
                    </td>

                    <td className={td}>
                      {m.customer.email && (
                        <a
                          className="block text-a-text hover:text-a-gold"
                          href={`mailto:${m.customer.email}`}
                        >
                          {m.customer.email}
                        </a>
                      )}
                      {m.customer.phone && (
                        <a
                          className="block text-xs text-a-muted hover:text-a-gold"
                          href={`tel:${m.customer.phone}`}
                        >
                          {m.customer.phone}
                        </a>
                      )}
                    </td>

                    <td className={td}>
                      <Badge tone={MEMBERSHIP_TONE[status] ?? 'grey'}>
                        {MEMBERSHIP_LABEL[status] ?? m.status}
                      </Badge>
                    </td>

                    <td className={td}>
                      <Badge tone={DEPOSIT_TONE[deposit] ?? 'grey'}>
                        {DEPOSIT_LABEL[deposit] ?? m.depositStatus}
                      </Badge>
                      <span className="mt-1 block text-xs text-a-muted">
                        {rupees(m.depositPaise)}
                      </span>
                    </td>

                    <td className={`${td} whitespace-nowrap text-a-muted`}>
                      {gone
                        ? m.leftOn
                          ? `Left ${day(m.leftOn)}`
                          : 'Left'
                        : m.joinedOn
                          ? day(m.joinedOn)
                          : '—'}
                    </td>

                    <td className={td}>
                      {gone ? (
                        // Not a button that does nothing: say why there is none.
                        <p className="text-right text-xs text-a-muted">Seat returned</p>
                      ) : (
                        <ActionForm
                          action={releaseSeat}
                          submitLabel="Release seat"
                          pendingLabel="Releasing…"
                          tone="danger"
                          className="flex flex-col items-end gap-2"
                          confirm={{
                            title: `Release seat ${m.seatNumber}?`,
                            body: `${family} will be recorded as having left the club and seat ${m.seatNumber} goes back to the ${SEATS} for the next family. Their orders and history are kept, and they can be given a seat again later.`,
                            confirmLabel: 'Release seat',
                          }}
                        >
                          <input type="hidden" name="membershipId" value={m.id} />

                          <label htmlFor={`reason-${m.id}`} className="sr-only">
                            Why {family} is leaving
                          </label>
                          <input
                            id={`reason-${m.id}`}
                            name="reason"
                            type="text"
                            maxLength={300}
                            placeholder="Reason (optional)"
                            className="w-44 rounded-lg border border-a-line bg-a-bg px-2 py-1.5 text-sm text-a-text placeholder:text-a-muted"
                          />

                          {/*
                            Only offered for a deposit that was actually paid.
                            Marking an unpaid one refunded would record money
                            going back that never came in - the action refuses
                            it too, since this checkbox is only markup.
                          */}
                          {deposit === 'PAID' && (
                            <label
                              htmlFor={`refund-${m.id}`}
                              className="flex items-center gap-2 text-xs text-a-muted"
                            >
                              <input
                                id={`refund-${m.id}`}
                                name="refundDeposit"
                                type="checkbox"
                                className="h-4 w-4 accent-a-gold"
                              />
                              {rupees(m.depositPaise)} deposit returned
                            </label>
                          )}
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
