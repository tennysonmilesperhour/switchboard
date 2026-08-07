import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Focused coverage for the ways back into an account.
 *
 * `signInWithPasswordIdentifier` and `resendEmailConfirmation` are here because
 * of a real report: an account was created with a real email, the confirmation
 * mail never arrived, and sign-in with the just-saved credentials answered
 * "That email, username, or password did not work." — the one explanation that
 * was false. These pin that an unconfirmed account says so, and that the resend
 * can only ever mail an address the account already claims.
 *
 * `requestPasswordReset`: the recovery email is delivered
 * through the app's own Resend integration (`sendEmailWithResult`) using an admin-minted
 * recovery link — Supabase SMTP is only a fallback when service-role access is
 * absent. These tests pin the two things that matter: a real reset link
 * actually goes out for legitimate accounts (including email sign-ups whose
 * contact row isn't verified yet), and a link is *never* sent to an unverified,
 * merely-typed contact address (docs/SECURITY.md §9).
 */

const mocks = vi.hoisted(() => {
  type Contact = {
    user_id: string;
    kind: string;
    normalized_value: string;
    verified: boolean;
  };
  type Profile = { id: string; handle?: string; contact_email?: string };
  const db: {
    profiles: Profile[];
    contacts: Contact[];
    authUsers: Record<
      string,
      { email: string; email_confirmed_at?: string | null } | null
    >;
  } = { profiles: [], contacts: [], authUsers: {} };

  function query(
    table: string,
    eqs: Record<string, unknown>,
    verifiedOnly: boolean,
  ): { data: unknown; error: null } {
    if (table === 'profile_contacts') {
      if (eqs.normalized_value != null) {
        const row = db.contacts.find(
          (c) =>
            c.kind === eqs.kind &&
            c.normalized_value === eqs.normalized_value &&
            (!verifiedOnly || c.verified),
        );
        return { data: row ? { user_id: row.user_id } : null, error: null };
      }
      if (eqs.user_id != null) {
        const row = db.contacts.find(
          (c) =>
            c.user_id === eqs.user_id &&
            c.kind === eqs.kind &&
            (!verifiedOnly || c.verified),
        );
        return {
          data: row ? { normalized_value: row.normalized_value } : null,
          error: null,
        };
      }
    }
    if (table === 'profiles') {
      if (eqs.contact_email != null) {
        const p = db.profiles.find((row) => row.contact_email === eqs.contact_email);
        return { data: p ? { id: p.id } : null, error: null };
      }
      if (eqs.handle != null) {
        const p = db.profiles.find((row) => row.handle === eqs.handle);
        return { data: p ? { id: p.id } : null, error: null };
      }
    }
    return { data: null, error: null };
  }

  // Minimal chainable PostgREST stand-in: records `.eq()` filters and whether a
  // `.not('verified_at', ...)` clause was applied, then resolves against `db`.
  function makeBuilder(table: string) {
    const eqs: Record<string, unknown> = {};
    let verifiedOnly = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        eqs[col] = val;
        return b;
      },
      not: () => {
        verifiedOnly = true;
        return b;
      },
      ilike: (col: string, val: unknown) => {
        eqs[col] = val;
        return b;
      },
      limit: () => b,
      maybeSingle: async () => query(table, eqs, verifiedOnly),
      single: async () => query(table, eqs, verifiedOnly),
    };
    return b;
  }

  const getUserById = vi.fn(async (id: string) => ({
    data: { user: db.authUsers[id] ?? null },
    error: null,
  }));
  const generateLink = vi.fn(async () => ({
    data: {
      properties: { hashed_token: 'HASH', action_link: 'https://example/action' },
    },
    error: null,
  }));
  const sendEmailWithResult = vi.fn(
    async (message: {
      to: string;
      subject: string;
      text: string;
      html?: string;
    }) => ({
      status: typeof message.to === 'string' ? 'sent' : 'invalid_recipient',
      provider: 'resend',
    }),
  );
  const resetPasswordForEmail = vi.fn(async () => ({ data: {}, error: null }));
  /**
   * Stands in for GoTrue's password grant. Defaults to rejecting, so each test
   * says explicitly which outcome it is exercising. `code` is what the action
   * branches on, exactly as `AuthError.code` does in production.
   */
  const signInWithPassword = vi.fn(async () => ({
    data: {},
    error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } as
      | { code: string; status: number; message: string }
      | null,
  }));
  const checkRateLimit = vi.fn(async () => true);
  const hasAdminCredentials = vi.fn(() => true);

  return {
    db,
    makeBuilder,
    getUserById,
    generateLink,
    sendEmailWithResult,
    resetPasswordForEmail,
    signInWithPassword,
    checkRateLimit,
    hasAdminCredentials,
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: mocks.hasAdminCredentials,
  createAdminClient: () => ({
    from: (table: string) => mocks.makeBuilder(table),
    auth: {
      admin: { getUserById: mocks.getUserById, generateLink: mocks.generateLink },
    },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      signInWithPassword: mocks.signInWithPassword,
    },
  }),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

