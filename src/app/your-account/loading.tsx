/**
 * Shown while an account page is fetching.
 *
 * Every page here is force-dynamic and hits the database for one person's
 * data, so there is always a gap. Without this the browser sits on the
 * previous page with nothing happening, which reads as a dead link rather
 * than a slow one.
 *
 * Shaped like the hub it replaces - a band, then a card, then a grid - so the
 * layout does not jump when the real content arrives.
 */
export default function AccountLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FBF6EC]">
      <div className="flex-1 px-4 py-8 sm:py-10" aria-busy="true" aria-label="Loading your account">
        <div className="mx-auto max-w-5xl animate-pulse">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="h-8 w-56 rounded-lg bg-[#2F4A3D]/10" />
              <div className="mt-2 h-4 w-72 rounded bg-[#2F4A3D]/8" />
            </div>
            <div className="h-10 w-24 rounded-lg bg-[#2F4A3D]/10" />
          </div>

          <div className="mb-6 h-44 rounded-3xl bg-[#2F4A3D]/10" />
          <div className="mb-6 h-48 rounded-2xl border border-[#2F4A3D]/10 bg-white/70" />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="h-24 rounded-2xl border border-[#2F4A3D]/10 bg-white/70"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
