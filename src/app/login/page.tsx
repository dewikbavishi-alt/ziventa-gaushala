import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Ziventa Nutriments account.',
};

/**
 * For people who already have an account.
 *
 * Signing in will not create one - see shouldCreateUser in AuthForm. An
 * unknown address is told so and pointed at /signup, rather than silently
 * getting a brand new empty account and wondering where their orders went.
 *
 * `next` is read here on the server rather than with useSearchParams in the
 * form, so the page arrives as finished HTML instead of a blank card waiting
 * for JavaScript.
 */
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;

  // Sent here from /signup when the address already had an account, so it
  // does not have to be typed twice. Capped rather than validated - it only
  // ever fills a form field, and the server checks the address properly when
  // the form is submitted.
  const raw = Array.isArray(params.email) ? params.email[0] : params.email;
  const initialEmail = typeof raw === 'string' ? raw.slice(0, 200) : '';

  /**
   * ?mode=password opens the password form.
   *
   * The page no longer offers it - signing in means an emailed code - but the
   * code depends on our mail server and a password does not, so this stays as
   * the way back into /admin if Gmail ever stops accepting the app password.
   * Undocumented rather than secret: it still checks the password against
   * Supabase like any other sign-in, so knowing the URL grants nothing.
   */
  const modeRaw = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const initialMode = modeRaw === 'password' ? 'password' : 'email';

  /**
   * Somewhere specific was asked for, or let /auth/after-signin decide.
   *
   * Only the absence of ?next is redirected - an explicit one is honoured as
   * before, so /login?next=/admin and /login?next=/your-account both still go
   * exactly where they say.
   */
  const next = params.next ? safeNext(params.next) : '/auth/after-signin';

  return (
    <AuthForm
      intent="signin"
      next={next}
      initialEmail={initialEmail}
      initialMode={initialMode}
    />
  );
}
