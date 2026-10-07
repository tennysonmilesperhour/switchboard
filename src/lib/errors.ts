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
  'SB-SMS-REPLY': {
    message: 'This text reply could not complete your RSVP.',
    fix: 'Open the invitation to view its status and respond.',
    actor: 'reader',
  },
  'SB-SMS-PREFERENCES': {
    message: 'Could not save your SMS preferences.',
    fix: 'Check that your current phone number is verified, then try again.',
    actor: 'reader',
  },
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
  'SB-CONFIG-CRON': {
    message: 'The background sweep has stopped reporting successful runs.',
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
    message: 'Text delivery isn’t configured, so verification codes and invitations cannot be sent.',
    fix: null,
    actor: 'operator',
  },
  'SB-CONFIG-PUSH': {
    message: 'Push notifications aren’t configured on this deployment.',
    fix: null,
    actor: 'operator',
  },
  'SB-CONFIG-AUTH': {
    message: 'Account management isn’t fully configured on this deployment.',
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
  // The zone list failing to load used to read as "no zones here", which sent
  // organizers off to create a duplicate of one that existed.
  'SB-ZONE-LOAD': {
    message: 'Switchboard couldn’t load zones just now.',
    fix: 'Reload the page. Nothing about your zones changed.',
    actor: 'reader',
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
  'SB-RSVP-GUARDIAN': {
    message: 'This guardian request does not belong to your RSVP.',
    fix: 'Open your own invitation and try again, or ask the host for help.',
    actor: 'reader',
  },
  // The guardian request saved and the RSVP is still held; only the email to
  // the guardian failed. Its own code rather than SB-RSVP-SAVE because nothing
  // was lost and the next step differs: "We've emailed the guardian" used to
  // show whether or not the email went anywhere.
  'SB-GUARDIAN-EMAIL': {
    message: 'The request is saved, but the email to the guardian didn’t go out.',
    fix: 'Check the address and send it again.',
    actor: 'reader',
  },
  // The Give Space heads-up failing to record itself. Deliberately its own
  // code rather than SB-RSVP-SAVE: the RSVP saved fine, and nobody is shown
  // this. It exists so the log line is diagnosable, because the symptom
  // otherwise is a safety notice that silently never appears — and the person
  // it was meant to protect has no way to know it is missing.
  'SB-SPACE-NOTE': {
    message: 'Switchboard couldn’t record a Give Space heads-up.',
    fix: null,
    actor: 'operator',
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
  'SB-AUTH-SIGNIN': {
    message: 'Switchboard couldn’t sign you in right now.',
    fix: 'Try again in a moment.',
    actor: 'reader',
  },
  'SB-AUTH-SIGNUP': {
    message: 'Switchboard couldn’t finish creating that account.',
    fix: 'Try again. If an account was created, signing in is safe.',
    actor: 'reader',
  },
  'SB-AUTH-RESET': {
    message: 'Switchboard couldn’t update that password.',
    fix: 'Request a fresh reset link and try again.',
    actor: 'reader',
  },
  /**
   * An emailed confirmation, magic or recovery link that no longer verifies.
   * "Already used" is in the sentence on purpose: mail scanners open links
   * before people do, so the reader may well be confirmed already and only
   * needs to sign in.
   */
  'SB-AUTH-LINK': {
    message: 'That emailed link has expired or was already used.',
    fix: 'Sign in below. If you still need a link, ask for a fresh one from there.',
    actor: 'reader',
  },
  // Google sign-in, one code per way the round trip can end short. They used
  // to be three different sentences with nothing a log line could be matched
  // against. `SB-OAUTH-*` rather than `SB-AUTH-OAUTH-*` because a code is
  // exactly one area and one reason (errors.test.ts).
  'SB-OAUTH-DENIED': {
    message: 'Google didn’t complete the sign-in.',
    fix: 'Try again, or sign in with your email or username below.',
    actor: 'reader',
  },
  'SB-OAUTH-EXCHANGE': {
    message: 'Google approved the sign-in, but Switchboard couldn’t finish it.',
    fix: 'Try again in this same browser. If it keeps happening, sign in with your email or username.',
    actor: 'reader',
  },
  'SB-OAUTH-MISSING': {
    message: 'Google sent you back without a sign-in code.',
    fix: 'Try again, or sign in with your email or username below.',
    actor: 'reader',
  },
  // Before Google is even reached: the auth server would not hand out a
  // sign-in address (provider switched off, or a redirect it does not allow).
  'SB-OAUTH-START': {
    message: 'Google sign-in isn’t available right now.',
    fix: 'Sign in with your email or username instead.',
    actor: 'reader',
  },
  'SB-AUTH-DELETE': {
    message: 'Switchboard couldn’t delete that account.',
    fix: 'Try again in a moment.',
    actor: 'reader',
  },
  'SB-ACCOUNT-EXPORT': {
    message: 'Switchboard couldn’t prepare your data download.',
    fix: 'Try again in a moment.',
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
  'SB-PLAN-OPEN': {
    message: 'This plan couldn’t be opened right now.',
    fix: 'Reload the page. The plan and your place in it are unchanged.',
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
  // Run it back / Schedule the next one. Anything made before the failure is
  // removed, so "nothing was sent" is true when the host reads it (G27). It
  // used to redirect back to the old plan with no word at all.
  'SB-PLAN-CLONE': {
    message: 'Switchboard couldn’t set up the new plan.',
    fix: 'Nothing was sent. Try again in a moment.',
    actor: 'reader',
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
  // Editing or removing an idea. The database refuses silently (zero rows)
  // for anyone but the idea's author or the host, and for everyone once the
  // poll is decided; the message names both so the reader knows which applies.
  'SB-POLL-EDIT': {
    message: 'That idea didn’t change.',
    fix: 'Only whoever suggested it or the host can change it, and only while the poll is open. Reload to see the current list.',
    actor: 'reader',
  },
  // A post someone is trying to flag has to still exist, and has to be one they
  // can see. Both come out as "not found" on purpose: a stranger probing post
  // ids should not learn which of them are real.
  'SB-POST-MISSING': {
    message: 'That post isn’t there any more.',
    fix: 'It may have been taken down already. Reload the board.',
    actor: 'reader',
  },
  'SB-POST-REPORT': {
    message: 'That report didn’t reach the moderators.',
    fix: 'Try again. If it keeps failing, report the person instead.',
    actor: 'reader',
  },
  'SB-POST-AUTHOR': {
    message: 'Only whoever posted this can turn it into a plan.',
    fix: 'Ask them to — or post your own and make that one a plan.',
    actor: 'reader',
  },
  // The plan exists; only the board's pointer to it is missing. Saying "could
  // not create the plan" here would be false, and would get a second one made.
  'SB-POST-LINK': {
    message: 'The plan was created, but the board post didn’t link to it.',
    fix: 'It’s on your plans list — open it from there.',
    actor: 'reader',
  },
  // Availability grid. Its own area: "when people are free" is a different
  // thing from the plan itself, and a code that says so is more use in a
  // screenshot than a generic save failure.
  'SB-FREE-SLOT': {
    message: 'Some of those times aren’t on the grid any more.',
    fix: 'Reload the plan — the week it offers has moved on since you opened it.',
    actor: 'reader',
  },
  'SB-FREE-SAVE': {
    message: 'When you’re free didn’t save.',
    fix: 'Try again. Nothing partial was kept, so you won’t end up with half of it stored.',
    actor: 'reader',
  },
  'SB-FREE-POLL': {
    message: 'Those times didn’t make it onto the poll.',
    fix: 'Try again, or add them as suggestions by hand.',
    actor: 'reader',
  },
  'SB-POLL-CLOSED': {
    message: 'Voting is closed on this poll.',
    fix: 'Ask the host if the group still needs another option or vote.',
    actor: 'host',
  },
  // A host moving a decision along: locking suggestions, closing the vote,
  // choosing the winner. These used to return nothing at all, so a failure
  // looked exactly like a button that did not work.
  'SB-POLL-DECIDE': {
    message: 'That decision didn’t move forward.',
    fix: 'Reload to see where the poll stands, then try again.',
    actor: 'reader',
  },
  // Clearing a match off Home. Its own code rather than a borrowed save
  // failure: the reader's worry when a dismissed card reappears is "did I just
  // un-match this person?", and the message has to answer that before it
  // answers anything else.
  'SB-MATCH-CLEAR': {
    message: 'That match didn’t clear off your Home.',
    fix: 'Try again. Nothing about the match itself changed — it’s still on Mutual, and the other person saw nothing either way.',
    actor: 'reader',
  },
  'SB-MOMENT-ACCESS': {
    message: 'This shared moment is no longer available to you.',
    fix: 'Refresh Moments to see who is still open to connecting.',
    actor: 'reader',
  },
  'SB-MOMENT-SAVE': {
    message: 'That Moments response didn’t save.',
    fix: 'Refresh Moments and try again.',
    actor: 'reader',
  },
  // Connecting a calendar. Its own area: "we couldn't read your calendar" and
  // "your plan didn't save" are different problems with different fixes, and a
  // shared code would send someone to the wrong one.
  'SB-CAL-FETCH': {
    message: 'Switchboard couldn’t open that calendar.',
    fix: 'Check the address is still shared from your calendar’s settings, then paste it again.',
    actor: 'reader',
  },
  'SB-CAL-READ': {
    message: 'That address opened, but there was no calendar in it.',
    fix: 'It’s usually the secret iCal address that’s wanted — the one ending in .ics — rather than the page you view your calendar on.',
    actor: 'reader',
  },
  'SB-CAL-SAVE': {
    message: 'Your calendar connection didn’t save.',
    fix: 'Try again. Nothing partial was kept.',
    actor: 'reader',
  },
  'SB-CAL-GONE': {
    message: 'There’s no calendar connected to refresh.',
    fix: 'Connect one in Settings → Your calendar.',
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
  // ————————————————————————— reading what's there —————————————————————————
  // A read that failed and rendered as an empty section is the most misleading
  // failure there is: "You're all caught up" and "nothing here yet" are claims,
  // and a query that errored has no business making them. Settings did worse —
  // it rendered defaults for an unread profile, and the next Save wrote them
  // over the real values. Each section that can fail on its own gets its own
  // code, so one broken card never takes a page down and a screenshot still
  // says which read it was.
  'SB-SETTINGS-LOAD': {
    message: 'Some of your settings didn’t load, so they’re hidden rather than shown wrong.',
    fix: 'Reload the page. Nothing was changed, and saving is off until they load.',
    actor: 'reader',
  },
  'SB-PROFILE-LOAD': {
    message: 'Your profile didn’t load.',
    fix: 'Reload the page. Nothing was saved or changed.',
    actor: 'reader',
  },
  'SB-INVITE-LOAD': {
    message: 'Your invitations didn’t load.',
    fix: 'Reload the page. Nothing about them changed, and no answer was sent.',
    actor: 'reader',
  },
  'SB-SIGNAL-LOAD': {
    message: 'Your signals, and who they can reach, didn’t load.',
    fix: 'Reload the page before you send one.',
    actor: 'reader',
  },
  'SB-AROUND-LOAD': {
    message: 'Who’s around right now didn’t load.',
    fix: 'Reload the page.',
    actor: 'reader',
  },
  'SB-MATCH-LOAD': {
    message: 'Your matches didn’t load.',
    fix: 'Reload the page. Nothing about them changed — they’re still on Mutual.',
    actor: 'reader',
  },
  'SB-CONNECTION-LOAD': {
    message: 'Your connections didn’t load, so this page may look emptier than it is.',
    fix: 'Reload the page. Your people list hasn’t changed.',
    actor: 'reader',
  },
  'SB-INTRO-LOAD': {
    message: 'Introductions waiting for you didn’t load.',
    fix: 'Reload the page. Nobody was told anything.',
    actor: 'reader',
  },
  'SB-RITUAL-LOAD': {
    message: 'Your rituals didn’t load.',
    fix: 'Reload the page. Nothing about them changed.',
    actor: 'reader',
  },
  'SB-RADAR-LOAD': {
    message: 'Reconnection suggestions didn’t load.',
    fix: 'Reload the page.',
    actor: 'reader',
  },
  'SB-ENERGY-LOAD': {
    message: 'Reflections on your recent plans didn’t load.',
    fix: 'Reload the page.',
    actor: 'reader',
  },
  'SB-REFLECT-LOAD': {
    message: 'Your look-back deck didn’t load.',
    fix: 'Reload the page. Nothing you already swiped was lost.',
    actor: 'reader',
  },
  'SB-ANNOUNCEMENT-LOAD': {
    message: 'Announcements from your hosts didn’t load.',
    fix: 'Reload the page, or open the plan to read them there.',
    actor: 'reader',
  },
  'SB-NOTIFY-LOAD': {
    message: 'Your notifications didn’t load.',
    fix: 'Reload the page. Nothing was marked read or cleared.',
    actor: 'reader',
  },
  'SB-UPLOAD-FAILED': {
    message: 'That file didn’t upload.',
    fix: 'Check the file is an image or audio clip under the size limit, then try again.',
    actor: 'reader',
  },
  // The browser's microphone or recorder failed to start or broke mid-way
  // (G33). Nothing reached the server, so there is no log line; the code is
  // what tells a screenshot of it apart from a blocked microphone or an empty
  // clip.
  'SB-VOICE-RECORD': {
    message: 'The recording couldn’t continue: this browser’s microphone or recorder hit an error. Your microphone is off.',
    fix: 'Try recording again, or write your message instead.',
    actor: 'reader',
  },
  // A saved voice note the browser refused or failed to play: a blocked or
  // expired link, or an unsupported format. Nothing reaches the server.
  'SB-VOICE-PLAY': {
    message: 'This voice note didn’t play.',
    fix: 'Reload the page to get a fresh link, then try again.',
    actor: 'reader',
  },
  'SB-SCOPE-BOARD': {
    message: 'The shared checklist didn’t load.',
    fix: 'Reload the page. Your ticks are saved as you make them.',
    actor: 'reader',
  },
  'SB-FEEDBACK-SAVE': {
    message: 'That feedback didn’t send.',
    fix: 'Try again in a moment. If it keeps failing, text the screenshot over instead.',
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
  'SB-NOTIFY-CLEAR': {
    message: 'Switchboard couldn’t clear your notifications.',
    fix: 'Reload and try again.',
    actor: 'reader',
  },
  // Never shown to a reader: push is best-effort and the app never blocks on
  // it. It exists so a provider rejecting a live subscription (anything other
  // than 404/410, which just prune it) is a searchable log line, distinct from
  // SB-CONFIG-PUSH, which means the VAPID keys are missing.
  // Never shown to a reader either: the domain action has already succeeded
  // and must not fail because its announcement could not be recorded. It makes
  // "I never got told" answerable from the logs, which a bare console line was
  // not.
  'SB-NOTIFY-RECORD': {
    message: 'A notification couldn’t be saved to the inbox.',
    fix: null,
    actor: 'operator',
  },
  'SB-PUSH-SEND': {
    message: 'A push notification couldn’t be delivered.',
    fix: null,
    actor: 'operator',
  },
  // Never shown to a reader: the hourly sweep retries an undelivered digest
  // instead of marking it sent, and this is the log line that says why it had
  // to (no push reached a device and the email fallback failed too).
  'SB-DIGEST-SEND': {
    message: 'A daily summary couldn’t be delivered.',
    fix: null,
    actor: 'operator',
  },
  'SB-PUSH-SAVE': {
    message: 'Switchboard couldn’t turn on push for this device.',
    fix: 'Try again. If it keeps failing, reload the page first.',
    actor: 'reader',
  },
  'SB-VERIFY-CONFIG': {
    message: 'Phone verification is unavailable because Switchboard’s text service needs setup.',
    fix: null,
    actor: 'operator',
  },
  'SB-VERIFY-DELIVERY': {
    message: 'The text service could not send your verification code.',
    fix: null,
    actor: 'operator',
  },
  'SB-VERIFY-START': {
    message: 'Switchboard couldn’t start verifying that contact.',
    fix: 'Check the address or number, then try again.',
    actor: 'reader',
  },
  'SB-VERIFY-STOPPED': {
    message: 'This number has texted STOP, so Switchboard cannot text it a code.',
    fix: 'Text START to the Switchboard number, then request the code again.',
    actor: 'reader',
  },
  'SB-VERIFY-CHECK': {
    message: 'Switchboard couldn’t check that verification code.',
    fix: 'Request a new code and try again.',
    actor: 'reader',
  },
  'SB-ANNOUNCEMENT-SAVE': {
    message: 'That announcement didn’t save.',
    fix: 'Try again. Nobody was notified.',
    actor: 'reader',
  },
  'SB-BOARD-SAVE': {
    message: 'That board change didn’t save.',
    fix: 'Reload the board and try again.',
    actor: 'reader',
  },
  'SB-BOARD-LINK': {
    message: 'Switchboard couldn’t make a board invite link.',
    fix: null,
    actor: 'operator',
  },
  'SB-CAPSULE-SAVE': {
    message: 'That capsule entry didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-CONNECTION-SAVE': {
    message: 'That connection change didn’t save.',
    fix: 'Reload your people list and try again.',
    actor: 'reader',
  },
  'SB-CIRCLE-SAVE': {
    message: 'That circle change didn’t save.',
    fix: 'Reload your people list and try again.',
    actor: 'reader',
  },
  'SB-DISCOVERY-RUN': {
    message: 'Switchboard couldn’t make suggestions right now.',
    fix: 'Try again in a moment.',
    actor: 'reader',
  },
  'SB-ENERGY-SAVE': {
    message: 'That reflection didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-REFLECT-SAVE': {
    message: 'That didn’t save.',
    fix: 'Try again. The card is back in your deck.',
    actor: 'reader',
  },
  'SB-THREAD-SAVE': {
    message: 'That message didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-EXPENSE-SAVE': {
    message: 'That expense didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-HOUSEHOLD-SAVE': {
    message: 'That household didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-IDENTITY-SAVE': {
    message: 'That portrait setting didn’t save.',
    fix: 'Reload your portrait and try again.',
    actor: 'reader',
  },
  'SB-REFLECTION-SAVE': {
    message: 'That reflection didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-IMPORT-READ': {
    message: 'Switchboard couldn’t read that event link.',
    fix: 'Try the link again, or fill the plan in below.',
    actor: 'reader',
  },
  'SB-LOCATION-SAVE': {
    message: 'That live location update didn’t save.',
    fix: 'Try sharing again.',
    actor: 'reader',
  },
  'SB-LOCATION-LOAD': {
    message: 'Switchboard couldn’t load live locations.',
    fix: 'Reload the page.',
    actor: 'reader',
  },
  'SB-LOCATION-PAUSED': {
    message: 'Live location is paused while you’re on sabbatical.',
    fix: 'End your sabbatical in Settings before sharing your location.',
    actor: 'reader',
  },
  // The address lookup service itself failed or is throttling us. Distinct
  // from "that address matched nothing", which is the reader's to fix and is
  // reported without a code: checking the spelling cannot fix an outage.
  'SB-MAP-LOOKUP': {
    message: 'The map’s address lookup isn’t answering right now.',
    fix: 'Try again in a few minutes. Nothing you entered was lost.',
    actor: 'reader',
  },
  'SB-INTRO-SAVE': {
    message: 'That introduction didn’t send.',
    fix: 'Try again.',
    actor: 'reader',
  },
  // The insert policy refused the pair. It never says why: the reason can be a
  // block between the two, which the person introducing them must not learn.
  'SB-INTRO-UNAVAILABLE': {
    message: 'This introduction can’t be made.',
    fix: 'Try introducing one of them to someone else.',
    actor: 'reader',
  },
  'SB-MODERATION-SAVE': {
    message: 'That moderation decision didn’t save.',
    fix: 'Reload the queue and try again.',
    actor: 'reader',
  },
  // A moderator's suspension or lift did not land. Its own code because it
  // writes the auth server's ban, not the report: "the queue didn't save" would
  // point at the wrong half.
  'SB-MODERATION-SUSPEND': {
    message: 'That suspension change didn’t save.',
    fix: 'Reload the queue and check whether the account shows as suspended before trying again.',
    actor: 'reader',
  },
  'SB-MODERATION-REMOVE': {
    message: 'That removal didn’t save.',
    fix: 'Reload the queue and try again.',
    actor: 'reader',
  },
  'SB-MOMENT-CHAT': {
    message: 'Switchboard couldn’t open that moment chat.',
    fix: 'Reload and try again while the moment is still live.',
    actor: 'reader',
  },
  'SB-MUTUAL-SAVE': {
    message: 'That Mutual update didn’t save.',
    fix: 'Reload Mutual and try again.',
    actor: 'reader',
  },
  'SB-RITUAL-SAVE': {
    message: 'That ritual didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-ROOM-SAVE': {
    message: 'That room update didn’t save.',
    fix: 'Reload the room and try again.',
    actor: 'reader',
  },
  // Reporting one message. "Not there" covers a message deleted, removed, or in
  // a room the reporter has left, on purpose: the same rule as SB-POST-MISSING.
  'SB-MESSAGE-MISSING': {
    message: 'That message isn’t there any more.',
    fix: 'It may have been deleted or removed already. Reload the room.',
    actor: 'reader',
  },
  'SB-MESSAGE-REPORT': {
    message: 'That report didn’t reach the moderators.',
    fix: 'Try again. If it keeps failing, report the person from their profile instead.',
    actor: 'reader',
  },
  // Reading rooms (the inbox, or scrolling back past the newest messages). Its
  // own code because nothing was being saved: the reader's question is "are my
  // conversations gone?", and the answer is no.
  'SB-ROOM-LOAD': {
    message: 'Switchboard couldn’t load your messages right now.',
    fix: 'Try again in a moment. Nothing was lost.',
    actor: 'reader',
  },
  'SB-SIGNAL-SAVE': {
    message: 'That signal didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-SIGNAL-PAUSED': {
    message: 'Signals are paused while you’re on sabbatical.',
    fix: 'End your sabbatical in Settings before turning a signal on.',
    actor: 'reader',
  },
  'SB-VENUE-SAVE': {
    message: 'That venue change didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-VENUE-LOAD': {
    message: 'Switchboard couldn’t load partner perks just now.',
    fix: 'Reload the page. Your own claims are unchanged.',
    actor: 'reader',
  },
  // People discovery failing to load used to read as "No one in this lane
  // yet" — an empty-room answer to what was an outage.
  'SB-PEOPLE-LOAD': {
    message: 'Switchboard couldn’t load people discovery just now.',
    fix: 'Reload the page. Nothing about your discoverability changed.',
    actor: 'reader',
  },
  // Verified facts (school, work) and the discovery lanes that use them.
  'SB-FACT-SAVE': {
    message: 'That detail didn’t save.',
    fix: 'Try again.',
    actor: 'reader',
  },
  'SB-FACT-VERIFY': {
    message: 'Switchboard couldn’t start verifying that detail.',
    fix: 'Check the address, then try again in a few minutes.',
    actor: 'reader',
  },
  'SB-FACT-CHECK': {
    message: 'Switchboard couldn’t confirm that verification link.',
    fix: 'Request a new link from your profile and open it within 30 minutes.',
    actor: 'reader',
  },
  'SB-DISCOVERY-SAVE': {
    message: 'Your discovery settings didn’t save.',
    fix: 'Try again. Nothing about who can see you changed.',
    actor: 'reader',
  },
  'SB-DISCOVERY-LOAD': {
    message: 'Switchboard couldn’t load your discovery settings just now.',
    fix: 'Reload the page. Nothing about who can see you changed.',
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
   * The error boundary caught a failure while the device had no connection:
   * the next page's code or data never arrived. That is not a crash, and
   * "something slipped on our end" sent people looking for a bug instead of a
   * signal.
   */
  'SB-APP-OFFLINE': {
    message: 'You’re offline, so this page couldn’t open.',
    fix: 'Reconnect, then try again. Anything you already saved is safe.',
    actor: 'reader',
  },
  /**
   * The chosen appearance could not be read back, so the app is wearing the
   * standard palette instead of the person's own. Nothing they can do about it
   * — this is a server-side read failing — but it needs a code, because the
   * symptom is completely mute: the app simply looks like it always did, and
   * Settings looks like it is ignoring what you pick. That is precisely how a
   * missing column grant hid for a whole release.
   */
  'SB-LOOK-UNREAD': {
    message: 'Your chosen look couldn’t be loaded, so this is the standard one.',
    fix: null,
    actor: 'operator',
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
 * A failure the reader can fix directly from the sentence itself.
 *
 * Validation is the one deliberate exception to the error-code rule. Keeping
 * it behind a named helper makes that exception visible in review and lets the
 * coverage test reject an uncoded operational failure without mistaking
 * messages such as "Add your name" for incidents.
 */
export interface ValidationFailure {
  ok: false;
  error?: string;
}

export function validation(error?: string): ValidationFailure {
  return error ? { ok: false, error } : { ok: false };
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
  'rate-limit': 'SB-RATE-LIMIT',
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
  'event-page.load': 'SB-PLAN-OPEN',
  'plans.invited-events': 'SB-PLAN-LOAD',
  'event-create': 'SB-PLAN-CREATE',
  'event-update': 'SB-PLAN-SAVE',
  'event-visibility': 'SB-PLAN-SAVE',
  'authz.event-manager': 'SB-PLAN-AUTHZ',
  'board.report-post': 'SB-POST-REPORT',
  'board.post-to-plan': 'SB-POST-LINK',
  'availability.clear': 'SB-FREE-SAVE',
  'availability.save': 'SB-FREE-SAVE',
  'availability.to-poll': 'SB-FREE-POLL',
  'calendar.connect': 'SB-CAL-SAVE',
  'calendar.sync': 'SB-CAL-SAVE',
  'calendar.disconnect': 'SB-CAL-SAVE',
  'calendar.fetch': 'SB-CAL-FETCH',
  'calendar.refresh': 'SB-CAL-SAVE',
  'match.dismiss': 'SB-MATCH-CLEAR',
  'match.restore': 'SB-MATCH-CLEAR',
  'moment.candidate': 'SB-MOMENT-SAVE',
  'moment.block': 'SB-MOMENT-SAVE',
  'moment.report': 'SB-MOMENT-SAVE',
  'poll.follow-up': 'SB-PLAN-SAVE',
  'poll.follow-up-remove': 'SB-PLAN-SAVE',
  'event-locate': 'SB-PLAN-SAVE',
  'event.delete': 'SB-PLAN-DELETE',
  'event.delete-room': 'SB-PLAN-DELETE',
  'event.cohost-add': 'SB-PLAN-SAVE',
  'event.clone': 'SB-PLAN-CLONE',

  // Getting invitations out
  'event-initial-delivery': 'SB-INVITE-SEND',
  'add-people': 'SB-INVITE-SEND',
  'add-people-cascade': 'SB-INVITE-SEND',
  'remove-invite': 'SB-INVITE-SEND',
  'remove-invite-cascade': 'SB-INVITE-SEND',
  'resend-invite': 'SB-INVITE-SEND',
  'resend-invite-cascade': 'SB-INVITE-SEND',
  'invite.move': 'SB-INVITE-SEND',
  'invite.stage': 'SB-INVITE-SEND',
  'invite.window': 'SB-INVITE-SEND',
  'invite-connection-now': 'SB-INVITE-SEND',
  'invite-connection-deliver': 'SB-INVITE-SEND',
  'sms.consent-check': 'SB-CONFIG-SMS',
  'sms.delivery': 'SB-CONFIG-SMS',
  'sms.inbound': 'SB-CONFIG-SMS',
  'sms.opt-out-check': 'SB-CONFIG-SMS',
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
  'zone.location': 'SB-ZONE-SAVE',
  'zone.join': 'SB-ZONE-SAVE',
  'zone.create': 'SB-ZONE-SAVE',
  'zone.update': 'SB-ZONE-SAVE',
  'zone.delete': 'SB-ZONE-SAVE',
  'zone.role': 'SB-ZONE-SAVE',
  'zone.withdraw-request': 'SB-ZONE-SAVE',
  'zones.load': 'SB-ZONE-LOAD',

  // Notification inbox
  'notification.read': 'SB-NOTIFY-SAVE',
  'notification.read-all': 'SB-NOTIFY-SAVE',
  'notification.clear': 'SB-NOTIFY-CLEAR',

  // Poll input
  'poll.suggest': 'SB-POLL-SUGGEST',
  'poll.edit': 'SB-POLL-EDIT',
  'poll.remove': 'SB-POLL-EDIT',
  'poll.vote': 'SB-PLAN-SAVE',
  'poll.open-voting': 'SB-POLL-DECIDE',
  'poll.close': 'SB-POLL-DECIDE',
  'poll.pick': 'SB-POLL-DECIDE',
  // After a decision: giving the plan the winning date. Logged, never thrown —
  // the decision is saved and the host can still set the date by hand.
  'poll.apply-date': 'SB-POLL-DECIDE',
  // Ideas floated in the wizard that did not reach the new plan's first poll.
  'poll.seed': 'SB-POLL-SUGGEST',
  // Telling the group a poll opened or how it came out. Never shown: the poll
  // moved either way, and this is the log line behind "nobody told me".
  'poll.notify': 'SB-NOTIFY-RECORD',
  // The cascade's atomic apply failed, so nothing moved; the next tick retries.
  'cascade.apply': 'SB-INVITE-SEND',

  // Answering
  'share-rsvp.respond': 'SB-RSVP-SAVE',
  'guest-rsvp.claim': 'SB-RSVP-SAVE',
  'guest-rsvp.respond': 'SB-RSVP-SAVE',
  'guest-rsvp.decline-note': 'SB-RSVP-SAVE',
  'invite.respond': 'SB-RSVP-SAVE',
  'join.request': 'SB-RSVP-SAVE',
  'join.approve': 'SB-RSVP-SAVE',
  'join.decline': 'SB-RSVP-SAVE',
  'invite-decline.message': 'SB-RSVP-SAVE',
  'invite-claim.token': 'SB-RSVP-SAVE',
  'give-space.note': 'SB-SPACE-NOTE',
  'parental-approval.create': 'SB-RSVP-SAVE',
  'parental-approval.invite': 'SB-RSVP-SAVE',
  'parental-approval.event': 'SB-RSVP-SAVE',
  'parental-approval.resend': 'SB-RSVP-SAVE',
  'parental-approval.resolve': 'SB-RSVP-SAVE',
  'parental-approval.email': 'SB-GUARDIAN-EMAIL',

  // Profile & settings
  'onboarding': 'SB-PROFILE-SAVE',
  'profile-save': 'SB-PROFILE-SAVE',
  'invite-claim.contact': 'SB-PROFILE-SAVE',
  'settings.interests': 'SB-SETTINGS-SAVE',
  'settings.appearance': 'SB-SETTINGS-SAVE',
  'settings.digest': 'SB-SETTINGS-SAVE',
  'layout.appearance': 'SB-LOOK-UNREAD',
  // Any Settings read, logged once per part that failed. The profile read used
  // to be logged as an appearance failure, which pointed away from the fact
  // that the whole page was rendering defaults.
  'settings.load': 'SB-SETTINGS-LOAD',
  'onboarding.load': 'SB-PROFILE-LOAD',
  'settings.discoverability': 'SB-SETTINGS-SAVE',
  'settings.sabbatical': 'SB-SETTINGS-SAVE',
  'settings.quiet-hours': 'SB-SETTINGS-SAVE',
  'settings.notifications': 'SB-SETTINGS-SAVE',
  'settings.calendar-token': 'SB-SETTINGS-SAVE',
  'settings.sms-note': 'SB-SETTINGS-SAVE',
  'sms.preferences': 'SB-SMS-PREFERENCES',

  // Social surfaces and personal tools
  'announcement.save': 'SB-ANNOUNCEMENT-SAVE',
  'board.create': 'SB-BOARD-SAVE',
  'board.member-add': 'SB-BOARD-SAVE',
  'board.member-remove': 'SB-BOARD-SAVE',
  'board.join': 'SB-BOARD-SAVE',
  'board.link-create': 'SB-BOARD-LINK',
  'board.link-rotate': 'SB-BOARD-LINK',
  'board.post-create': 'SB-BOARD-SAVE',
  'board.post-respond': 'SB-BOARD-SAVE',
  'board.post-delete': 'SB-BOARD-SAVE',
  'board.post-complete': 'SB-BOARD-SAVE',
  'board.post-update': 'SB-BOARD-SAVE',
  'board.leave': 'SB-BOARD-SAVE',
  'board.update': 'SB-BOARD-SAVE',
  'board.delete': 'SB-BOARD-SAVE',
  'board.role': 'SB-BOARD-SAVE',
  'board.response-withdraw': 'SB-BOARD-SAVE',
  'capsule.save': 'SB-CAPSULE-SAVE',
  'connection.request': 'SB-CONNECTION-SAVE',
  'connection.respond': 'SB-CONNECTION-SAVE',
  'connection.remove': 'SB-CONNECTION-SAVE',
  'connection.block': 'SB-CONNECTION-SAVE',
  'connection.unblock': 'SB-CONNECTION-SAVE',
  'connection.avoid': 'SB-CONNECTION-SAVE',
  'connection.unavoid': 'SB-CONNECTION-SAVE',
  'connection.report': 'SB-CONNECTION-SAVE',
  'connection.ignore': 'SB-CONNECTION-SAVE',
  'circle.create': 'SB-CIRCLE-SAVE',
  'circle.rename': 'SB-CIRCLE-SAVE',
  'circle.members': 'SB-CIRCLE-SAVE',
  'circle.delete': 'SB-CIRCLE-SAVE',
  'contact.verify-start': 'SB-VERIFY-START',
  'contact.verify-check': 'SB-VERIFY-CHECK',
  'discovery.run': 'SB-DISCOVERY-RUN',
  'discover.people': 'SB-PEOPLE-LOAD',
  'fact.save': 'SB-FACT-SAVE',
  'fact.verify-start': 'SB-FACT-VERIFY',
  'fact.verify-check': 'SB-FACT-CHECK',
  'fact.vouch': 'SB-FACT-SAVE',
  'discovery-prefs.save': 'SB-DISCOVERY-SAVE',
  'discovery-prefs.load': 'SB-DISCOVERY-LOAD',
  'discover.join-requests': 'SB-INVITE-LOAD',
  'energy.save': 'SB-ENERGY-SAVE',
  'reflection.save': 'SB-REFLECT-SAVE',
  'reflection.energy': 'SB-REFLECT-SAVE',
  'you.deck': 'SB-REFLECT-LOAD',
  'event-thread.send': 'SB-THREAD-SAVE',
  'event-thread.delete': 'SB-THREAD-SAVE',
  'expense.save': 'SB-EXPENSE-SAVE',
  'expense.settle': 'SB-EXPENSE-SAVE',
  'household.save': 'SB-HOUSEHOLD-SAVE',
  'household.members': 'SB-HOUSEHOLD-SAVE',
  'identity.preference': 'SB-IDENTITY-SAVE',
  'identity.verdict': 'SB-IDENTITY-SAVE',
  'identity.operator': 'SB-IDENTITY-SAVE',
  'identity.reflection': 'SB-REFLECTION-SAVE',
  'event.import': 'SB-IMPORT-READ',
  'location.share': 'SB-LOCATION-SAVE',
  'location.stop': 'SB-LOCATION-SAVE',
  'location.load': 'SB-LOCATION-LOAD',
  'location.refresh': 'SB-LOCATION-SAVE',
  'exact.share': 'SB-LOCATION-SAVE',
  'exact.stop': 'SB-LOCATION-SAVE',
  'exact.load': 'SB-LOCATION-LOAD',
  'map.search': 'SB-MAP-LOOKUP',
  'map.reverse': 'SB-MAP-LOOKUP',
  'map.locate': 'SB-MAP-LOOKUP',
  'intro.create': 'SB-INTRO-SAVE',
  'intro.respond': 'SB-INTRO-SAVE',
  'moderation.resolve': 'SB-MODERATION-SAVE',
  'moderation.suspend': 'SB-MODERATION-SUSPEND',
  'moderation.lift': 'SB-MODERATION-SUSPEND',
  'moderation.remove-post': 'SB-MODERATION-REMOVE',
  'moderation.remove-message': 'SB-MODERATION-REMOVE',
  'moment.create': 'SB-MOMENT-SAVE',
  'moment.update': 'SB-MOMENT-SAVE',
  'moment.load': 'SB-MOMENT-SAVE',
  'moment.chat': 'SB-MOMENT-CHAT',
  'mutual.intent': 'SB-MUTUAL-SAVE',
  'mutual.respond': 'SB-MUTUAL-SAVE',
  'mutual.unmatch': 'SB-MUTUAL-SAVE',
  'ritual.create': 'SB-RITUAL-SAVE',
  'ritual.update': 'SB-RITUAL-SAVE',
  'ritual.skip': 'SB-RITUAL-SAVE',
  // Recording that a plan fulfilled a ritual. Logged, never shown: the plan
  // itself was made either way.
  'ritual.plan': 'SB-RITUAL-SAVE',
  // The cron's due-day reminder claim. Never shown; the next tick retries.
  'ritual.remind': 'SB-NOTIFY-RECORD',
  'room.message': 'SB-ROOM-SAVE',
  'room.task': 'SB-ROOM-SAVE',
  'room.image': 'SB-ROOM-SAVE',
  'room.message-delete': 'SB-ROOM-SAVE',
  'room.mute': 'SB-ROOM-SAVE',
  'room.leave': 'SB-ROOM-SAVE',
  'room.history': 'SB-ROOM-LOAD',
  'room.inbox': 'SB-ROOM-LOAD',
  'room.report-message': 'SB-MESSAGE-REPORT',
  'signal.activate': 'SB-SIGNAL-SAVE',
  'signal.remove': 'SB-SIGNAL-SAVE',
  'signal.clear': 'SB-SIGNAL-SAVE',
  'venue.claim': 'SB-VENUE-SAVE',
  'venue.review': 'SB-VENUE-SAVE',
  'venue.update': 'SB-VENUE-SAVE',
  'venue.withdraw': 'SB-VENUE-SAVE',
  'venue.load': 'SB-VENUE-LOAD',

  // Getting into an account
  'auth.resend-confirmation': 'SB-AUTH-RESEND',
  'auth.signup': 'SB-AUTH-SIGNUP',
  'auth.oauth-provider': 'SB-OAUTH-DENIED',
  'auth.oauth-exchange': 'SB-OAUTH-EXCHANGE',
  'auth.oauth-callback': 'SB-OAUTH-MISSING',
  'account.delete': 'SB-AUTH-DELETE',
  'account.export': 'SB-ACCOUNT-EXPORT',

  // Best-effort delivery still needs an operator-visible trace when a provider
  // rejects a live subscription for a reason other than "gone".
  'push.send': 'SB-PUSH-SEND',
  'push.subscribe': 'SB-PUSH-SAVE',
  'notify.record': 'SB-NOTIFY-RECORD',
  'digest.items': 'SB-DIGEST-SEND',
  'digest.send': 'SB-DIGEST-SEND',
  'digest.stamp': 'SB-DIGEST-SEND',

  // Reads that used to fail as empty sections. One area per section, so the
  // log says which card was blank even when two share a code.
  'home.profile': 'SB-PROFILE-LOAD',
  'home.invites': 'SB-INVITE-LOAD',
  'home.plans': 'SB-PLAN-LOAD',
  'home.signals': 'SB-SIGNAL-LOAD',
  'home.around': 'SB-AROUND-LOAD',
  'home.matches': 'SB-MATCH-LOAD',
  'home.connections': 'SB-CONNECTION-LOAD',
  'home.introductions': 'SB-INTRO-LOAD',
  'home.rituals': 'SB-RITUAL-LOAD',
  'home.radar': 'SB-RADAR-LOAD',
  'home.reflections': 'SB-ENERGY-LOAD',
  'notifications.load': 'SB-NOTIFY-LOAD',
  'notifications.invites': 'SB-INVITE-LOAD',
  'notifications.matches': 'SB-MATCH-LOAD',
  'notifications.announcements': 'SB-ANNOUNCEMENT-LOAD',
  'notifications.requests': 'SB-CONNECTION-LOAD',

  // Uploads
  'audio-upload': 'SB-UPLOAD-FAILED',
  'image-upload': 'SB-UPLOAD-FAILED',

  // The scope checklist's feedback box. The writer has no account, so the only
  // thing they can be told is whether it landed.
  'client-feedback': 'SB-FEEDBACK-SAVE',
  'scope-progress': 'SB-SCOPE-BOARD',
  // The notifier is best-effort; a failure there is an operator trace, not
  // something the reader can act on, so it shares the board's code.
  'scope-watch': 'SB-SCOPE-BOARD',
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
