import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Focused coverage for `requestPasswordReset`. The recovery email is delivered
 * through the app's own Resend integration (`sendEmail`) using an admin-minted
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
    authUsers: Record<string, { email: string } | null>;
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
  const sendEmail = vi.fn(
    async (message: {
      to: string;
      subject: string;
      text: string;
      html?: string;
    }) => typeof message.to === 'string',
  );
  const resetPasswordForEmail = vi.fn(async () => ({ data: {}, error: null }));
  const checkRateLimit = vi.fn(async () => true);
  const hasAdminCredentials = vi.fn(() => true);

  return {
    db,
    makeBuilder,
    getUserById,
    generateLink,
    sendEmail,
    resetPasswordForEmail,
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
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  }),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock('@/lib/server/email', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/server/email')>();
  return { ...actual, sendEmail: mocks.sendEmail };
});

import { requestPasswordReset } from './auth';

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
  seed({});
});

describe('requestPasswordReset', () => {
  it('rejects an empty identifier', async () => {
    const result = await requestPasswordReset('   ');
    expect(result.ok).toBe(false);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
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
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const message = mocks.sendEmail.mock.calls[0][0];
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

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe('alice@example.com');
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
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe('bob@real.com');
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
    expect(mocks.sendEmail).not.toHaveBeenCalled();

    await requestPasswordReset('victim@example.com');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('reveals nothing and sends nothing for an unknown account', async () => {
    seed({});
    const result = await requestPasswordReset('nobody@example.com');
    expect(result).toEqual({ ok: true, identifier: 'nobody@example.com' });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('falls back to Supabase recovery email when service-role access is absent', async () => {
    mocks.hasAdminCredentials.mockReturnValue(false);
    await requestPasswordReset('alice@example.com');
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/auth/callback') }),
    );
    expect(mocks.sendEmail).not.toHaveBeenCalled();
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
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
