'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';

export type ActionResult = { ok: boolean; message: string };
type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * A form wired to a Server Action, with an optional confirmation step and a
 * toast for the result.
 *
 * The confirmation uses the native <dialog> element: it traps focus, closes
 * on Escape, returns focus to the button that opened it, and is announced as
 * a dialog - all without a library.
 *
 * The confirmation is a courtesy, not the protection. Every action re-checks
 * admin rights and validates its input on the server, because a Server Action
 * can be called directly without ever seeing this dialog.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = 'Saving…',
  confirm,
  tone = 'default',
  className = '',
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  confirm?: { title: string; body: string; confirmLabel?: string };
  tone?: 'default' | 'danger' | 'quiet';
  className?: string;
}) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  // One order page can hold several of these at once - cancel, return,
  // refund - so the dialog's heading id must be unique per instance.
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [toast, setToast] = useState<ActionResult | null>(null);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);

  /**
   * Show each new result as a toast. Compared during render rather than in an
   * effect: a result is new exactly when it is a different object from the
   * last one we saw.
   */
  if (result && result !== lastResult) {
    setLastResult(result);
    setToast(result);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const btn =
    tone === 'danger'
      ? 'bg-a-red/15 text-a-red ring-1 ring-inset ring-a-red/30 hover:bg-a-red/25'
      : tone === 'quiet'
        ? 'border border-a-line text-a-text hover:border-a-gold/40'
        : 'bg-a-gold text-a-bg hover:bg-a-gold/90';

  return (
    <>
      <form ref={formRef} action={formAction} className={className}>
        {children}
        {confirm ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => dialogRef.current?.showModal()}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${btn}`}
          >
            {pending ? pendingLabel : submitLabel}
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${btn}`}
          >
            {pending ? pendingLabel : submitLabel}
          </button>
        )}
      </form>

      {confirm && (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-a-line bg-a-surface p-0 text-a-text backdrop:bg-black/60"
        >
          <div className="p-5">
            <h2 id={titleId} className="font-display text-lg">
              {confirm.title}
            </h2>
            <p className="mt-2 text-sm text-a-muted">{confirm.body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => dialogRef.current?.close()}
                className="rounded-xl border border-a-line px-3.5 py-2 text-sm hover:border-a-gold/40"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={() => {
                  dialogRef.current?.close();
                  formRef.current?.requestSubmit();
                }}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium ${btn}`}
              >
                {confirm.confirmLabel ?? submitLabel}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${
            toast.ok
              ? 'border-a-green/40 bg-a-surface text-a-green'
              : 'border-a-red/40 bg-a-surface text-a-red'
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
