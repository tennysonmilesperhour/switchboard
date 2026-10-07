'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { createHash, randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/server/require-user';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { appUrl, sendEmailWithResult } from '@/lib/server/email';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { safeNextPath } from '@/lib/security';
import {
  FACT_KINDS,
  checkFactEmail,
  cleanFactLabel,
  describeFactEmailRefusal,
  orgFromClaim,
  type FactKind,
} from '@/lib/school-directory';

/**
 * Where someone went to school or works, and proving it.
 *
 * A fact's trust tier (`claimed` / `email` / `vouched`) is authority-like state:
 * `profile_facts` has no client write grants, so every write below goes through
 * the service role and names the caller from `requireUser()` first
 * (docs/SECURITY.md, "Discovery lanes, mood, and verified facts"). Nothing here
 * keeps the mailed address, only its domain, and the link token is stored hashed.
 */

const MAX_FACTS_PER_KIND = 4;
const LINK_MINUTES = 30;

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isKind(value: unknown): value is FactKind {
  return typeof value === 'string' && (FACT_KINDS as readonly string[]).includes(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function addFact(kind: FactKind, label: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  if (!isKind(kind)) return validation('Choose school or work.');

  const cleaned = cleanFactLabel(typeof label === 'string' ? label : '');
  const org = orgFromClaim(kind, cleaned);
  if (!org) return validation(kind === 'school' ? 'Add the name of your school.' : 'Add the name of your employer.');

  if (!(await checkRateLimit(`fact-add:${user.id}`, 20, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'Give it a moment before adding more.');
  }

  const admin = createAdminClient();
  const { count, error: countError } = await admin
    .from('profile_facts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('kind', kind);
  if (countError) return reportAndFail('SB-FACT-SAVE', 'fact.save', countError, { kind });
  if ((count ?? 0) >= MAX_FACTS_PER_KIND) {
    return validation(
      kind === 'school'
        ? `You can list up to ${MAX_FACTS_PER_KIND} schools. Remove one to add another.`
        : `You can list up to ${MAX_FACTS_PER_KIND} employers. Remove one to add another.`,
    );
  }

  const { error } = await admin.from('profile_facts').insert({
    user_id: user.id,
    kind,
    label: org.label,
    org_key: org.key,
    tier: 'claimed',
  });
  if (error) {
    if (error.code === '23505') return validation('You’ve already listed that.');
    return reportAndFail('SB-FACT-SAVE', 'fact.save', error, { kind });
  }

  revalidatePath('/profile/edit');
  revalidatePath('/profile');
  return { ok: true };
}

export async function removeFact(factId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!isUuid(factId)) return validation('That entry is no longer there.');

  const admin = createAdminClient();
  const { error } = await admin
    .from('profile_facts')
    .delete()
    .eq('id', factId)
    .eq('user_id', auth.user.id);
  if (error) return reportAndFail('SB-FACT-SAVE', 'fact.save', error, { factId });

  revalidatePath('/profile/edit');
  revalidatePath('/profile');
  return { ok: true };
}

export async function setFactShown(factId: string, shown: boolean): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!isUuid(factId)) return validation('That entry is no longer there.');

  const admin = createAdminClient();
  const { error } = await admin
    .from('profile_facts')
    .update({ shown: shown === true })
    .eq('id', factId)
    .eq('user_id', auth.user.id);
  if (error) return reportAndFail('SB-FACT-SAVE', 'fact.save', error, { factId });

  revalidatePath('/profile/edit');
  revalidatePath('/profile');
  return { ok: true };
}

export interface FactVerificationResult extends ActionResult {
  message?: string;
}

/** Mail a one-time link to an address on the fact's school or work domain. */
export async function requestFactVerification(
  factId: string,
  email: string,
): Promise<FactVerificationResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  if (!isUuid(factId)) return validation('That entry is no longer there.');
  const address = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!(await checkRateLimit(`fact-verify-send:${user.id}`, 6, 60 * 60, { failClosed: true }))) {
    return failure('SB-RATE-LIMIT', 'Too many verification emails. Try again later.');
  }
  // Also bound what any one mailbox can be sent, whoever asks: this action must
  // not become a way to fill a stranger's inbox.
  if (!(await checkRateLimit(
    `fact-verify-address:${tokenHash(address)}`,
    4,
    60 * 60,
    { failClosed: true },
  ))) {
    return failure('SB-RATE-LIMIT', 'Too many emails have been sent to that address. Try again later.');
  }

  const admin = createAdminClient();
  const { data: fact, error: readError } = await admin
    .from('profile_facts')
    .select('id, kind, label, tier')
    .eq('id', factId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (readError) return reportAndFail('SB-FACT-VERIFY', 'fact.verify-start', readError, { factId });
  if (!fact) return validation('That entry is no longer there.');
  if (fact.tier === 'email') return { ok: true, message: 'That one is already verified.' };

  const check = checkFactEmail({ kind: fact.kind as FactKind, label: fact.label }, address);
  if (!check.ok) return validation(describeFactEmailRefusal(check));

  const token = randomBytes(32).toString('base64url');
  const { error: clearError } = await admin
    .from('fact_verification_requests')
    .delete()
    .eq('user_id', user.id)
    .eq('fact_id', fact.id);
  if (clearError) return reportAndFail('SB-FACT-VERIFY', 'fact.verify-start', clearError, { factId });

  const { error: insertError } = await admin.from('fact_verification_requests').insert({
    user_id: user.id,
    fact_id: fact.id,
    token_hash: tokenHash(token),
    domain: check.domain,
    expires_at: new Date(Date.now() + LINK_MINUTES * 60 * 1000).toISOString(),
  });
  if (insertError) return reportAndFail('SB-FACT-VERIFY', 'fact.verify-start', insertError, { factId });

  const delivery = await sendEmailWithResult({
    to: address,
    subject: `Confirm ${check.org.label} on Switchboard`,
    text:
      `Confirm that you are connected to ${check.org.label} on your Switchboard profile:\n\n` +
      `${appUrl(`/verify-fact?token=${encodeURIComponent(token)}`)}\n\n` +
      `This link expires in ${LINK_MINUTES} minutes. Switchboard keeps only the domain of this address, ` +
      `not the address itself. If you did not ask for this, ignore this message.`,
  });
  if (delivery.status !== 'sent') {
    await admin
      .from('fact_verification_requests')
      .delete()
      .eq('user_id', user.id)
      .eq('fact_id', fact.id);
    if (delivery.status === 'not_configured') return failure('SB-CONFIG-EMAIL');
    return reportAndFail(
      'SB-FACT-VERIFY',
      'fact.verify-start',
      new Error(`email delivery failed: ${delivery.status}`),
      { factId },
      'The verification email could not be sent. Try again later.',
    );
  }
  return { ok: true, message: `Link sent. It works for ${LINK_MINUTES} minutes.` };
}

