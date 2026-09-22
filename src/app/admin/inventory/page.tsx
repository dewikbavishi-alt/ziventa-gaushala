import { getAdminUser } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { productCounts, stockState } from '@/lib/admin/queries';
import { num, rupees } from '@/lib/admin/format';
import { Badge, Card, PageHeader, StatCard } from '@/components/admin/ui';
import { ActionForm } from '@/components/admin/action-form';
import { IconAlert, IconCheck, IconStack } from '@/components/admin/icons';
import { updateStock } from './actions';

export const metadata = { title: 'Inventory' };

const input =
  'w-full rounded-xl border border-a-line bg-a-bg px-3 py-2 text-sm tabular-nums text-a-text';

export default async function InventoryPage() {
  if (!(await getAdminUser())) return null;

  const [counts, products] = await Promise.all([
    productCounts(),
    prisma.product.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        sizeLabel: true,
        pricePaise: true,
        stockCount: true,
        lowStockThreshold: true,
        isActive: true,
      },
    }),
  ]);

  // Most urgent first: out of stock, then low, then everything else.
  const rank = { out: 0, low: 1, in: 2, untracked: 3 } as const;
  const sorted = [...products].sort(
    (a, b) =>
      rank[stockState(a.stockCount, a.lowStockThreshold)] - rank[stockState(b.stockCount, b.lowStockThreshold)],
  );

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock levels and low-stock warnings. Leave stock blank for a product you do not count."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Units in stock" value={num(counts.inventory)} icon={<IconStack />} />
        <StatCard label="Available" value={num(counts.available)} icon={<IconCheck />} tone="green" />
        <StatCard label="Low stock" value={num(counts.lowStock)} icon={<IconAlert />} tone={counts.lowStock ? 'amber' : 'grey'} />
        <StatCard label="Out of stock" value={num(counts.outOfStock)} icon={<IconAlert />} tone={counts.outOfStock ? 'red' : 'grey'} />
      </div>

      <p className="mt-4 rounded-xl border border-a-line bg-a-surface px-4 py-3 text-sm text-a-muted">
        Stock is <strong className="text-a-text">not yet reduced automatically</strong> when an order is
        placed - checkout does not touch it. Update counts here after packing, until that is connected.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((p) => {
          const state = stockState(p.stockCount, p.lowStockThreshold);
          return (
            <Card
              key={p.id}
              className={state === 'out' ? 'border-a-red/40' : state === 'low' ? 'border-a-amber/40' : ''}
              title={
                <span className="text-base">
                  {p.name}
                  <span className="mt-0.5 block font-sans text-xs text-a-muted">
                    {p.sizeLabel ? `${p.sizeLabel} · ` : ''}
                    {rupees(p.pricePaise)}
                  </span>
                </span>
              }
              action={
                state === 'out' ? (
                  <Badge tone="red">Out of stock</Badge>
                ) : state === 'low' ? (
                  <Badge tone="amber">Low stock</Badge>
                ) : state === 'in' ? (
                  <Badge tone="green">In stock</Badge>
                ) : (
                  <Badge tone="grey">Not tracked</Badge>
                )
              }
            >
              <ActionForm action={updateStock} submitLabel="Save" tone="quiet" className="space-y-3">
                <input type="hidden" name="productId" value={p.id} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`stock-${p.id}`} className="mb-1 block text-xs text-a-muted">
                      In stock
                    </label>
                    <input
                      id={`stock-${p.id}`}
                      name="stockCount"
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      defaultValue={p.stockCount ?? ''}
                      placeholder="Not tracked"
                      className={input}
                    />
                  </div>
                  <div>
                    <label htmlFor={`low-${p.id}`} className="mb-1 block text-xs text-a-muted">
                      Warn at or below
                    </label>
                    <input
                      id={`low-${p.id}`}
                      name="lowStockThreshold"
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      defaultValue={p.lowStockThreshold}
                      className={input}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-a-muted">
                  <input type="checkbox" name="isActive" defaultChecked={p.isActive} className="accent-a-gold" />
                  On sale in the shop
                </label>
              </ActionForm>
            </Card>
          );
        })}
      </div>
    </>
  );
}
