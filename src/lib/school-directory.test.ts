import { describe, expect, it } from 'vitest';
import {
  checkFactEmail,
  describeFactEmailRefusal,
  emailDomain,
  normalizeKey,
  orgFromClaim,
  orgsFromEmail,
  registrableDomain,
} from './school-directory';

describe('claims', () => {
  it('treats every spelling of a known school as one place', () => {
    const keys = ['BYU', 'byu', 'Brigham Young University', 'brigham-young university'].map(
      (label) => orgFromClaim('school', label)?.key,
    );
    expect(new Set(keys)).toEqual(new Set(['byu']));
  });

  it('keeps near neighbours apart', () => {
    expect(orgFromClaim('school', 'BYU')?.key).not.toBe(orgFromClaim('school', 'BYU-Idaho')?.key);
    expect(orgFromClaim('school', 'UVU')?.key).not.toBe(orgFromClaim('school', 'BYU')?.key);
  });

  it('keys an unknown place on the letters typed', () => {
    expect(orgFromClaim('school', 'Hogwarts')).toMatchObject({ key: 'hogwarts', known: false });
    expect(orgFromClaim('employer', 'Acme Corp.')).toMatchObject({ key: 'acmecorp', known: false });
  });

  it('refuses text with nothing to key on', () => {
    expect(orgFromClaim('school', ' ')).toBeNull();
    expect(orgFromClaim('school', '!!')).toBeNull();
    expect(normalizeKey('U of U')).toBe('uofu');
  });
});

describe('domains', () => {
  it('reads the domain after the last @', () => {
    expect(emailDomain(' Ana@Student.UVU.edu ')).toBe('student.uvu.edu');
    expect(emailDomain('nope')).toBeNull();
    expect(emailDomain('a@b')).toBeNull();
    expect(emailDomain('a b@c.edu')).toBeNull();
  });

  it('finds the registrable domain', () => {
    expect(registrableDomain('student.uvu.edu')).toBe('uvu.edu');
    expect(registrableDomain('mail.imperial.ac.uk')).toBe('imperial.ac.uk');
    expect(registrableDomain('acme.com')).toBe('acme.com');
  });

  it('proves a known school from its mail subdomain', () => {
    const orgs = orgsFromEmail('ana@my.uvu.edu');
    expect(orgs).toMatchObject({ ok: true, domain: 'uvu.edu' });
    if (orgs.ok) expect(orgs.school).toMatchObject({ key: 'uvu', label: 'Utah Valley University', known: true });
  });

  it('proves an unknown .edu as itself', () => {
    const orgs = orgsFromEmail('x@cs.smallcollege.edu');
    if (!orgs.ok) throw new Error('expected ok');
    expect(orgs.school).toMatchObject({ key: 'smallcollege', label: 'smallcollege.edu', known: false });
  });

  it('proves nothing from a personal mailbox', () => {
    expect(orgsFromEmail('ana@gmail.com')).toEqual({ ok: false, reason: 'free_mail' });
    expect(orgsFromEmail('ana@icloud.com')).toEqual({ ok: false, reason: 'free_mail' });
  });
});

describe('checking an address against a fact', () => {
  it('verifies a matching school claim', () => {
    expect(checkFactEmail({ kind: 'school', label: 'BYU' }, 'a@byu.edu')).toMatchObject({
      ok: true,
      org: { key: 'byu' },
      domain: 'byu.edu',
    });
  });

  it('will not verify BYU with a UVU address, and says why', () => {
    const check = checkFactEmail({ kind: 'school', label: 'BYU' }, 'a@uvu.edu');
    expect(check).toMatchObject({ ok: false, reason: 'different_org', actual: 'Utah Valley University' });
    if (!check.ok) expect(describeFactEmailRefusal(check)).toContain('Utah Valley University');
  });

  it('replaces an unknown claim with what the domain proves', () => {
    const check = checkFactEmail({ kind: 'school', label: 'Small College' }, 'a@smallcollege.edu');
    expect(check).toMatchObject({ ok: true, org: { key: 'smallcollege', label: 'smallcollege.edu' } });
  });

  it('refuses a work address for a school and a personal one for either', () => {
    expect(checkFactEmail({ kind: 'school', label: 'Acme' }, 'a@acme.com')).toMatchObject({
      ok: false,
      reason: 'not_a_school',
    });
    expect(checkFactEmail({ kind: 'employer', label: 'Acme' }, 'a@gmail.com')).toMatchObject({
      ok: false,
      reason: 'free_mail',
    });
  });

  it('lets a university address verify employment there', () => {
    expect(checkFactEmail({ kind: 'employer', label: 'University of Utah' }, 'a@utah.edu')).toMatchObject({
      ok: true,
      org: { kind: 'employer', key: 'utah' },
    });
  });

  it('describes every refusal', () => {
    for (const reason of ['invalid', 'free_mail', 'not_a_school', 'different_org'] as const) {
      expect(describeFactEmailRefusal({ ok: false, reason }).length).toBeGreaterThan(10);
    }
  });
});
