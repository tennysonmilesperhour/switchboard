'use server';

import { validation, type ErrorCode } from '@/lib/errors';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { requireUser, requireUserOrRedirect } from '@/lib/server/require-user';
import { isOwnPublicStorageUrl } from '@/lib/server/media';
import { SOCIAL_BY_ID } from '@/lib/socials';
import { USERNAME_PATTERN, isEmail } from '@/lib/auth-identity';
import { normalizePhoneNumber } from '@/lib/phone';
import { safeNextPath } from '@/lib/security';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { resolveTheme, themeById } from '@/lib/themes-app';
import { parseCustomAppearance } from '@/lib/theme-custom';
import { loadPassport } from '@/lib/server/passport';
import { passportProgress } from '@/lib/passport';
import { LEGAL_VERSION } from '@/lib/legal';
import { capture } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { sanitizeUrl } from '@/lib/url';
import { isValidCoordinate } from '@/lib/geo';
import type { ProfileLink, ProfileSocial } from '@/lib/types';
import { toJson } from '@/lib/supabase/json';
import type { NotificationPrefs } from '@/lib/notifications';
import { requestContactVerification } from '@/lib/actions/contact-verification';

const HANDLE_PATTERN = USERNAME_PATTERN;
const MAX_LINKS = 15;
const MAX_SOCIALS = 15;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
}

