import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Create your Ziventa Gaushala account to order ghee and track your membership.',
};

/**
 * For people who are new.
 *
 * Asks for a name as well as an email. The name travels in user_metadata and
 * is picked up by syncCustomer, so the customer record has a real name from
 * the first moment rather than being filled in later from an order.
 */
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm intent="signup" />
    </Suspense>
  );
}
