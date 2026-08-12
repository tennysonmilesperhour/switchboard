/**
 * Every failure Switchboard shows a human carries a code.
 *
 * The reason is the invite-link saga. "This invite link isn't active" was shown
 * for at least four unrelated causes — a switched-off link, a plan mid-poll, a
 * rotated token, and a deployment reading a database that was missing the
 * migration. One sentence covered all four, so a screenshot of it told nobody
 * anything: not the recipient, not the host, and not the person debugging. Every
 * round of diagnosis started from zero.
 *
 * A code fixes that. `SB-LINK-OFF` in a screenshot is the whole diagnosis. And
 * because the same code goes into the server log line, a user's report and the
 * log are joinable without guessing at timestamps.
 *
 * ————————————————————————— what gets a code —————————————————————————
 *
 * Operational failures do: anything where the reader cannot tell from the
 * message what went wrong or whose fault it is. "Could not save. Try again."
 * is the shape that needs one.
 *
 * Validation does NOT. "Add your name." already names the cause and the fix in
 * three words; bolting `SB-FORM-NAME` onto it adds noise and teaches people to
 * ignore codes. The rule: if the sentence already tells the reader exactly what
 * to change, it needs no code. `src/lib/errors.test.ts` documents this boundary
 * so it stays a decision rather than a drift.
 *
 * ————————————————————————— writing a new one —————————————————————————
 *
 * Codes are `SB-<AREA>-<REASON>`, readable rather than numbered: a slug that
 * says what happened beats an opaque number in both a screenshot and a `grep`.
 * They are permanent — never renumber, never reuse a retired one for something
 * else, or old screenshots and old logs start lying.
 *
 * Each entry answers three questions:
 *   - `message`: what happened, in the reader's terms.
 *   - `fix`:     the next step, or null when there is genuinely nothing they
 *                can do (then the UI says we're on it, rather than inventing
 *                busywork like "try again" for a misconfigured server).
 *   - `actor`:   who can actually resolve it. This is what stops us telling a
 *                guest to fix a host's setting, or a host to fix a deploy.
 */

/** Who is in a position to do something about it. */
export type ErrorActor =
  /** The person reading the message. */
  | 'reader'
  /** The plan's host — the reader can only pass the message along. */
  | 'host'
  /** Whoever runs the deployment. Nobody in the app can fix it. */
  | 'operator';

export interface SwitchboardError {
  code: ErrorCode;
  message: string;
  fix: string | null;
  actor: ErrorActor;
}