/** Record explicit acceptance of the current 18+ terms for an existing user. */
export async function acceptLatestTerms(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUserOrRedirect();
  const nextPath = safeNextPath(String(formData.get('next') ?? ''), '/');
  if (formData.get('terms_agreement') !== 'on') {
    redirect(`/legal-update?error=agreement&next=${encodeURIComponent(nextPath)}`);
  }

  // Upsert, and read the version back, because a silent no-op here is a loop:
  // the proxy sends every protected route to /legal-update until this column
  // matches, so an update that matches zero rows (no profile row yet) or is
  // filtered by RLS bounces the reader between the two forever, with the form
  // reporting success each time. Same failure the onboarding save had.
  const writer = hasAdminCredentials() ? createAdminClient() : supabase;
  const { data: saved, error } = await writer
    .from('profiles')
    .upsert(
      {
        id: user.id,
        legal_terms_version: LEGAL_VERSION,
        legal_terms_accepted_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('legal_terms_version')
    .maybeSingle();
  if (error || saved?.legal_terms_version !== LEGAL_VERSION) {
    // The page shows SB-PROFILE-SAVE for this; log it under the same code so a
    // screenshot of the loop is joinable to its cause.
    await reportOperationalError('profile-save', error ?? {
      message: 'legal_terms_version did not read back after a successful upsert',
    }, { userId: user.id, step: 'legal-terms' });
    redirect(`/legal-update?error=save&next=${encodeURIComponent(nextPath)}`);
  }
  redirect(nextPath);
}

function parseLinks(raw: string): ProfileLink[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const links: ProfileLink[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const url = sanitizeUrl(String(item.url ?? ''));
    if (!url) continue;
    const label = String(item.label ?? '').trim().slice(0, 60);
    let host = '';
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
    links.push({ label: label || host || 'Link', url });
    if (links.length >= MAX_LINKS) break;
  }
  return links;
}

function parseSocials(raw: string): ProfileSocial[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const socials: ProfileSocial[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const platform = String(item.platform ?? '');
    const value = String(item.value ?? '').trim().slice(0, 200);
    if (!SOCIAL_BY_ID[platform] || !value) continue;
    socials.push({ platform, value });
    if (socials.length >= MAX_SOCIALS) break;
  }
  return socials;
}

/**
 * The browser's IANA zone, or UTC. The field is client-supplied, and quiet
 * hours, the digest hour and the greeting all hand it to Intl, which throws on
 * a zone it doesn't recognise.
 */
function knownTimeZone(raw: string): string {
  return exactTimeZone(raw) ?? 'UTC';
}

/**
 * The zone exactly as given when Intl recognises it, otherwise null. Settings
 * uses this rather than `knownTimeZone`: a choice someone made on purpose is
 * refused out loud, never quietly swapped for UTC.
 */
function exactTimeZone(raw: string): string | null {
  const zone = raw.trim();
  if (!zone || zone.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

function nullableText(raw: FormDataEntryValue | null, max: number): string | null {
  const value = String(raw ?? '').trim();
  return value ? value.slice(0, max) : null;
}

/** Full profile edit: identity, presentation, links, socials, and contact.
 *  Media (avatar/cover) URLs are uploaded client-side to Supabase Storage and
 *  arrive here as already-hosted public URLs. */
export async function updateProfileDetails(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUserOrRedirect();

  const displayName = String(formData.get('display_name') ?? '').trim();
  const handle = String(formData.get('handle') ?? '')
    .trim()
    .toLowerCase();

  if (!displayName) return validation('Add your name.');
  if (!HANDLE_PATTERN.test(handle)) {
    return validation('Handle: 3–24 lowercase letters, numbers, or underscores.');
  }

  const email = nullableText(formData.get('contact_email'), 120);
  if (email && !isEmail(email)) {
    return validation('That email address looks off.');
  }
  const phone = nullableText(formData.get('contact_phone'), 40);
  if (phone && !normalizePhoneNumber(phone)) {
    return validation('Use a phone number with a country code.');
  }

  // Media URLs must live in our own Supabase storage buckets.
  const avatarUrl = nullableText(formData.get('avatar_url'), 500);
  const coverUrl = nullableText(formData.get('cover_url'), 500);
  const mediaOk = (u: string | null) =>
    u === null || isOwnPublicStorageUrl(u, ['avatars', 'covers']);
  if (!mediaOk(avatarUrl) || !mediaOk(coverUrl)) {
    return validation('Unexpected image location - please re-upload.');
  }

  const locationChanged = formData.get('location_changed') === 'true';
  const rawLatitude = String(formData.get('home_latitude') ?? '').trim();
  const rawLongitude = String(formData.get('home_longitude') ?? '').trim();
  let homeCoordinateUpdate: {
    home_latitude?: number | null;
    home_longitude?: number | null;
  } = {};
  if (locationChanged) {
    if (!rawLatitude && !rawLongitude) {
      homeCoordinateUpdate = { home_latitude: null, home_longitude: null };
    } else {
      const latitude = Number(rawLatitude);
      const longitude = Number(rawLongitude);
      if (!isValidCoordinate(latitude, longitude)) {
        return validation('Choose a valid city or save the location as text.');
      }
      homeCoordinateUpdate = {
        home_latitude: latitude,
        home_longitude: longitude,
      };
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName.slice(0, 80),
      handle,
      avatar_url: avatarUrl,
      cover_url: coverUrl,
      tagline: nullableText(formData.get('tagline'), 120),
      pronouns: nullableText(formData.get('pronouns'), 40),
      location: nullableText(formData.get('location'), 80),
      bio: nullableText(formData.get('bio'), 600),
      links: toJson(parseLinks(String(formData.get('links') ?? '[]'))),
      socials: toJson(parseSocials(String(formData.get('socials') ?? '[]'))),
      contact_email: email,
      contact_phone: phone,
      contact_public: formData.get('contact_public') === 'on',
      ...homeCoordinateUpdate,
    })
    .eq('id', user.id);

  if (error) {
    if (error.code === '23505') {
      return validation('That handle is already taken.');
    }
    return reportAndFail('SB-PROFILE-SAVE', 'profile-save', error, { userId: user.id });
  }

  // Contact info may have just been added — adopt any guest invites sent to this
  // email/phone so they surface in the app rather than staying stuck as
  // account-less guest rows. Best-effort, but a failure is reported: it means
  // the claim machinery is broken (e.g. migration not applied), not a no-op.
  const { error: claimError } = await supabase.rpc('claim_guest_invites_by_contact');
  if (claimError) {
    await reportOperationalError('invite-claim.contact', claimError, {
      area: 'profile-save',
    });
  }

  revalidatePath('/profile');
  revalidatePath('/settings');
  redirect('/profile');
}

export async function completeOnboarding(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUserOrRedirect();
  const nextPath = safeNextPath(String(formData.get('next') ?? ''), '/');
  const afterOnboarding = nextPath.startsWith('/onboarding') ? '/' : nextPath;
  const onboardingError = (reason: string): never => {
    const params = new URLSearchParams({ error: reason });
    if (afterOnboarding !== '/') params.set('next', afterOnboarding);
    redirect(`/onboarding?${params.toString()}`);
  };

  const displayName = String(formData.get('display_name') ?? '').trim();
  const handle = String(formData.get('handle') ?? '')
    .trim()
    .toLowerCase();
  const interests = formData.getAll('interests').map(String).filter(Boolean);
  const downTo = formData.getAll('down_to').map(String).filter(Boolean);
  const acceptedTerms = formData.get('terms_agreement') === 'on';
  const acceptedCovenant = formData.get('community_agreement') === 'on';

  if (!displayName) onboardingError('name');
  if (!HANDLE_PATTERN.test(handle)) onboardingError('handle');
  if (!acceptedTerms || !acceptedCovenant) onboardingError('agreement');

  // The optional recovery step, offered only to username sign-ups: without a
  // verified email they have no way back in if they forget their password
  // (docs/AUTH.md, decision 14). It becomes the profile's contact email, which
  // the contact sync marks unverified until the link we send is opened —
  // `/forgot-password` never mails an address nobody has proved.
  const recoveryEmail = nullableText(formData.get('recovery_email'), 120)?.toLowerCase() ?? null;
  if (recoveryEmail && !isEmail(recoveryEmail)) onboardingError('recovery_email');

  const profileUpdate = {
    display_name: displayName,
    handle,
    interests,
    down_to: downTo,
    timezone: knownTimeZone(String(formData.get('timezone') || '')),
    onboarded: true,
    legal_terms_version: LEGAL_VERSION,
    legal_terms_accepted_at: new Date().toISOString(),
    community_covenant_accepted_at: new Date().toISOString(),
    ...(recoveryEmail ? { contact_email: recoveryEmail } : {}),
  };

  // The authenticated user has already been verified by requireUserOrRedirect.
  // Scope the service-role write to that exact id so grant drift cannot strand
  // a new account halfway through onboarding.
  //
  // Upsert, not update, for the same reason `createPasswordAccount` does it:
  // an account whose `handle_new_user` trigger never ran has no profile row, so
  // an update matches zero rows, `.single()` errors, and this redirects to
  // /onboarding?error=save. Onboarding is the only route out of onboarding, so
  // that is not a failed save — it is an account locked out of the app forever,
  // with no message that admits it.
  const profileWriter = hasAdminCredentials() ? createAdminClient() : supabase;
  const { data: savedProfile, error: profileError } = await profileWriter
    .from('profiles')
    .upsert({ id: user.id, ...profileUpdate }, { onConflict: 'id' })
    .select('onboarded')
    .single();

  if (profileError || !savedProfile?.onboarded) {
    if (profileError?.code === '23505') onboardingError('handle_taken');
    // Nothing was logged here, so "Something went wrong saving your profile"
    // was undiagnosable. The page shows SB-PROFILE-SAVE; so does this line.
    await reportOperationalError('onboarding', profileError ?? {
      message: 'onboarded did not read back after a successful upsert',
    }, { userId: user.id });
    onboardingError('save');
  }

  // Starter circles - reused across signals, visibility, and invite lists.
  const { data: existing } = await supabase
    .from('circles')
    .select('id')
    .eq('owner_id', user.id)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('circles').insert([
      { owner_id: user.id, name: 'Close Friends', emoji: '💛' },
      { owner_id: user.id, name: 'Family', emoji: '🏡' },
      { owner_id: user.id, name: 'Neighbors', emoji: '🌳' },
    ]);
  }

  // A new account created from an invite: adopt any guest invites addressed to
  // this person's sign-in email/phone so they're waiting in the app.
  // Best-effort, but a failure is reported: it means the claim machinery is
  // broken (e.g. migration not applied), not a no-op.
  const { error: claimError } = await supabase.rpc('claim_guest_invites_by_contact');
  if (claimError) {
    await reportOperationalError('invite-claim.contact', claimError, {
      area: 'onboarding',
    });
  }

  // Send the proof-of-ownership link for the recovery email. Best-effort: a
  // failure here must not hold someone at onboarding (the only route out of
  // onboarding is finishing it), and Settings keeps asking them to verify it
  // until they do, with its own button to send the link again.
  if (recoveryEmail) {
    await requestContactVerification('email').catch(() => undefined);
  }

  // Counts only — never the interest strings themselves.
  await capture(user.id, ANALYTICS_EVENTS.onboardingCompleted, {
    interest_count: interests.length,
    down_to_count: downTo.length,
  });

  // Return to the destination the user was originally headed for (e.g. an invite
  // deep link that funnelled them through onboarding), validated to same-site.
  redirect(afterOnboarding);
}

export async function updateInterests(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUserOrRedirect();

  const interests = formData.getAll('interests').map(String).filter(Boolean);
  const downTo = formData.getAll('down_to').map(String).filter(Boolean);

  const { error } = await supabase
    .from('profiles')
    .update({ interests, down_to: downTo })
    .eq('id', user.id);
  if (error) {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.interests', error, { userId: user.id });
  }

  revalidatePath('/settings');
  return { ok: true };
}

function compactLines(raw: FormDataEntryValue | null, maxItems = 12): string[] {
  return String(raw ?? '')
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((value) => value.slice(0, 60));
}

export async function updateDiscoverability(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUserOrRedirect();

  const discoverable = formData.get('discoverable') === 'on';
  const { error } = await supabase
    .from('profiles')
    .update({
      discoverable,
      discovery_geography: discoverable && formData.get('discovery_geography') === 'on',
      discovery_demographics:
        discoverable && formData.get('discovery_demographics') === 'on',
      discovery_interests: discoverable && formData.get('discovery_interests') === 'on',
      discovery_involvements:
        discoverable && formData.get('discovery_involvements') === 'on',
      discovery_mutuals: discoverable && formData.get('discovery_mutuals') === 'on',
      discovery_contexts: discoverable
        ? compactLines(formData.get('discovery_contexts'))
        : [],
    })
    .eq('id', user.id);
  if (error) {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.discoverability', error, {
      userId: user.id,
    });
  }

  revalidatePath('/settings');
  revalidatePath('/discover');
  return { ok: true };
}

/**
 * Choose an appearance preset.
 *
 * Revalidates the layout rather than a page, because the theme is read in the
 * root layout and applied to `<html>` — revalidating `/settings` alone would
 * leave every other route rendering the old palette until it happened to be
 * re-fetched.
 *
 * The earned theme is re-checked here from the person's own data, not trusted
 * from the form. It is only a decoration, but a control that can be bypassed
 * by editing a request teaches that all of them can be.
 */
export async function updateAppearanceTheme(theme: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const resolved = resolveTheme(theme);
  const wanted = themeById(resolved);
  if (wanted.earned) {
    const passport = await loadPassport(user.id);
    if (!passportProgress(passport).done) {
      return validation('That one unlocks once you’ve tried everything.');
    }
  }

  // Read the value back rather than trusting a clean UPDATE. A theme that saves
  // and cannot be read is not a hypothetical: `appearance_theme` shipped without
  // a SELECT grant, so this write succeeded every time while the app went on
  // rendering the default, and the picker looked like it was ignoring taps. An
  // UPDATE that reports success on a value nobody can read is a lie the reader
  // is left to work out for themselves.
  const { data: saved, error } = await supabase
    .from('profiles')
    .update({ appearance_theme: resolved })
    .eq('id', user.id)
    .select('appearance_theme')
    .maybeSingle();
  if (error || saved?.appearance_theme !== resolved) {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.appearance', error ?? {
      message: 'appearance_theme did not read back after a successful update',
      saved: saved?.appearance_theme ?? null,
    }, { userId: user.id, theme: resolved });
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Save the custom preset's three colors and its wallpaper.
 *
 * Only the choices are stored. Every other token — ink, lines, the accent's
 * variants, the acceptance and decline colors, the plan palette, the gradient —
 * is derived from these at render time by `customThemeVars`, which is what keeps
 * the contrast invariant true for combinations nobody reviewed. Storing the
 * derived values instead would make them writable, and a writable token layer is
 * a writable contrast ratio.
 *
 * `parseCustomAppearance` is the validator and it is fail-safe by design, so
 * this cannot reject: a malformed field becomes the default rather than an
 * error. The one thing checked here that a pure parser cannot check is
 * ownership — the wallpaper has to be a file this account uploaded, not another
 * account's cover pulled out of a public bucket.
 */
export async function updateCustomAppearance(
  custom: unknown,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const parsed = parseCustomAppearance(custom);
  const appearance =
    parsed.wallpaper && !parsed.wallpaper.includes(`/${user.id}/`)
      ? { ...parsed, wallpaper: null }
      : parsed;

  const { data: saved, error } = await supabase
    .from('profiles')
    .update({ appearance_theme: 'custom', appearance_custom: toJson(appearance) })
    .eq('id', user.id)
    .select('appearance_theme')
    .maybeSingle();
  if (error || saved?.appearance_theme !== 'custom') {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.appearance', error ?? {
      message: 'appearance_custom did not read back after a successful update',
    }, { userId: user.id });
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Flip discoverability from a quick toggle (e.g. the Explore banner) without
 * opening Settings. Turning it on also lights the privacy-conservative sharing
 * dimensions (interests + mutual friends) so you actually match on something,
 * while leaving location, demographics, involvements, and contexts exactly as
 * they were — those stay opt-in from Settings. Turning it off just hides you
 * and preserves every sharing choice for next time.
 */
export async function setDiscoverable(enabled: boolean): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const update = enabled
    ? { discoverable: true, discovery_interests: true, discovery_mutuals: true }
    : { discoverable: false };

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id);
  if (error) {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.discoverability', error, {
      userId: user.id,
    });
  }

  revalidatePath('/discover');
  revalidatePath('/settings');
  return { ok: true };
}

