'use client';

/**
 * Anything that throws while rendering an admin page lands here.
 *
 * The real error goes to the server log. The browser gets a digest - an
 * opaque id - rather than the message, so a database error cannot show its
 * connection details or SQL on screen. Quote the digest to find the matching
 * log line.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div role="alert" className="max-w-md rounded-2xl border border-a-red/30 bg-a-surface p-8 text-center">
        <h1 className="font-display text-xl text-a-text">This page could not load</h1>
        <p className="mt-2 text-sm text-a-muted">
          Something went wrong fetching the figures. It is usually brief - a dropped database
          connection - so trying again often works.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-a-muted">Reference: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-xl bg-a-gold px-4 py-2 text-sm font-medium text-a-bg"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
