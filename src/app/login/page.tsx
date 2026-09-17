import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Ziventa Gaushala account.',
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
  return <AuthForm intent="signin" next={safeNext(params.next)} />;
}
