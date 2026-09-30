import { describe, expect, it } from 'vitest';
import {
  guardianApprovalEmail,
  guardianStepFor,
  latestGuardianRequest,
  maskEmail,
} from './guardian-approval';

describe('maskEmail', () => {
  it('keeps the first letter and the domain, never the rest of the local part', () => {
    expect(maskEmail('parent@example.com')).toBe('p•••@example.com');
    expect(maskEmail('  Pat.Smith+kids@mail.example.org ')).toBe('P•••@mail.example.org');
  });

  it('reveals nothing for a value that is not an address', () => {
    expect(maskEmail('not-an-email')).toBe('•••');
    expect(maskEmail('@example.com')).toBe('•••');
  });
});

describe('latestGuardianRequest', () => {
  it('describes the newest request, masked, with what happened to its email', () => {
    const view = latestGuardianRequest([
      {
        status: 'denied',
        guardian_email: 'old@example.com',
        created_at: '2026-09-01T00:00:00Z',
        email_status: 'sent',
      },
      {
        status: 'pending',
        guardian_email: 'new@example.com',
        created_at: '2026-09-02T00:00:00Z',
        email_status: 'failed',
      },
    ]);
    expect(view).toEqual({
      status: 'pending',
      sentTo: 'n•••@example.com',
      requestedAt: '2026-09-02T00:00:00Z',
      emailStatus: 'failed',
    });
  });

  it('is null when nobody has been asked yet', () => {
    expect(latestGuardianRequest([])).toBeNull();
  });

  it('treats a request from before outcomes were recorded as unknown, not delivered', () => {
    expect(
      latestGuardianRequest([
        { status: 'pending', guardian_email: 'a@example.com', created_at: '2026-09-01T00:00:00Z' },
      ])?.emailStatus,
    ).toBeNull();
  });
});

describe('guardianApprovalEmail', () => {
  const facts = {
    title: 'Climbing gym',
    when: 'Sat, Oct 10, 2:00 PM PDT',
    where: 'Boulder Barn, 12 Main St',
    hostName: 'Coach Sam',
    inviteeName: 'Avery',
  };

  it('tells the guardian exactly what D2 allows: what, when, where, who hosts, who said yes', () => {
    const { subject, text } = guardianApprovalEmail({
      facts,
      guardianName: 'Pat',
      link: 'https://example.test/approve/abc',
    });
    expect(subject).toContain('Avery');
    expect(subject).toContain('Climbing gym');
    for (const value of Object.values(facts)) expect(text).toContain(value);
    expect(text).toContain('https://example.test/approve/abc');
    expect(text.startsWith('Hi Pat,')).toBe(true);
  });

  it('leaves out a place the plan does not have yet', () => {
    const { text } = guardianApprovalEmail({
      facts: { ...facts, where: null },
      guardianName: null,
      link: 'https://example.test/approve/abc',
    });
    expect(text).not.toContain('Where:');
    expect(text.startsWith('Hi,')).toBe(true);
  });
});

describe('guardianStepFor', () => {
  const denied = {
    status: 'denied',
    guardian_email: 'old@example.com',
    created_at: '2026-09-01T00:00:00Z',
    email_status: 'sent',
  };

  it('lets a yes given again after a denial ask again, instead of re-showing the denial', () => {
    expect(guardianStepFor('pending_approval', [denied])).toEqual({ request: null });
  });

  it('shows a denial on the invite it declined', () => {
    expect(guardianStepFor('declined', [denied])?.request?.status).toBe('denied');
  });

  it('has nothing to show for an ordinary decline, or a yes that counts', () => {
    expect(guardianStepFor('declined', [])).toBeNull();
    expect(guardianStepFor('accepted', [denied])).toBeNull();
    expect(guardianStepFor(undefined, [])).toBeNull();
  });
});
