'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { sendEmail } from '@/lib/server/email';
import { absoluteUrl } from '@/lib/links';
import { supportEmail } from '@/lib/contact';
import { VENUE_CLAIMS_PER_DAY, VENUE_MAX_PENDING } from '@/lib/venue-area';

const MAX_NAME = 120;
const MAX_AREA = 80;
const MAX_PERK = 200;
const MAX_URL = 300;

interface VenueFields {
  name: string;
  area: string | null;
  perk: string;
  url: string | null;
}

/**
 * Trim and bound what a claimant typed. The link must be a plain web address:
 * the moderator opens it to verify the business, and it is rendered as a link
 * to everyone once verified.
 */
function cleanVenueFields(
  name: string,
  area: string,
  perk: string,
  url: string,
): VenueFields | { error: string } {
  const cleanName = name.trim().slice(0, MAX_NAME);
  const cleanPerk = perk.trim().slice(0, MAX_PERK);
  if (!cleanName || !cleanPerk) return { error: 'Name and perk are required' };
  const rawUrl = url.trim().slice(0, MAX_URL);
  let cleanUrl: string | null = null;
  if (rawUrl) {
    const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try {
      const parsed = new URL(withProtocol);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('scheme');
      cleanUrl = parsed.toString();
    } catch {
      return { error: 'That website doesn’t look like a web address.' };
    }
  }
  return {
    name: cleanName,
    area: area.trim().slice(0, MAX_AREA) || null,
    perk: cleanPerk,
    url: cleanUrl,
  };
}

/**
 * Submit a venue claim. The row is born `pending` (the venues_insert policy pins
 * it) and only becomes publicly visible once a platform moderator verifies it —
 * so this is a *submission for review*, not an instant listing. Capturing the
 * business URL gives the moderator something to verify the claim against.
 *
 * Rate-limited, and capped at a few waiting at once: every claim lands in a
 * human's review queue, and nothing stopped one account from filling it.
 */
export async function claimVenue(
  name: string,
  area: string,
  perk: string,
  url: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const fields = cleanVenueFields(name, area, perk, url);
  if ('error' in fields) return validation(fields.error);

  const { count: waiting } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .eq('claimed_by', user.id)
    .eq('status', 'pending');
  if ((waiting ?? 0) >= VENUE_MAX_PENDING) {
    return validation(
      `You have ${VENUE_MAX_PENDING} claims waiting for review. Once one is decided you can add another.`,
    );
  }
  if (!(await checkRateLimit(`venue-claim:${user.id}`, VENUE_CLAIMS_PER_DAY, 24 * 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'You’ve submitted several venues today. Try again tomorrow.');
  }

  const { error } = await supabase.from('venues').insert({
    ...fields,
    claimed_by: user.id,
  });
  if (error) return reportAndFail('SB-VENUE-SAVE', 'venue.claim', error);
  revalidatePath('/discover');
  return { ok: true };
}

/**
 * Edit your own claim. Allowed while it waits and once it is verified; a
 * verified venue whose name, area, perk or link changes goes back to review
 * (`freeze_venue_authority`), so the result says whether that happened. A
 * rejected claim is not edited back into the queue — the claimant appeals by
 * replying to the review email (D14), or withdraws it and claims again.
 */
export async function updateVenueClaim(
  venueId: string,
  input: { name: string; area: string; perk: string; url: string },
): Promise<ActionResult & { backToReview?: boolean }> {
  const fields = cleanVenueFields(input.name, input.area, input.perk, input.url);
  if ('error' in fields) return validation(fields.error);
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data: before } = await supabase
    .from('venues')
    .select('status')
    .eq('id', venueId)
    .eq('claimed_by', user.id)
    .maybeSingle();
  if (!before) return failure('SB-VENUE-SAVE', 'That claim isn’t yours to edit, or it’s gone.');
  if (before.status === 'rejected') {
    return validation('A claim that wasn’t approved can’t be edited. Reply to the review email to appeal, or withdraw it.');
  }

  const { data, error } = await supabase
    .from('venues')
    .update(fields)
    .eq('id', venueId)
    .eq('claimed_by', user.id)
    .select('status');
  if (error) return reportAndFail('SB-VENUE-SAVE', 'venue.update', error, { venueId });
  if (!data || data.length === 0) {
    return failure('SB-VENUE-SAVE', 'That claim isn’t yours to edit, or it’s gone.');
  }

  revalidatePath('/discover');
  return {
    ok: true,
    backToReview: before.status === 'verified' && data[0].status === 'pending',
  };
}

