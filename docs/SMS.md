# SMS purpose, current behavior, and repair notes

## Intended experience to confirm

Twilio should let people prove they control a phone number and receive useful,
consented-to Switchboard invitations and important plan updates when they are
away from the app. The account's verified phone must route messages to the right
person. Verification is proof of phone ownership; it is not permission for every
future kind of text, and it does not currently enable phone login or recovery.

The current implementation points recipients back to the app through links.
Reply-based RSVP, text-only participation, and SMS chat are separate product
choices and are not implemented. Confirm whether those are desired before
promising or building them.

## Production behavior at initial diagnosis

- Settings generates a six-digit code, stores an HMAC bound to the account and
  number, and checks it within ten minutes. Twilio Programmable Messaging sends
  the code; this is not Twilio Verify. Only one account may verify a number.
- Phone-addressed guest invitations use the configured Messaging Service (or
  From number). Selected reminders and cancellation notices follow SMS-invited
  guests. A member invited by their handle gets in-app/push delivery; the normal
  `notifyUsers` path does not deliver SMS to verified member phone numbers.
- Notification category controls govern push, not SMS. Quiet hours likewise
  must not be assumed to suppress every outbound SMS path.
- Twilio request acceptance is recorded as `sent` in the existing delivery
  model. That is not carrier/handset delivery. There is no persisted status
  callback pipeline covering verification and all transactional SMS.
- The inbound webhook processes signed STOP/START/HELP events. It does not
  interpret RSVP replies or forward conversational replies to hosts.
- STOP suppression is durable and checked before sends. A successful invitation
  send is used to select guest follow-ups, but this does not establish a complete
  consent record for the initial guest invitation. The consent flow and the
  public SMS-compliance description need to match the real sending gates.

## September 8, 2026 incident

Production app: commit `4a7e91dd2e70b3cd37a91889dca5cfd185408eac`, Vercel
`switchboard-hqk2`. Database: `cuzgighqdzypntmhxrqc`, Sophia organization.

A production Settings error at 21:48 UTC reported missing `profiles.notify_plans`.
Read-only inspection confirmed all four columns from migration
`20260717230000` were absent although the migration was recorded as applied.
Forward repair `20260908225045_restore_notification_preferences.sql` restored
those columns and their original narrow read grants. It was applied in a
transaction and recorded in production migration history. Afterward
`app_schema_status()` returned `complete: true`, `missing: []`. RLS remained on,
and authenticated readers still cannot select private phone details. The live
signed-in Settings page rendered profile and preference data afterward.

The verification and opt-out tables exist. At inspection, there were two old
phone requests (September 3 and 4), and none from the preceding three days.
This does not prove the cause of the client's failed send: unsuccessful sends
remove their request, configuration failures occur before insertion, and no
client attempt time or Twilio delivery log has yet been correlated.

The application repair adds visible pending states and stable error codes,
catches interrupted actions, preserves provider error codes without logging
message bodies or numbers, respects Twilio 21610 as opt-out, rejects malformed
success responses, limits sends across accounts sharing a number, checks DB
failures, and refuses a verification success when the contact row changed.
It also allows the signature-authenticated inbound webhook past browser login.
The latter routing defect was independently identified in the September 7 audit;
this focused patch does not include that audit's unrelated changes.

## Release and acceptance

The database repair is live. Application changes must still pass the repository's
release process. Do not equate local tests, configured variable names, an HTTP
201, or a healthy database with end-to-end SMS success.

Use an explicitly authorized test recipient and verify:

1. Settings displays Sending, then code entry or a coded actionable failure.
2. Twilio records the message, actual delivery status, and any error code.
3. The received code verifies the same account and current number. Wrong and
   expired codes fail. A changed number cannot inherit verification.
4. Resend cooldown and server-side account/number budgets work.
5. STOP suppresses SMS, START restores it, and HELP gives a useful response;
   signed callbacks reach the webhook without a login redirect.
6. A guest invite link and the intended follow-up arrive, open the right plan,
   and honor consent. Once member SMS exists, test the member path separately.

## Prioritized completion work

1. **Delivery diagnosis and launch gate.** Inspect the current Twilio account,
   credentials, credit, sender pool, campaign approval, allowed destinations,
   and errors. Confirm one real code and one consented invitation end to end.
   Make SMS readiness an explicit release requirement now that it is expected.
2. **Member SMS and consent.** Add an explicit SMS opt-in with recorded time,
   source, policy version, and scope; independent channel/category preferences;
   verified-contact routing; and guest consent before the first automated send.
   Verification alone must not subscribe someone. Account settings, actual
   delivery, and the public compliance description must agree.
3. **Delivery receipts and reliable jobs.** Persist provider message IDs and
   signed status callbacks for queued, sent, delivered, undelivered, and failed.
   Show hosts an honest state. Use idempotent queued work with bounded retries
   for transient failures; never retry opt-outs or permanent carrier errors.
4. **A calm notification policy.** Default SMS to invitations, imminent reminders,
   important schedule/location changes, and cancellations; make chat/social
   activity optional or digest-based. Specify timezone-aware quiet hours,
   urgency exceptions, stale-message expiration, and fallback behavior.