export async function updateSabbatical(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUserOrRedirect();

  const on = formData.get('sabbatical') === 'on';
  // Shown to other people (profile, invite pickers), and capped at 140 by the
  // database; the field's maxLength is only a hint.
  const message = String(formData.get('sabbatical_message') ?? '').trim().slice(0, 140);

  const { error } = await supabase
    .from('profiles')
    .update({
      sabbatical: on,
      sabbatical_message: on ? message || null : null,
    })
    .eq('id', user.id);
  if (error) {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.sabbatical', error, { userId: user.id });
  }

  // Entering a quiet season pulls down any live availability signal and any
  // live location share, so you stop appearing on radars and the map right away.
  if (on) {
    const [signals, location] = await Promise.all([
      supabase.from('availability_signals').delete().eq('user_id', user.id),
      supabase.from('live_locations').delete().eq('user_id', user.id),
    ]);
    // A failed delete would leave a signal or a pin showing while the switch
    // reads "on", so say so rather than reporting a quiet season that is not.
    const pullDownError = signals?.error ?? location?.error;
    if (pullDownError) {
      return reportAndFail('SB-SETTINGS-SAVE', 'settings.sabbatical', pullDownError, {
        userId: user.id,
        step: 'pull-down',
      });
    }
  }

  revalidatePath('/settings');
  revalidatePath('/');
  return { ok: true };
}

