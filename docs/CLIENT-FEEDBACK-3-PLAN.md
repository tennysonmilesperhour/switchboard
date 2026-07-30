# Client Feedback Round 3 — Review & Plan

*Product, reliability, privacy, and safety review of six pieces of client
feedback, grounded in the current codebase. Planning only — nothing here is
implemented yet. Companion to
[`CLIENT-FEEDBACK-PLAN.md`](CLIENT-FEEDBACK-PLAN.md) and
[`CLIENT-FEEDBACK-2-PLAN.md`](CLIENT-FEEDBACK-2-PLAN.md).*

---

## 1. Direct answers

| Feedback | Answer today | Recommendation |
|---|---|---|
| “I created a recurring event on a neighborhood board, but I’m not seeing a way to edit it.” | **No.** A board “recurring event” is currently a `board_posts` announcement, not a real recurring plan. Its author or a moderator can remove it, but nobody can edit it. | Add author-only editing for board posts now. Longer-term, relabel the board item “Recurring announcement” or let it create/link a real plan; do not imply that it is already a recurring event engine. |
| “Phone verification says it is not configured yet.” | The flow exists, but production is missing at least one required secret: `CONTACT_VERIFICATION_SECRET`, or one of `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`. Email uses a separate provider and can therefore work while phone does not. | Treat as a release-blocking configuration defect. Verify the Vercel environment and expose boolean readiness in `/api/health`; keep secrets out of the response. |
| “Have you thought about minors, meetups, and safety?” | Not enough. The product has good adult-to-adult privacy controls, blocking, reporting, invite-only boards, and conservative location sharing, but it has **no age policy, age gate, guardian model, or minor-specific meetup controls**. | Launch as an **18+ service** first. Allow adults to mark a plan “kids welcome,” but do not create child accounts, child profiles, child names/ages, or child-to-adult matching. Add a written meetup-safety standard and revisit teen accounts only as a separately designed product. |
| “I saved my selections twice and it hasn’t saved.” | This is credible from the code. Settings actions ignore database errors and return `void`; the shared save bar treats every settled action as success and clears the dirty state. A failed write can therefore look saved and then revert. | Fix as a P0 reliability bug: actions return typed success/failure, the save bar clears only on success, an error remains visible, and the server confirms the saved values. Add tests for the interest picker’s programmatic hidden inputs and a rejected database write. |
| “Can I delete a plan so it doesn’t show in archived events?” | **No.** Cancellation and “Past events” are retention states, not deletion. There is no host hard-delete action, and cancelled plans are hidden while past plans are deliberately retained. | Add **Delete permanently** for hosts, separate from Cancel. Restrict it to cancelled/draft or already-past plans; warn that invitations, room content, polls, and photos will be removed. Use the existing cascade relationships and verify deletion under RLS. |
| “The invites still aren’t clickable. I just tried to create a new one.” | The recipient routes have been heavily repaired and tested, but the host’s invite-link control renders the URL itself as a non-clickable `<span>` beside Copy/Share buttons. So “the link is not clickable” is still literally true in the creation UI. Delivery can also still fail if production points at an old deployment or has a bad canonical origin. | Make the displayed URL an `<a>` that opens in a new tab, keep Copy/Share, and add an end-to-end test that clicks the link from the exact host surface. Also log the deployed version and canonical origin in the health check so production drift is diagnosable. |

---

## 2. What the code actually does

### Board recurring posts

`BoardClient.tsx` offers two post kinds: `notice` and `event`. The event label is
“Recurring event,” but the stored row contains only display fields (`title`,
`body`, `cadence`, `location`, and an optional first date). It does not create an
`events` row, recurrence schedule, RSVP list, room, or future occurrences.

`deleteBoardPost()` exists. There is no update action or edit UI. The smallest
honest fix is author-only post editing. The naming should also change until the
board post can be promoted into a real plan:

- **Now:** “Recurring announcement,” with Edit and Remove.
- **Next:** “Make this a plan,” pre-filling the event wizard and linking the
  resulting plan back to the board post.
- **Not now:** silently mutate one board post into a series of event rows. That
  creates ambiguous RSVP and cancellation semantics.

### Phone verification

The phone flow is already implemented:

1. Generate a six-digit code.
2. HMAC it with `CONTACT_VERIFICATION_SECRET`.
3. Store the hash and a ten-minute expiry.
4. Send through Twilio.
5. Rate-limit sends and attempts.
6. Mark the matching `profile_contacts` row verified.