5. **Operational controls.** Account/destination/IP budgets, destination-country
   policy, global spend limits/alerts, redacted troubleshooting logs, failure-rate
   alerts, and a maintained end-to-end test. Do not put OTPs in logs or analytics.
6. **Choose the verification service and reply scope.** Evaluate Twilio Verify
   for managed OTP lifecycle and abuse protection, separately from the Messaging
   Service used for invitations. Confirm whether text replies should support
   RSVP only, host conversations, or nothing beyond STOP/START/HELP. Do not
   silently turn an RSVP word into account access or expose private phone numbers.

Primary references:
- https://www.twilio.com/docs/messaging/api/message-resource
- https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks
- https://www.twilio.com/docs/verify
- https://www.twilio.com/docs/verify/consent-opt-in
- https://www.twilio.com/en-us/legal/messaging-policy

## Implemented completion work (pending application release)

The follow-up to PR #187 adds:

- A separate unchecked SMS agreement in Settings, with plan/reminder categories.
  A database RPC binds consent to the caller's currently verified number and
  appends timestamp/source/policy/scope evidence. Existing users are not enrolled.
- A private notification-triggered queue for member invitations, important plan
  changes, cancellations, announcements, and reminders. Other categories never
  enqueue SMS. Member invitations no longer also take the guest SMS path.
- Consent, current recipient identity, verification, STOP, and quiet-hour checks
  immediately before sending. A recycled phone number cannot receive queued
  messages intended for its previous owner. Raw guest numbers without verified
  account consent are suppressed; hosts can share the invitation link instead.
- Signed `/api/sms/status` callbacks, persisted provider IDs, monotonic status
  writes, and host invitation receipts. API acceptance is distinct from delivery.
  OTP bodies are never stored in the receipt table. Callback endpoints bypass
  browser authentication but require the provider signature and account binding.
- Three jobs per sweep, atomic claims, at most three attempts after explicit
  HTTP 429/Twilio 20429 rejection, and no automatic retry after timeout/network
  ambiguity or a killed worker. Ambiguous work is marked `unknown` for review.
- Default quiet hours 22:00–08:00 in the profile timezone unless customized,
  including cancellations (no urgency exception). Reminders expire after one
  hour; other queued messages after 24 hours. In-app notifications remain.
- A default 100-attempt daily application budget, 12 attempts per destination
  daily, a 450-UTF-16-unit body ceiling, a calling-code allowlist defaulting to
  `+1`, and `SMS_PAUSED`. These bound attempts/segments, not exact dollar spend.
  The existing verification account and destination limits remain in force.
- Redacted operational failure alerts through the existing optional
  `OBSERVABILITY_WEBHOOK_URL`, and SMS/phone-verification configuration included
  in the privileged health launch gate. Message bodies are cleared after
  submission and receipts expire after 30 days through the regular sweep.

The current hardened custom OTP implementation remains. Twilio Verify is a
separate provider migration, not needed to repair the now-delivering verification
path. It should be chosen if managed OTP/fraud handling is worth the additional
provider dependency and pricing. Reply-based RSVP/chat is still outside the
implemented scope: messages link back into Switchboard; STOP/START/HELP are the
supported inbound controls.

Remaining operational limits: the account-wide Twilio dollar budget, geographic
permissions, and alert destination must be set by the operator to match business
policy. `+1` is the NANP calling code, not a guarantee of US-only delivery. The app
budget is fixed-window and includes unsuccessful attempts. Guest legacy direct
sends receive receipts and consent checks but are not retried through the member
queue. No automatic provider reconciliation is attempted for `unknown` results.

### Live evidence, September 8

The existing `Switchboard SMS Alerts` Messaging Service has one sender and a
verified A2P campaign. Its older sibling service is empty; the three error-21704
failures belong to September 3, not today's test. At 23:47:19 UTC, the approved
Settings verification request created message
`SM188d49042ffc62421b5be39f9a33183b`; Twilio reports **Delivered**. The code was not
read from Twilio or recorded. User completion of code entry remains to be
confirmed. This establishes the current provider delivery path, not the exact
cause of the client's uncorrelated failed attempt.

The missing Vercel production deploy hook has been created for `main`, and its
URL stored only in GitHub's `VERCEL_DEPLOY_HOOK_URL` secret. It was not triggered.
GitHub currently refuses to start the required checks because of failed account
payments or a spending limit. The new migration/application must remain together
behind the repository's schema-gated release workflow.

Advanced Opt-Out was enabled and the STOP/START/HELP replies were branded. START
now says that saved SMS preferences still apply; it does not claim to create a
new application subscription. The service inbound URL is configured as
`https://switchboardsocial.me/api/sms/inbound` using POST. The service queue
validity is 900 seconds; application requests shorten verification to 600
seconds and queued reminders to their remaining lifetime. The inbound app route
fix must be released before application-side STOP persistence can be accepted
end to end. No STOP/START test messages were sent in this task.