/**
 * Save which categories of notification are allowed to push. Called directly
 * from the Settings toggles (not a form) so it takes a plain preference object.
 * These live on the caller's own profile row (self-writable, non-authority),
 * and gate push only — the in-app feed is untouched.
 */
export async function updateNotificationPrefs(
  prefs: NotificationPrefs,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('profiles')
    .update({
      notify_plans: Boolean(prefs.plans),
      notify_suggestions: Boolean(prefs.suggestions),
      notify_reminders: Boolean(prefs.reminders),
      notify_messages: Boolean(prefs.messages),
      notify_social: Boolean(prefs.social),
    })
    .eq('id', user.id);
  if (error) {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.notifications', error, {
      userId: user.id,
    });
  }

  revalidatePath('/settings');
  return { ok: true };
}

export async function updateQuietHours(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUserOrRedirect();

  const rawStart = formData.get('quiet_start');
  const rawEnd = formData.get('quiet_end');
  const start = rawStart === '' || rawStart === null ? null : Number(rawStart);
  const end = rawEnd === '' || rawEnd === null ? null : Number(rawEnd);
  // A window needs both ends. With one side Off, push treated quiet hours as
  // off entirely while SMS filled the missing side with its 10pm/8am default,
  // so the two channels went quiet at different times; equal ends are an
  // empty window. Both saved "successfully" and did nothing anyone chose.
  if ((start === null) !== (end === null)) {
    return validation('Choose both a start and an end for quiet hours, or set both to Off.');
  }
  if (start !== null && start === end) {
    return validation('Quiet hours need to start and end at different times.');
  }
  // The zone the hours are read in. Optional so an older form without the
  // field still saves the hours; an explicit choice must be one Intl knows,
  // because the sweeps hand it straight to Intl and to Postgres.
  const rawZone = formData.get('timezone');
  const timezone = rawZone === null ? null : exactTimeZone(String(rawZone));
  if (rawZone !== null && !timezone) {
    return validation('Choose a time zone from the list.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      quiet_hours_start: start,
      quiet_hours_end: end,
      ...(timezone ? { timezone } : {}),
    })
    .eq('id', user.id);
  if (error) {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.quiet-hours', error, {
      userId: user.id,
    });
  }

  revalidatePath('/settings');
  // Home greets by the stored zone before the browser corrects it.
  if (timezone) revalidatePath('/');
  return { ok: true };
}

