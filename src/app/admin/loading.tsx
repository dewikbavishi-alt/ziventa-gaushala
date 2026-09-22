/**
 * Shown while an admin page's queries run.
 *
 * Shaped like the real layout - header, a row of cards, two charts, a table -
 * so the page does not jump when the data lands, and the admin can already
 * see where things will be.
 */
export default function Loading() {
  const block = 'a-skeleton rounded-2xl';
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className={`${block} h-8 w-64`} />
          <div className={`${block} h-4 w-48`} />
        </div>
        <div className={`${block} h-10 w-40`} />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${block} h-28`} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={`${block} h-72`} />
        <div className={`${block} h-72`} />
      </div>
      <div className={`${block} h-80`} />
      <span className="sr-only">Loading dashboard</span>
    </div>
  );
}