The exact “not configured yet” message occurs in two cases:

- `CONTACT_VERIFICATION_SECRET` is absent, so the code cannot be safely stored.
- Twilio reports `not_configured`, which means one or more of its three
  credentials is absent.

This is not a missing feature and should not be redesigned. It needs an operator
checklist, a health signal, and a production smoke test using a designated test
number. Do not fall back to logging or displaying the code.

### Minor safety

The existing safety architecture is meaningful but designed for adults:

- neighborhood boards are invite-only and member-gated;
- direct rooms cannot be created arbitrarily;
- plans and rooms have blocking/reporting controls;
- live location is opt-in, mutual, time-limited, coarsened, and block-aware;
- “Give Space” does not grant additional visibility;
- private data access is constrained by RLS rather than UI convention.

Those controls do not answer the harder questions introduced by minor accounts:
adult/minor discovery, private messaging, guardian consent, custody, age
verification, mandatory-reporting escalation, grooming signals, location
exposure, content moderation, and support coverage.

The recommended first policy is therefore:

1. Accounts are 18+.
2. Adults may indicate **“Kids welcome”** or choose adult-profile family
   interests, but must not enter a child’s name, age, photo, school, or schedule.
3. No minor is a match candidate, invite recipient, board member, room member,
   or live-location sharer.
4. Kid-inclusive plans display a short host checklist: guardian present,
   public/appropriate venue, no public child roster, no child location sharing,
   and a clear reporting route.
5. Public or friends-of-friends kid-inclusive events require a separate threat
   model before launch; invite-only is the default.

This is a product recommendation, not legal advice. It intentionally avoids
collecting children’s data. The FTC’s current COPPA guidance says covered
services generally need verifiable parental consent before collecting personal
information from children under 13, and the amended rule strengthens
data-minimization and retention duties:

- https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa

Before allowing any minor accounts, obtain specialist legal and trust-and-safety
review. An “I am 13” checkbox is not a safety system.

### Settings persistence

The shared settings save bar is well intentioned but has a false-success path:

- `updateInterests`, `updateDiscoverability`, `updateSabbatical`, and
  `updateQuietHours` await `.update(...)` but do not inspect `error`.
- `SettingsForm` resolves when `useFormStatus().pending` returns to false.
- `handleSettled()` always re-baselines the current DOM and clears dirty state.
- No success or failure message confirms what the database accepted.

This explains the report without needing to assume user error. The UI can say
the save completed even if RLS, schema drift, or a transient database error
rejected it.

The fix should change the contract, not add another retry:

- settings actions return `{ ok, error, saved }`;
- the client clears dirty state only for `ok: true`;
- on failure, selections remain dirty and the save bar shows the error;
- on success, reconcile controlled pickers with the returned canonical values;
- add an inline “Saved” acknowledgement;
- log an operator-safe error code, never the selected content;
- add an end-to-end test: choose interests, save, reload, and assert persistence.

### Permanent plan deletion

The Calendar page excludes cancelled plans and intentionally includes hosted and
accepted plans in “Past events.” That archive is useful for run-it-back,
capsules, rooms, attendance history, and analytics, but it should not override
the host’s desire to remove a mistaken or sensitive plan.

Keep three distinct actions:

- **Cancel:** stop the plan and notify accepted guests; hide it from normal
  calendar views, retain its record.
- **Archive:** a personal visibility preference, if later needed; do not delete
  anything for other participants.
- **Delete permanently:** host-only destructive removal of the plan and its
  dependent content.

V1 permanent deletion should be deliberately narrow:

- allowed for the host, not merely a co-host;
- allowed before the plan happens, or after it has been cancelled/passed;
- blocked while active accepted guests exist unless the host cancels first;
- requires typing the plan title or a second confirmation;
- states exactly what cascades: invitations, answers, polls, room membership and
  messages, photos, announcements, and share links;
- revokes public tokens immediately;
- writes a minimal security/audit event without preserving plan content.

The migration must prove every child table either cascades or is explicitly
removed. Do not perform the deletion through an unscoped admin client; use a
security-definer function that re-checks `auth.uid() = host_id`.

### Invite links

The repository has already fixed several different failures under the phrase
“invite links don’t work”: RLS-gated event URLs, preview-domain URLs, relative
URLs, stale canonical origins, signed-out redirect loops, and incomplete public
plan pages. The current `/i/[token]` and `/rsvp/[token]` routes have automated
coverage.

