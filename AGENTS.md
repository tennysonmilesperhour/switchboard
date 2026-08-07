<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Security

Switchboard touches private contacts, invitations, moderation, and relationship
signals — the database (RLS + security-definer functions) is the security
boundary, not the UI. **Before writing or reviewing any code that touches auth,
the database, the service-role (`createAdminClient`) client, untrusted input,
file uploads, secrets, or redirects, read [`docs/SECURITY.md`](docs/SECURITY.md)
and follow its precedents.** In short:

- Every table has RLS; UPDATE policies need `WITH CHECK`; ownership columns are
  frozen with triggers. No role/rank/credit/ban state on a self-writable row.
- Never trust the client for identity or moderation — use `auth.getUser()`, not
  `localStorage`/device state. Every `createAdminClient()` call re-authorizes the
  specific caller and resource (it bypasses RLS).
- Encode untrusted text for its sink with `src/lib/security.ts`
  (`serializeJsonLd` / `csvCell` / `safeNextPath`) and `icsEscape`; never put
  user content in `dangerouslySetInnerHTML`.
- Server secrets are never `NEXT_PUBLIC_`; compare shared secrets with
  `bearerMatches` (constant-time, fail-closed).

Security invariants are covered by unit tests (`npm test`) and pgTAP
(`supabase test db`) — keep them green and add coverage for new surfaces.

# Error messages

Every failure a human sees carries a code from **`src/lib/errors.ts`** —
`SB-<AREA>-<REASON>`, rendered quietly beside the message and written into the
matching server log line. This exists because "This invite link isn't active"
was shown for four unrelated causes, so a screenshot of it diagnosed nothing.

- **Operational failures get a code.** Anything where the reader can't tell what
  went wrong or whose fault it is. Use `failure(code)` or, when it's also being
  logged, `reportAndFail(code, area, error)` — that one call guarantees the
  screen and the log agree.
- **Validation does not.** "Add your name." already names the cause and the fix.
  A code there is noise that teaches people to ignore codes.
- **`actor` decides the advice**: `operator` failures must have `fix: null`
  (never tell someone to retry a misconfigured server); `reader` failures must
  have a real next step.
- Codes are permanent. Never renumber or reuse one — old screenshots and old
  logs would start lying.
- `src/lib/errors.test.ts` reads the source and fails if a
  `reportOperationalError` area has no code, if a mapping is orphaned, if a
  toast drops `result.code`, or if an error boundary stops showing the digest.

# Invite links

Shared invite links broke for recipients repeatedly, always the same way: the
condition for "the host may share this" was decided separately from, and more
loosely than, the condition for "the recipient may read this", so the app handed
out links its own pages rejected. Every localised fix held until the next plan
deviated slightly and landed on a pair of surfaces still out of step.

There is now one answer, and nothing may re-derive it:

- **`src/lib/links.ts` builds the URL.** One validated origin, no fallbacks.
- **`src/lib/share-link.ts` decides what that URL does** — readable, answerable,
  offerable to the host, safe to unfurl. Every surface (`/i/<token>`,
  `/join/<id>`, the event page's Share button and Invite link card, the OG
  route, and the RSVP action) asks this module. Do not write
  `status === 'inviting' || ...` at a call site.
- **The invariant:** if the app offers a host any way to send a link, what the
  recipient opens must render the plan. `hostCanShare ⊆ canReadPlan`.
- A plan whose date is still being polled (`deciding`) is both readable **and**
  answerable — the unsettled date is a caveat shown above the buttons, not a
  refusal. `ANSWERABLE_EVENT_STATUSES` and the tuple in `rsvp_via_share_token`
  are the same set, in two languages, and the test proves it.
- Adding an `EventStatus`, or changing who may answer, fails
  `src/lib/share-link.test.ts` until you decide what a recipient sees — it walks
  every status × kill-switch combination and cross-checks the status tuple
  inside `rsvp_via_share_token`. `e2e/invite-links.spec.ts` then walks the real
  journey: a link taken out of the host UI, opened on a device with no session.

# Feature index

Switchboard reveals itself one surface at a time, which keeps it calm and means
most of what was built is never met by the people it was built for.
**`src/lib/features.ts`** is the catalogue that answers "what can this do, and
where is it?", rendered at `/features` and linked from the More sheet, Settings,
and the getting-started card.

- **Shipping a user-facing surface means adding its entry.** `features.test.ts`
  reads `src/app` and fails when a top-level page has neither an index entry nor
  a documented reason in `NOT_INDEXED` (auth plumbing, token-addressed links,
  operator screens).
- **`href` is a route that exists** — the test resolves every one against
  `src/app`, dynamic segments and all. A feature reached *through* something (a
  host control, a wizard step, a room tab) carries `where` directions and no
  `href`; never guess a URL for it.
- **Only what ships.** Roadmap entries belong in `docs/INNOVATIONS.md`. An index
  that promises a feature is worse than no index.
- Renaming a nav destination fails the test until the index agrees, so the index
  can never know less than the navigation it explains.