/** Withdraw your own claim, at any stage. The venues DELETE policy is owner-only. */
export async function withdrawVenueClaim(venueId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from('venues')
    .delete()
    .eq('id', venueId)
    .eq('claimed_by', user.id)
    .select('id');
  if (error) return reportAndFail('SB-VENUE-SAVE', 'venue.withdraw', error, { venueId });
  if (!data || data.length === 0) {
    return failure('SB-VENUE-SAVE', 'That claim isn’t yours to withdraw, or it’s already gone.');
  }
  revalidatePath('/discover');
  return { ok: true };
}

/**
 * The claimant's own email address, from proof of ownership only: their
 * confirmed sign-in email, or a verified contact. Never `profiles.contact_email`,
 * which its owner can set to anything (docs/SECURITY.md §9).
 */
async function claimantEmail(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  const authUser = data?.user;
  if (authUser?.email && authUser.email_confirmed_at) return authUser.email;
  const { data: contact } = await admin
    .from('profile_contacts')
    .select('normalized_value')
    .eq('user_id', userId)
    .eq('kind', 'email')
    .not('verified_at', 'is', null)
    .limit(1)
    .maybeSingle();
  return contact?.normalized_value ?? null;
}

/**
 * Verify or reject a pending venue claim. Authorization is enforced in the
 * database: review_venue() delegates to a security-definer body that self-checks
 * is_platform_moderator(auth.uid()) and raises for anyone else, and the freeze
 * trigger independently blocks non-moderators from moving `status` — so this can
 * safely run under the caller's RLS client (mirrors resolveReport).
 *
 * Then the claimant hears the outcome, with the reviewer's note, in the app and
 * by email (D14). Neither used to happen: a rejected claimant saw "Not approved"
 * whenever they next looked, with no reason and "reach out" pointing nowhere.
 * The email's reply goes to support, which is how a claimant appeals.
 */
export async function reviewVenue(
  venueId: string,
  decision: 'verified' | 'rejected',
  note: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase.rpc('review_venue', {
    p_venue: venueId,
    p_decision: decision,
    p_note: note.trim() || undefined,
  });
  if (error) return reportAndFail('SB-VENUE-SAVE', 'venue.review', error, { venueId });

  // The RPC only acts on a still-pending row and says nothing either way. The
  // service role reads back the row this caller just decided — it proved it is
  // a platform moderator by the RPC not raising, and the row must carry *their*
  // review — so a double review or a stale queue never sends a second email.
  const admin = createAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('name, status, review_note, claimed_by, reviewed_by, reviewed_at')
    .eq('id', venueId)
    .maybeSingle();
  const justDecided =
    venue &&
    venue.claimed_by &&
    venue.reviewed_by === user.id &&
    venue.status === decision &&
    venue.reviewed_at &&
    Date.now() - Date.parse(venue.reviewed_at) < 5 * 60_000;
  if (justDecided && venue.claimed_by) {
    const verified = decision === 'verified';
    const noteLine = venue.review_note ? `\n\nThe reviewer’s note: “${venue.review_note}”` : '';
    await notifyUsers([venue.claimed_by], {
      kind: 'venue_review',
      title: verified ? `${venue.name} is live as a partner perk` : `${venue.name} wasn’t approved`,
      body: verified
        ? 'Groups near you can see your perk now.'
        : venue.review_note
          ? `Reviewer’s note: ${venue.review_note.slice(0, 120)}`
          : 'Check your email for how to appeal.',
      url: '/discover#perks',
    });
    const to = await claimantEmail(admin, venue.claimed_by);
    if (to) {
      // Best-effort, like every other email: the decision stands either way,
      // and the in-app notification above already carries it.
      await sendEmail({
        to,
        subject: verified
          ? `Your Switchboard partner perk for ${venue.name} is live`
          : `Your Switchboard venue claim for ${venue.name}`,
        text: verified
          ? `Good news: ${venue.name} is verified, and its perk now shows to Switchboard groups nearby.${noteLine}\n\nEditing the name, area, perk or link sends it back for a quick re-check.\n\n${absoluteUrl('/discover#perks')}`
          : `We weren’t able to verify ${venue.name} as a Switchboard partner venue.${noteLine}\n\nIf you think that’s a mistake, reply to this email to appeal — it reaches a person — or write to ${supportEmail()}. Say what would confirm the business is yours (a listing, a site, or an email from its domain).\n\n${absoluteUrl('/discover#perks')}`,
        replyTo: supportEmail(),
      });
    }
  }

  revalidatePath('/moderation');
  revalidatePath('/discover');
  return { ok: true };
}