One obvious gap remains in `InviteLink.tsx`: the visible `shareUrl` is a
truncated `<span>`, not an anchor. Copy and Share work, but tapping the URL does
nothing. The next test must begin at that exact control:

1. Host creates a plan.
2. Host clicks the displayed link (not a constructed test URL).
3. A fresh signed-out browser opens it.
4. The full plan renders.
5. Sign-in preserves the deep link.
6. The recipient can RSVP after authentication.

Add the deployed commit/version and canonical hostname to `/api/health`
(non-secret values only). If this test passes locally but the client still
receives a dead link, compare those values in production before changing the
link model again.

---

## 3. Priority and sequencing

| Priority | Work | Why |
|---|---|---|
| **P0** | Fix settings false-success behavior | The UI currently cannot be trusted when it says a save settled. |
| **P0** | Configure and smoke-test phone verification | The feature is built; production is knowingly presenting a configuration error. |
| **P0** | Make the host invite URL clickable and test the exact surface | Small change, directly matches the latest report, and closes the last obvious UI gap. |
| **P1** | Add edit for board posts; relabel “Recurring event” | Removes a dead end and makes the current model honest. |
| **P1** | Publish an 18+ and kid-inclusive meetup policy | Safety boundary must precede growth of family-oriented features. |
| **P1** | Add host-only permanent deletion | Important control, but destructive and relationally complex; implement behind complete cascade tests. |
| **P2** | Promote a board announcement into a real recurring plan | Useful generalization after edit semantics are solid. |
| **Do not build now** | Minor accounts, guardian accounts, adult/minor discovery, or child location | Each requires a dedicated product, legal, moderation, and incident-response design. |

---

## 4. Acceptance criteria

### A. Board post editing

- [ ] A post author can edit title, details, cadence, place, and first date.
- [ ] A board moderator may remove a post but may not silently rewrite another
      member’s words.
- [ ] `author_id`, `board_id`, and `kind` are immutable.
- [ ] UPDATE has RLS `USING` and `WITH CHECK`; ownership is frozen by trigger.
- [ ] The UI calls the current object a “Recurring announcement.”

### B. Phone verification readiness

- [ ] Production has all four required secret values.
- [ ] `/api/health` reports `contactVerification.phone: true|false` without
      returning credentials.
- [ ] A real test device receives and successfully redeems a code.
- [ ] Missing configuration is visible to operators before a user reaches the
      flow.

### C. Kid-inclusive safety

- [ ] Terms and onboarding state that accounts are 18+.
- [ ] Kid-inclusive plans never ask for or display child identity, school, age,
      contact details, or location.
- [ ] “Kids welcome” has guardian-presence and venue-safety guidance.
- [ ] Reporting and blocking remain reachable from the plan and room.
- [ ] No minor-account feature ships without separate legal and
      trust-and-safety approval.

### D. Settings persistence

- [ ] A rejected write leaves the form dirty and shows an actionable error.
- [ ] A successful write shows “Saved” and survives a full reload.
- [ ] InterestPicker additions/removals are included in the submitted
      `FormData`.
- [ ] Unit coverage includes action failure; E2E covers save + reload.

### E. Permanent plan deletion

- [ ] Only the host can invoke deletion, enforced in the database.
- [ ] Active plans with accepted guests must be cancelled first.
- [ ] Confirmation enumerates the dependent content that will be removed.
- [ ] Tokens fail immediately after deletion.
- [ ] pgTAP verifies authorization, cascade completeness, and cross-user denial.

### F. Clickable invites

- [ ] The displayed host invite URL is a semantic anchor with a visible focus
      state and safe new-tab attributes.
- [ ] Copy and native Share remain available.
- [ ] E2E clicks the actual anchor and opens it signed out.
- [ ] Health output identifies the deployed version and canonical hostname.

---

## 5. Suggested delivery slices

**Slice 1 — reliability:** settings persistence, phone environment readiness,
and clickable invite UI. These are defects, not roadmap bets.

**Slice 2 — control:** board-post editing and permanent plan deletion, each with
database-enforced authorization and destructive-action UX.

**Slice 3 — family participation without child accounts:** publish the 18+
boundary, add “Kids welcome” to adult-hosted invite-only plans, and add the
meetup checklist. Measure demand before designing any youth account system.