const REGISTRY = {
  // ————————————————————————— deployment & configuration —————————————————————
  // Nothing a user did. These exist because a misconfigured deployment used to
  // masquerade as ordinary user-facing failure — a missing service-role key
  // told every recipient their invitation was withdrawn.
  'SB-CONFIG-DB': {
    message: 'Switchboard can’t reach its database right now.',
    fix: null,
    actor: 'operator',
  },
  'SB-CONFIG-ORIGIN': {
    message: 'This deployment has no valid public address configured, so links can’t be built.',
    fix: null,
    actor: 'operator',
  },
  'SB-CONFIG-SCHEMA': {
    message: 'The database is older than this version of the app expects.',
    fix: null,
    actor: 'operator',
  },
  'SB-CONFIG-STORAGE': {
    message: 'File storage isn’t set up on this deployment.',
    fix: null,
    actor: 'operator',
  },
  'SB-CONFIG-EMAIL': {
    message: 'Email delivery isn’t configured, so invitations can’t be emailed.',
    fix: null,
    actor: 'operator',
  },
  'SB-CONFIG-SMS': {
    message: 'Text delivery isn’t configured, so invitations can’t be texted.',
    fix: null,
    actor: 'operator',
  },
  'SB-CONFIG-PUSH': {
    message: 'Push notifications aren’t configured on this deployment.',
    fix: null,
    actor: 'operator',
  },

  // ————————————————————————— invite links —————————————————————————
  // One code per REASON a link doesn't open, because one sentence for all of
  // them is exactly what made this undiagnosable.
  'SB-LINK-UNKNOWN': {
    message: 'This link doesn’t point at a plan.',
    fix: 'It may have been replaced with a newer one. Ask whoever sent it for a fresh link.',
    actor: 'reader',
  },
  'SB-LINK-OFF': {
    message: 'The host turned this invite link off.',
    fix: 'Ask them to turn it back on, or to send you a new one.',
    actor: 'host',
  },
  'SB-LINK-DRAFT': {
    message: 'This plan hasn’t been published yet.',
    fix: 'Ask whoever sent the link to send it again once the plan is live.',
    actor: 'host',
  },
  'SB-LINK-CANCELLED': {
    message: 'This plan was called off.',
    fix: null,
    actor: 'reader',
  },
  'SB-LINK-PAST': {
    message: 'This plan has already happened.',
    fix: null,
    actor: 'reader',
  },
  'SB-LINK-DECIDING': {
    message: 'The date for this plan isn’t settled yet.',
    fix: 'You can still say you’re in — you’ll get the date the moment it lands.',
    actor: 'reader',
  },
  'SB-LINK-LOOKUP': {
    message: 'Switchboard couldn’t look this invitation up.',
    fix: null,
    actor: 'operator',
  },
  // Boards are their own invite surface with their own link shape, so they get
  // their own area rather than borrowing the plan-link codes.
  'SB-BOARD-UNKNOWN': {
    message: 'This board invite link doesn’t match any board.',
    fix: 'It may have been turned off or replaced. Ask whoever shared it for an up-to-date one.',
    actor: 'reader',
  },
  // Zones carry their own link and their own membership, so they get their own
  // area for the same reason boards did.
  'SB-ZONE-UNKNOWN': {
    message: 'This zone invite link doesn’t match any zone.',
    fix: 'It may have been replaced since it was sent. Ask the organizer for a current one.',
    actor: 'reader',
  },
  'SB-ZONE-LINK': {
    message: 'Switchboard couldn’t make an invite link for this zone.',
    fix: null,
    actor: 'operator',
  },
  'SB-ZONE-ACCESS': {
    message: 'Only the organizer can manage who’s in this zone.',
    fix: 'Ask whoever set the zone up.',
    actor: 'host',
  },
  'SB-ZONE-SAVE': {
    message: 'Switchboard couldn’t save that change to the zone.',
    fix: null,
    actor: 'operator',
  },

  // ————————————————————————— answering an invitation —————————————————————————
  'SB-RSVP-AUTH': {
    message: 'Answering an invitation needs an account.',
    fix: 'Sign in — it takes a moment, and you’ll come straight back here.',
    actor: 'reader',
  },
  'SB-RSVP-CLOSED': {
    message: 'This plan isn’t taking answers right now.',
    fix: 'Ask the host whether it’s still happening.',
    actor: 'host',
  },
  'SB-RSVP-NAME': {
    message: 'The host needs a name to put against your answer.',
    fix: 'Add your name and try again.',
    actor: 'reader',
  },
  'SB-RSVP-GONE': {
    message: 'This invitation isn’t here anymore.',
    fix: 'It may have expired or been withdrawn. Ask the host for a new one.',
    actor: 'host',
  },
  'SB-RSVP-SAVE': {
    message: 'Your answer didn’t save.',
    fix: 'Try again — if it keeps failing, the host can still add you by hand.',
    actor: 'reader',
  },
  'SB-RSVP-APPROVAL': {
    message: 'This RSVP is waiting on a parent or guardian.',
    fix: 'Ask the guardian to check their email for the approval link.',
    actor: 'reader',
  },

  // ————————————————————————— identity & permission —————————————————————————
  'SB-AUTH-REQUIRED': {
    message: 'You need to be signed in to do that.',
    fix: 'Sign in and try again.',
    actor: 'reader',
  },
  'SB-AUTH-EXPIRED': {
    message: 'Your session ended while this page was open.',
    fix: 'Sign in again — you’ll come back to where you were.',
    actor: 'reader',
  },
  /**
   * The credentials were right and the account exists — it just never had its
   * email confirmed, so Supabase refuses the session. This used to render as
   * "That email, username, or password did not work.", which is the one thing
   * it definitively was not: the reader had just chosen that password, so the
   * message sent them to re-check credentials that were already correct.
   */
  'SB-AUTH-UNCONFIRMED': {
    message: 'This account’s email address hasn’t been confirmed yet.',
    fix: 'Open the confirmation link we emailed you — check spam and promotions. You can send a fresh one below.',
    actor: 'reader',
  },
  /**
   * The credentials were right and the account is suspended. Moderation is not
   * something the reader can undo from the sign-in form, and pretending their
   * password was wrong sends them round a loop that cannot end.
   */
  'SB-AUTH-SUSPENDED': {
    message: 'This account is suspended, so it can’t be signed into.',
    fix: null,
    actor: 'operator',
  },
  'SB-AUTH-RESEND': {
    message: 'Switchboard couldn’t send that confirmation email.',
    fix: 'Try again in a few minutes, or use “Forgot password?” — that link confirms the address too.',
    actor: 'reader',
  },
  'SB-PERM-HOST': {
    message: 'Only the plan’s host can do that.',
    fix: 'Ask the host, or ask them to make you a co-host.',
    actor: 'host',
  },
  'SB-PERM-DENIED': {
    message: 'You don’t have access to that.',
    fix: null,
    actor: 'reader',
  },
  'SB-RATE-LIMIT': {
    message: 'That’s a lot of attempts in a short time.',
    fix: 'Give it a few minutes and try again.',
    actor: 'reader',
  },

  // ————————————————————————— saving & loading —————————————————————————
  // Grouped by what the reader was doing, not by which table failed: "your plan
  // didn't save" is actionable, "invites.insert failed" is not.
  'SB-PLAN-CREATE': {
    message: 'Your plan didn’t get created.',
    fix: 'Try again — nothing was sent, so nobody has been invited yet.',
    actor: 'reader',
  },
  'SB-PLAN-SAVE': {
    message: 'Your changes to this plan didn’t save.',
    fix: 'Try again. Reload first if you’ve had this page open a while.',
    actor: 'reader',
  },
  'SB-PLAN-LOAD': {
    message: 'Switchboard couldn’t load your plans.',
    fix: 'Reload the page.',
    actor: 'reader',
  },
  'SB-PLAN-DELETE': {
    message: 'This plan couldn’t be deleted.',
    fix: 'Try again in a moment.',
    actor: 'reader',
  },
  'SB-PLAN-ACCESS': {
    message: 'Only the host can change this plan.',
    fix: 'Ask the host, or a co-host they’ve added.',
    actor: 'host',
  },
  // Distinct from SB-PLAN-ACCESS on purpose. That one means "we asked, and the
  // answer is no". This one means we could not ask — and telling a host they
  // are not the host, when the truth is that a check failed, sends them looking
  // for a permission problem that does not exist.
  'SB-PLAN-AUTHZ': {
    message: 'Switchboard couldn’t confirm you host this plan.',
    fix: null,
    actor: 'operator',
  },
  // The suggestion box clears the moment you submit, so an idea that fails to
  // save leaves a screen identical to one that saved nothing at all: empty box,
  // unchanged list, no explanation. Anyone would read that as "the app ignored
  // me" and retype it.
  'SB-POLL-SUGGEST': {
    message: 'Your idea didn’t reach the group.',
    fix: 'It’s still in the box — try again. Reload first if this page has been open a while.',
    actor: 'reader',
  },
  'SB-INVITE-SEND': {
    message: 'Those invitations didn’t go out.',
    fix: 'Try again — anyone already invited keeps their invitation.',
    actor: 'reader',
  },
  'SB-SHARE-SAVE': {
    message: 'The invite link setting didn’t change.',
    fix: 'Try again. The link is still in whatever state it was before.',
    actor: 'reader',
  },
  'SB-PROFILE-SAVE': {
    message: 'Your profile changes didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-SETTINGS-SAVE': {
    message: 'That setting didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-UPLOAD-FAILED': {
    message: 'That file didn’t upload.',
    fix: 'Check the file is an image or audio clip under the size limit, then try again.',
    actor: 'reader',
  },
  'SB-LOCATION-DENIED': {
    message: 'Switchboard couldn’t read a location from your device.',
    fix: 'Allow location access in your browser settings, or type the address instead.',
    actor: 'reader',
  },
  'SB-NOTIFY-SAVE': {
    message: 'That notification didn’t update.',
    fix: 'Reload and try again.',
    actor: 'reader',
  },
  'SB-VERIFY-START': {
    message: 'Switchboard couldn’t start verifying that contact.',
    fix: 'Check the address or number, then try again.',
    actor: 'reader',
  },

  // ————————————————————————— last resort —————————————————————————
  // The route-level error boundary and anything genuinely unclassified. Always
  // rendered with the Next.js digest beside it, which is what makes even an
  // unclassified crash traceable to a server log line.
  'SB-APP-CRASH': {
    message: 'Something slipped on our end, not yours.',
    fix: 'Give it another try in a moment.',
    actor: 'reader',
  },
  /**
   * The root layout itself threw, so `src/app/global-error.tsx` renders without
   * the app's stylesheet or its imports and writes this code out as a literal.
   * A test asserts the two stay in step.
   */
  'SB-LAYOUT-CRASH': {
    message: 'Switchboard couldn’t finish loading.',
    fix: 'Reload the page. If it keeps happening, try again in a few minutes.',
    actor: 'reader',
  },
  'SB-UNKNOWN': {
    message: 'Something went wrong.',
    fix: 'Try again.',
    actor: 'reader',
  },
} as const satisfies Record<string, Omit<SwitchboardError, 'code'>>;

export type ErrorCode = keyof typeof REGISTRY;

export const ERROR_CODES = Object.keys(REGISTRY) as ErrorCode[];

/** The full entry for a code. */
export function errorFor(code: ErrorCode): SwitchboardError {
  return { code, ...REGISTRY[code] };
}

/**
 * The shape every server action returns.
 *
 * `code` and `fix` are optional so a success, or a pure validation failure that
 * needs no code, is still this type. What matters is that every action CAN
 * carry a code, so the UI can render one wherever there is one to render —
 * before this, most actions had no field to put it in, which is why "Could not
 * save. Try again." was as much as any of them could say.
 */
export interface ActionResult {
  ok: boolean;
  error?: string;
  code?: ErrorCode;
  fix?: string | null;
}

/**
 * A failed action result, in the shape every server action returns.
 *
 * `error` stays a plain sentence so existing call sites that only render
 * `result.error` keep working unchanged; `code` and `fix` are what the newer
 * surfaces use to show the reader something they can act on.
 */
export interface Failure {
  ok: false;
  code: ErrorCode;
  error: string;
  fix: string | null;
}

/**
 * Build a failure from a code, optionally overriding the sentence when a call
 * site has more specific context than the registry can.
 *
 * The override replaces the message only — the code and its `fix` survive, so a
 * bespoke sentence can never quietly drop the diagnosis.
 */
export function failure(code: ErrorCode, message?: string): Failure {
  const entry = errorFor(code);
  return { ok: false, code, error: message ?? entry.message, fix: entry.fix };
}

/**
 * Which code a logged operational failure corresponds to, keyed by the `area`
 * string its `reportOperationalError` call already passes.
 *
 * A central table rather than a fourth argument at every call site: one place to
 * read the whole mapping, and `errors.test.ts` scans the source for every area
 * string in use and fails if any of them is missing here. That scan is what
 * makes "every operational failure in the app carries a code" a checked claim
 * rather than a hope — a new `reportOperationalError` with an unmapped area
 * breaks the build.
 */
const AREA_CODES: Record<string, ErrorCode> = {
  // Deployment can't reach the database at all. These three are the ones that
  // used to render as "your invitation was withdrawn".
  'share-link.lookup': 'SB-CONFIG-DB',
  'rsvp.lookup': 'SB-CONFIG-DB',
  'join.lookup': 'SB-CONFIG-DB',

  // The query ran and failed — a real error, not an absent row.
  'share-link.event-lookup': 'SB-LINK-LOOKUP',
  'join.event-lookup': 'SB-LINK-LOOKUP',
  'rsvp.invite-lookup': 'SB-LINK-LOOKUP',
  'rsvp.event-lookup': 'SB-LINK-LOOKUP',

  // Plans
  'plans.load': 'SB-PLAN-LOAD',
  'plans.invited-events': 'SB-PLAN-LOAD',
  'event-create': 'SB-PLAN-CREATE',
  'event-update': 'SB-PLAN-SAVE',
  'event-visibility': 'SB-PLAN-SAVE',
  'authz.event-manager': 'SB-PLAN-AUTHZ',
  'poll.follow-up': 'SB-PLAN-SAVE',
  'poll.follow-up-remove': 'SB-PLAN-SAVE',
  'event-locate': 'SB-PLAN-SAVE',
  'event.delete': 'SB-PLAN-DELETE',
  'event.delete-room': 'SB-PLAN-DELETE',

  // Getting invitations out
  'event-initial-delivery': 'SB-INVITE-SEND',
  'add-people': 'SB-INVITE-SEND',
  'add-people-cascade': 'SB-INVITE-SEND',
  'remove-invite-cascade': 'SB-INVITE-SEND',
  'resend-invite-cascade': 'SB-INVITE-SEND',
  'invite-connection-now': 'SB-INVITE-SEND',
  'invite-connection-deliver': 'SB-INVITE-SEND',
  'event-invite-link': 'SB-SHARE-SAVE',
  'event-share-link': 'SB-SHARE-SAVE',
  'event-share-link-rotate': 'SB-SHARE-SAVE',

  // Zone access
  'zone.invite-link': 'SB-ZONE-LINK',
  'zone.invite-link-rotate': 'SB-ZONE-LINK',
  'zone.join-request': 'SB-ZONE-SAVE',
  'zone.resolve-request': 'SB-ZONE-SAVE',
  'zone.membership': 'SB-ZONE-SAVE',
  'zone.visibility': 'SB-ZONE-SAVE',

  // Answering
  'share-rsvp.respond': 'SB-RSVP-SAVE',
  'guest-rsvp.claim': 'SB-RSVP-SAVE',
  'guest-rsvp.decline-note': 'SB-RSVP-SAVE',
  'invite-decline.message': 'SB-RSVP-SAVE',
  'invite-claim.token': 'SB-RSVP-SAVE',
  'parental-approval.create': 'SB-RSVP-SAVE',
  'parental-approval.resolve': 'SB-RSVP-SAVE',
  'parental-approval.email': 'SB-RSVP-SAVE',

  // Profile & settings
  'onboarding': 'SB-PROFILE-SAVE',
  'profile-save': 'SB-PROFILE-SAVE',
  'invite-claim.contact': 'SB-PROFILE-SAVE',
  'settings.interests': 'SB-SETTINGS-SAVE',
  'settings.appearance': 'SB-SETTINGS-SAVE',
  'settings.discoverability': 'SB-SETTINGS-SAVE',
  'settings.sabbatical': 'SB-SETTINGS-SAVE',
  'settings.quiet-hours': 'SB-SETTINGS-SAVE',

  // Getting into an account
  'auth.resend-confirmation': 'SB-AUTH-RESEND',

  // Uploads
  'audio-upload': 'SB-UPLOAD-FAILED',
  'image-upload': 'SB-UPLOAD-FAILED',
};

/** Areas with a registered code — the set the completeness test checks against. */
export const MAPPED_ERROR_AREAS = Object.keys(AREA_CODES);

/**
 * The code for a logged area. Falls back to `SB-UNKNOWN` rather than throwing:
 * a missing mapping must never turn a logged failure into a crash, and the test
 * catches it long before production.
 */
export function codeForArea(area: string): ErrorCode {
  return AREA_CODES[area] ?? 'SB-UNKNOWN';
}

/**
 * How a code renders next to a message: short, quiet, and copyable.
 *
 * Deliberately not hidden behind a "details" toggle. The whole point is that it
 * survives a screenshot taken by someone who was not trying to file a bug
 * report — which is how every one of these has actually reached us.
 */
export function errorRef(code: ErrorCode, digest?: string | null): string {
  return digest ? `${code} · ${digest}` : code;
}
