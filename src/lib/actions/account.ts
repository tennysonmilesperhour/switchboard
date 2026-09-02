'use server';

import type { ErrorCode, Failure } from '@/lib/errors';

import { redirect } from 'next/navigation';
import { failure } from '@/lib/errors';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';
import {
  buildMyDataExport,
  deleteAccountAndData,
  serializeMyDataExport,
} from '@/lib/server/account-data';

export type ExportMyDataResult =
  | { ok: true; filename: string; json: string }
  | Failure;

export interface AccountActionResult {
  ok: boolean;
  error?: string;
  code?: ErrorCode;
  fix?: string | null;
}

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

  try {
    const exportedAt = new Date().toISOString();
    const data = await buildMyDataExport(
      createAdminClient(),
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
): Promise<AccountActionResult> {
  if (confirmation.trim().toUpperCase() !== 'DELETE') {
    return { ok: false, error: 'Type DELETE to confirm.' };
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

  try {
    await deleteAccountAndData(createAdminClient(), auth.user.id);
  } catch (error) {
    return reportAndFail(
      'SB-AUTH-DELETE',
      'account.delete',
      error,
      { userId: auth.user.id },
    );
  }

  await auth.supabase.auth.signOut();
  redirect('/welcome?account=deleted');
}