/** Revoke the current calendar-subscription link by rotating the token. Any
 *  calendar following the old URL simply stops updating. */
export async function regenerateCalendarToken(): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const { error } = await supabase
    .from('profiles')
    .update({ calendar_token: crypto.randomUUID() })
    .eq('id', user.id);
  if (error) {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.calendar-token', error, {
      userId: user.id,
    });
  }
  revalidatePath('/settings');
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/welcome');
}

/**
 * Turn the daily digest on or off, and say when it should land.
 *
 * Off by default (see the migration): adding an outbound message to someone's
 * phone without asking is the wrong default even when the message is good.
 *
 * The hour is stored as a local hour, not an instant, because "8am" is what
 * someone means and the sweep is what should do the time-zone arithmetic.
 */
export async function updateDigestPreference(
  enabled: boolean,
  hour: number,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Clamp rather than reject: an out-of-range hour is a broken client, not a
  // decision the reader made, and refusing their whole change over it helps
  // nobody. The CHECK constraint is still the backstop.
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.round(hour))) : 8;

  const { error } = await supabase
    .from('profiles')
    .update({ digest_enabled: enabled, digest_hour: safeHour })
    .eq('id', user.id);
  if (error) {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.digest', error, {
      userId: user.id,
    });
  }
  revalidatePath('/settings');
  return { ok: true };
}