// Keeps the real module's `server-only` import out of the test runtime.
vi.mock('@/lib/analytics/server', () => ({
  capture: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/server/email', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/server/email')>();
  return {
    ...actual,
    sendEmailWithResult: mocks.sendEmailWithResult,
    // A configured provider is the precondition these tests are about; without
    // this they'd all short-circuit on the operator failure instead.
    emailEnabled: () => true,
  };
});

import {
  requestPasswordReset,
  resendEmailConfirmation,
  signInWithPasswordIdentifier,
} from './auth';

function seed(state: {
  profiles?: (typeof mocks.db.profiles);
  contacts?: (typeof mocks.db.contacts);
  authUsers?: (typeof mocks.db.authUsers);
}) {
  mocks.db.profiles = state.profiles ?? [];
  mocks.db.contacts = state.contacts ?? [];
  mocks.db.authUsers = state.authUsers ?? {};
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.hasAdminCredentials.mockReturnValue(true);
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.signInWithPassword.mockResolvedValue({
    data: {},
    error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
  });
  seed({});
});

describe('signInWithPasswordIdentifier', () => {
  const account = {
    profiles: [{ id: 'u1', handle: 'alice', contact_email: 'alice@example.com' }],
    contacts: [
      { user_id: 'u1', kind: 'email', normalized_value: 'alice@example.com', verified: false },
    ],
    authUsers: { u1: { email: 'alice@example.com' } },
  };

  it('names an unconfirmed email instead of blaming the credentials', async () => {
    // The reported bug. GoTrue checks the password before it checks
    // confirmation, so `email_not_confirmed` means the credentials were right —
    // telling someone they were wrong sends them to reset a working password.
    seed(account);
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' },
    });

    const result = await signInWithPasswordIdentifier({
      identifier: 'Alice@Example.com',
      password: 'correct-horse',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('SB-AUTH-UNCONFIRMED');
    expect(result.needsEmailConfirmation).toBe(true);
    expect(result.identifier).toBe('alice@example.com');
    expect(result.fix).toBeTruthy();
    expect(result.error).not.toMatch(/did not work/);
  });

  /**
   * The invariant, stated as a table: GoTrue checks the password before any of
   * these, so every one of them describes an account whose credentials were
   * RIGHT and which still cannot get in. Each must name itself. If a new reason
   * to refuse a valid password appears and is left to fall through, it lands in
   * "That email, username, or password did not work." — which is how the
   * original report reached us, and adding a row here is what stops the next
   * one being unanswerable.
   */
  const BLOCKED: Array<{ supabaseCode: string; code: string }> = [
    { supabaseCode: 'email_not_confirmed', code: 'SB-AUTH-UNCONFIRMED' },
    { supabaseCode: 'user_banned', code: 'SB-AUTH-SUSPENDED' },
    { supabaseCode: 'over_request_rate_limit', code: 'SB-RATE-LIMIT' },
  ];

  for (const { supabaseCode, code } of BLOCKED) {
    it(`names ${supabaseCode} rather than blaming the password`, async () => {
      seed(account);
      mocks.signInWithPassword.mockResolvedValue({
        data: {},
        error: { code: supabaseCode, status: 400, message: supabaseCode },
      });

      const result = await signInWithPasswordIdentifier({
        identifier: 'alice@example.com',
        password: 'correct-horse',
      });

      expect(result.ok).toBe(false);
      expect(result.code, supabaseCode).toBe(code);
      expect(result.error, supabaseCode).not.toMatch(/did not work/);
    });
  }

  it('offers the resend only for the one cause that has a link to re-send', async () => {
    // A suspension has nothing for the reader to press, so the button must not
    // appear promising a way out that doesn't exist.
    seed(account);
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: 'user_banned', status: 400, message: 'User banned' },
    });

    const result = await signInWithPasswordIdentifier({
      identifier: 'alice@example.com',
      password: 'correct-horse',
    });

    expect(result.needsEmailConfirmation).toBe(false);
  });

  it('names our own rate limit, and says how long', async () => {
    seed(account);
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await signInWithPasswordIdentifier({
      identifier: 'alice@example.com',
      password: 'correct-horse',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('SB-RATE-LIMIT');
    expect(result.error).toMatch(/\d+ minutes/);
    // Blocked before any credential check — the limiter is the whole point.
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('still blames the credentials when the password is actually wrong', async () => {
    seed(account);

    const result = await signInWithPasswordIdentifier({
      identifier: 'alice@example.com',
      password: 'nope',
    });

    expect(result.ok).toBe(false);
    expect(result.needsEmailConfirmation).toBeUndefined();
    expect(result.code).toBeUndefined();
    expect(result.error).toMatch(/did not work/);
  });

  it('signs in when the grant succeeds', async () => {
    seed(account);
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });

    const result = await signInWithPasswordIdentifier({
      identifier: 'alice@example.com',
      password: 'correct-horse',
    });

    expect(result).toEqual({ ok: true });
  });
});

