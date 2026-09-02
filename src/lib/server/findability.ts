import { createClient } from '@/lib/supabase/server';
import { emailEnabled } from '@/lib/server/email';
import { smsEnabled } from '@/lib/server/sms';
import { findabilityState, type FindabilityState } from '@/lib/findability';

/**
 * The caller's own findability. Read through their session client, so RLS
 * (`profile_contacts_owner_select`) is what scopes it — nobody can ask this
 * about anyone else.
 *
 * The decision itself lives in `src/lib/findability.ts` and is unit-tested;
 * this is only the IO around it.
 */
export async function loadFindability(): Promise<FindabilityState> {
  const supabase = await createClient();
  const { data } = await supabase.from('profile_contacts').select('kind, verified_at');

  return findabilityState({
    contacts: (data ?? []).flatMap((row) =>
      row.kind === 'email' || row.kind === 'phone'
        ? [{ kind: row.kind, verified: Boolean(row.verified_at) }]
        : [],
    ),
    canDeliver: { email: emailEnabled(), phone: smsEnabled() },
  });
}
