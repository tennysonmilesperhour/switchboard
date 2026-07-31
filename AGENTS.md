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
- Adding an `EventStatus`, or changing who may answer, fails
  `src/lib/share-link.test.ts` until you decide what a recipient sees — it walks
  every status × kill-switch combination and cross-checks the status tuple
  inside `rsvp_via_share_token`. `e2e/invite-links.spec.ts` then walks the real
  journey: a link taken out of the host UI, opened on a device with no session.
