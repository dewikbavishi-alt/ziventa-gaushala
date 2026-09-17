import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';

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
 */
export default function LoginPage() {
  // useSearchParams needs a Suspense boundary; without one the whole route is
  // forced out of static rendering.
  return (
    <Suspense fallback={null}>
      <AuthForm intent="signin" />
    </Suspense>
  );
}