function verifyFactPath(token: string, reason?: 'other-account'): string {
  const params = new URLSearchParams({ token });
  if (reason) params.set('reason', reason);
  return safeNextPath(`/verify-fact?${params.toString()}`, '/profile/edit');
}

/**
 * The mailed link, opened. Same shape as `confirmEmailContact`: found by the
 * unguessable token alone, then checked against the caller before anything is
 * written, so a link opened in the wrong account says so instead of "expired".
 */
export async function confirmFactVerification(formData: FormData): Promise<never> {
  const auth = await requireUser();
  const token = String(formData.get('token') ?? '');
  if (!auth.ok) redirect(`/login?next=${encodeURIComponent(verifyFactPath(token))}`);
  if (token.length < 32) redirect(verifyFactPath(token));

  const admin = createAdminClient();
  const { data: request, error: readError } = await admin
    .from('fact_verification_requests')
    .select('user_id, fact_id, domain, expires_at')
    .eq('token_hash', tokenHash(token))
    .maybeSingle();
  if (readError) {
    await reportOperationalError('fact.verify-check', readError, {});
    redirect('/profile/edit?fact=error');
  }
  if (request && request.user_id !== auth.user.id) {
    redirect(verifyFactPath(token, 'other-account'));
  }
  if (!request || new Date(request.expires_at).getTime() <= Date.now()) {
    redirect('/profile/edit?fact=expired');
  }

  const { data: fact, error: factError } = await admin
    .from('profile_facts')
    .select('id, kind, label')
    .eq('id', request.fact_id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (factError) {
    await reportOperationalError('fact.verify-check', factError, {});
    redirect('/profile/edit?fact=error');
  }
  if (!fact) redirect('/profile/edit?fact=expired');

  // The domain was checked against the claim when the link was sent; check
  // again here so the stored request is never trusted on its own.
  const check = checkFactEmail(
    { kind: fact.kind as FactKind, label: fact.label },
    `member@${request.domain}`,
  );
  if (!check.ok) redirect('/profile/edit?fact=mismatch');

  // Any vouches were for the old claim; they attach to what was verified.
  await admin.from('fact_vouches').delete().eq('fact_id', fact.id);
  const { error: updateError } = await admin
    .from('profile_facts')
    .update({
      tier: 'email',
      verified_at: new Date().toISOString(),
      label: check.org.label,
      org_key: check.org.key,
    })
    .eq('id', fact.id)
    .eq('user_id', auth.user.id);
  if (updateError) {
    if (updateError.code === '23505') redirect('/profile/edit?fact=duplicate');
    await reportOperationalError('fact.verify-check', updateError, {});
    redirect('/profile/edit?fact=error');
  }
  await admin
    .from('fact_verification_requests')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('fact_id', fact.id);

  revalidatePath('/profile/edit');
  revalidatePath('/profile');
  redirect('/profile/edit?fact=verified');
}

/** Vouch for a connection's claim. The database decides who may (see the migration). */
export async function vouchForFact(factId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!isUuid(factId)) return validation('That entry is no longer there.');

  const { data, error } = await auth.supabase.rpc('vouch_for_fact', { p_fact: factId });
  if (error) {
    if (error.hint === 'SB-RATE-LIMIT') return failure('SB-RATE-LIMIT');
    return reportAndFail('SB-FACT-SAVE', 'fact.vouch', error, { factId });
  }
  switch (data) {
    case 'ok':
      revalidatePath('/u');
      return { ok: true };
    case 'cannot_vouch':
      return validation('Only someone whose own place is confirmed by email can vouch for it.');
    case 'not_connected':
      return validation('You can vouch for people you’re connected with.');
    case 'own':
      return validation('You can’t vouch for yourself.');
    default:
      return validation('That entry is no longer there.');
  }
}

export async function withdrawVouch(factId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!isUuid(factId)) return validation('That entry is no longer there.');
  const { error } = await auth.supabase.rpc('withdraw_vouch', { p_fact: factId });
  if (error) return reportAndFail('SB-FACT-SAVE', 'fact.vouch', error, { factId });
  revalidatePath('/u');
  return { ok: true };
}