describe('resendEmailConfirmation', () => {
  it('mails a fresh confirmation link to an unconfirmed email account', async () => {
    seed({
      profiles: [{ id: 'u1', handle: 'alice', contact_email: 'alice@example.com' }],
      contacts: [
        { user_id: 'u1', kind: 'email', normalized_value: 'alice@example.com', verified: false },
      ],
      authUsers: { u1: { email: 'alice@example.com', email_confirmed_at: null } },
    });

    const result = await resendEmailConfirmation('Alice@Example.com');

    expect(result.ok).toBe(true);
    // A magic link both proves control of the address and confirms it, so the
    // reader lands signed in rather than back at the form.
    expect(mocks.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'magiclink', email: 'alice@example.com' }),
    );
    expect(mocks.sendEmailWithResult).toHaveBeenCalledTimes(1);
    const message = mocks.sendEmailWithResult.mock.calls[0][0];
    expect(message.to).toBe('alice@example.com');
    expect(message.text).toContain('/auth/confirm?token_hash=HASH&type=magiclink');
  });

  it('sends nothing for an account that is already confirmed', async () => {
    seed({
      profiles: [{ id: 'u1', handle: 'alice', contact_email: 'alice@example.com' }],
      contacts: [
        { user_id: 'u1', kind: 'email', normalized_value: 'alice@example.com', verified: true },
      ],
      authUsers: { u1: { email: 'alice@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' } },
    });

    const result = await resendEmailConfirmation('alice@example.com');

    expect(result.ok).toBe(true);
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.sendEmailWithResult).not.toHaveBeenCalled();
  });

  it('answers the same way for an address with no account, revealing nothing', async () => {
    seed({});

    const result = await resendEmailConfirmation('stranger@example.com');

    expect(result.ok).toBe(true);
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.sendEmailWithResult).not.toHaveBeenCalled();
  });

  it('never mails a username account’s merely-typed contact address', async () => {
    // The §9 invariant, restated for this surface: Carol typed someone else's
    // address and never proved she controls it. A resend must not become a way
    // to mail a sign-in link to a stranger.
    seed({
      profiles: [{ id: 'u3', handle: 'carol', contact_email: 'victim@example.com' }],
      contacts: [
        { user_id: 'u3', kind: 'email', normalized_value: 'victim@example.com', verified: false },
      ],
      authUsers: { u3: { email: 'carol@users.switchboard.local', email_confirmed_at: null } },
    });

    const result = await resendEmailConfirmation('victim@example.com');

    expect(result.ok).toBe(true);
    expect(mocks.sendEmailWithResult).not.toHaveBeenCalled();
  });
});

