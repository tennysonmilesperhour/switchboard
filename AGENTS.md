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
