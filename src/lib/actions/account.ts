'use server';

import type { ActionResult, Failure } from '@/lib/errors';

import { redirect } from 'next/navigation';
import { failure, validation } from '@/lib/errors';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/server/require-user';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { reportAndFail } from '@/lib/server/observability';
import {
  buildMyDataExport,
  deleteAccountAndData,
  serializeMyDataExport,
} from '@/lib/server/account-data';
import { prepareHostedPlanCancellations, sendHostedPlanCancellations } from '@/lib/server/hosted-plans';

export type ExportMyDataResult =
  | { ok: true; filename: string; json: string }
  | Failure;

/**
 * Build the caller's data export. Everything the file contains is read either
 * through the caller's own RLS session (so a plan they may not see is a plan
 * they may not export) or, for their own profile row, through the service role
 * pinned to `auth.user.id` — the one column grant withholds from the API
 * (`contact_email` / `contact_phone`) is the owner's own data.
 */
export async function exportMyData(): Promise<ExportMyDataResult> {
  if (!hasAdminCredentials()) {
    return failure(
      'SB-CONFIG-AUTH',
      'Data export is not configured on this server.',
    );
  }

  const auth = await requireUser();
  if (!auth.ok) {
    return failure('SB-AUTH-EXPIRED', 'Sign in again before exporting your data.');
  }

  // An export is a dozen queries and a document the size of the account; five
  // an hour is generous for a person and cheap to deny to a script.
  if (!(await checkRateLimit(`export:${auth.user.id}`, 5, 60 * 60))) {
    return failure('SB-RATE-LIMIT');
  }

  try {
    const exportedAt = new Date().toISOString();
    const data = await buildMyDataExport(
      { admin: createAdminClient(), reader: auth.supabase },
      auth.user,
      exportedAt,
    );
    return {
      ok: true,
      filename: `switchboard-data-${exportedAt.slice(0, 10)}.json`,
      json: serializeMyDataExport(data),
    };
  } catch (error) {
    return reportAndFail(
      'SB-ACCOUNT-EXPORT',
      'account.export',
      error,
      { userId: auth.user.id },
    );
  }
}

export async function deleteAccount(
  confirmation: string,
): Promise<ActionResult> {
  if (confirmation.trim().toUpperCase() !== 'DELETE') {
    return validation('Type DELETE to confirm.');
  }
  if (!hasAdminCredentials()) {
    return failure(
      'SB-CONFIG-AUTH',
      'Account deletion is not configured on this server.',
    );
  }

  const auth = await requireUser();
  if (!auth.ok) {
    return failure('SB-AUTH-EXPIRED', 'Sign in again before deleting your account.');
  }

  const admin = createAdminClient();
  // Capture recipients before the cascade, but never announce a deletion that
  // might still fail. A snapshot failure must not trap someone in their account.
  let cancellations: Awaited<ReturnType<typeof prepareHostedPlanCancellations>> | null = null;
  try {
    cancellations = await prepareHostedPlanCancellations(admin, auth.user.id);
  } catch (noticeError) {
    console.error('Hosted-plan cancellation snapshot failed', noticeError);
  }

  try {
    await deleteAccountAndData(admin, auth.user.id);
  } catch (error) {
    return reportAndFail(
      'SB-AUTH-DELETE',
      'account.delete',
      error,
      { userId: auth.user.id },
    );
  }

  // Once deletion has committed, these messages are true. Delivery remains
  // best-effort; a provider failure cannot undo deletion or prevent sign-out.
  if (cancellations) {
    try {
      await sendHostedPlanCancellations(cancellations);
    } catch (noticeError) {
      console.error('Hosted-plan notice after account deletion failed', noticeError);
    }
  }

  await auth.supabase.auth.signOut();
  redirect('/welcome?account=deleted');
}
