'use client';

import type { ReactNode } from 'react';
import { signOut } from '@/lib/actions/profile';
import { releasePushOnSignOut } from '@/lib/client/push';

/**
 * Sign out, after detaching this browser's push subscription from the account.
 * The server action alone cannot do that: only the browser knows which
 * subscription is its own, and the release needs the session that is about to
 * end.
 */
export function SignOutForm({ children }: { children: ReactNode }) {
  async function handleSignOut() {
    await releasePushOnSignOut();
    await signOut();
  }

  return <form action={handleSignOut}>{children}</form>;
}