describe('requestPasswordReset', () => {
  it('rejects an empty identifier', async () => {
    const result = await requestPasswordReset('   ');
    expect(result.ok).toBe(false);
    expect(mocks.sendEmailWithResult).not.toHaveBeenCalled();
  });

  it('emails a reset link to an email account that has not confirmed its contact yet', async () => {
    // Regression: email sign-ups have an *unverified* contact row until they
    // click the confirmation link. Recovery must still reach their login email.
    seed({
      profiles: [{ id: 'u1', handle: 'alice', contact_email: 'alice@example.com' }],
      contacts: [
        { user_id: 'u1', kind: 'email', normalized_value: 'alice@example.com', verified: false },
      ],
      authUsers: { u1: { email: 'alice@example.com' } },
    });

    const result = await requestPasswordReset('Alice@Example.com');

    expect(result.ok).toBe(true);
    expect(mocks.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'recovery', email: 'alice@example.com' }),
    );
    expect(mocks.sendEmailWithResult).toHaveBeenCalledTimes(1);
    const message = mocks.sendEmailWithResult.mock.calls[0][0];
    expect(message.to).toBe('alice@example.com');
    expect(message.text).toContain('/auth/confirm?token_hash=HASH&type=recovery');
    // With service-role access we never depend on Supabase SMTP.
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('emails a reset link to a verified email account', async () => {
    seed({
      profiles: [{ id: 'u1', handle: 'alice', contact_email: 'alice@example.com' }],
      contacts: [
        { user_id: 'u1', kind: 'email', normalized_value: 'alice@example.com', verified: true },
      ],
      authUsers: { u1: { email: 'alice@example.com' } },
    });

    await requestPasswordReset('alice@example.com');

    expect(mocks.sendEmailWithResult).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmailWithResult.mock.calls[0][0].to).toBe('alice@example.com');
  });

  it('delivers a username account recovery to its verified email contact', async () => {
    // Username accounts have a synthetic, undeliverable login email. The link is
    // minted for that login email but delivered to the verified real address.
    seed({
      profiles: [{ id: 'u2', handle: 'bob' }],
      contacts: [
        { user_id: 'u2', kind: 'email', normalized_value: 'bob@real.com', verified: true },
      ],
      authUsers: { u2: { email: 'bob@users.switchboard.local' } },
    });

    await requestPasswordReset('bob');

    expect(mocks.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'bob@users.switchboard.local' }),
    );
    expect(mocks.sendEmailWithResult).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmailWithResult.mock.calls[0][0].to).toBe('bob@real.com');
  });

  it('never sends a link to an unverified, merely-typed contact address', async () => {
    // Carol (a username account) typed someone else's email but never proved she
    // controls it. Neither the username nor the email path may leak a reset link
    // to that address.
    seed({
      profiles: [{ id: 'u3', handle: 'carol', contact_email: 'victim@example.com' }],
      contacts: [
        { user_id: 'u3', kind: 'email', normalized_value: 'victim@example.com', verified: false },
      ],
      authUsers: { u3: { email: 'carol@users.switchboard.local' } },
    });

    await requestPasswordReset('carol');
    expect(mocks.sendEmailWithResult).not.toHaveBeenCalled();

    await requestPasswordReset('victim@example.com');
    expect(mocks.sendEmailWithResult).not.toHaveBeenCalled();
  });

  it('reveals nothing and sends nothing for an unknown account', async () => {
    seed({});
    const result = await requestPasswordReset('nobody@example.com');
    expect(result).toEqual({ ok: true, identifier: 'nobody@example.com' });
    expect(mocks.sendEmailWithResult).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('falls back to Supabase recovery email when service-role access is absent', async () => {
    mocks.hasAdminCredentials.mockReturnValue(false);
    await requestPasswordReset('alice@example.com');
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/auth/callback') }),
    );
    expect(mocks.sendEmailWithResult).not.toHaveBeenCalled();
  });

  it('returns generic and skips delivery when rate limited', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    seed({
      profiles: [{ id: 'u1', handle: 'alice', contact_email: 'alice@example.com' }],
      contacts: [
        { user_id: 'u1', kind: 'email', normalized_value: 'alice@example.com', verified: true },
      ],
      authUsers: { u1: { email: 'alice@example.com' } },
    });
    const result = await requestPasswordReset('alice@example.com');
    expect(result.ok).toBe(true);
    expect(mocks.sendEmailWithResult).not.toHaveBeenCalled();
  });
});
