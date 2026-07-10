import { describe, it, expect } from 'vitest';
import { computeProfileStrength, nextProfileSteps } from './profile-strength';

const EMPTY = {
  avatarUrl: null,
  coverUrl: null,
  bio: null,
  tagline: null,
  pronouns: null,
  location: null,
  interests: [],
  downTo: [],
  links: [],
  socials: [],
  contactEmail: null,
  contactPhone: null,
};

describe('computeProfileStrength', () => {
  it('scores an empty profile at 0% with nothing done', () => {
    const strength = computeProfileStrength(EMPTY);
    expect(strength.percent).toBe(0);
    expect(strength.doneCount).toBe(0);
    expect(strength.complete).toBe(false);
  });

  it('scores a fully filled profile at 100% and marks it complete', () => {
    const strength = computeProfileStrength({
      avatarUrl: 'https://x/storage/v1/object/public/avatars/a.png',
      coverUrl: 'https://x/storage/v1/object/public/covers/c.png',
      bio: 'Hi there.',
      tagline: 'Coffee and trails',
      pronouns: 'they/them',
      location: 'Portland, OR',
      interests: ['coffee'],
      downTo: ['hikes'],
      links: [{ label: 'Site', url: 'https://example.com' }],
      socials: [{ platform: 'instagram', value: 'me' }],
      contactEmail: 'me@example.com',
      contactPhone: '+15551234567',
    });
    expect(strength.percent).toBe(100);
    expect(strength.complete).toBe(true);
    expect(strength.doneCount).toBe(strength.total);
  });

  it('treats blank-only strings as not filled', () => {
    const strength = computeProfileStrength({ ...EMPTY, bio: '   ', contactPhone: '' });
    expect(strength.items.find((i) => i.key === 'bio')?.done).toBe(false);
    expect(strength.items.find((i) => i.key === 'phone')?.done).toBe(false);
  });

  it('counts interests OR down-to as the interests item', () => {
    const withDownTo = computeProfileStrength({ ...EMPTY, downTo: ['dinner'] });
    expect(withDownTo.items.find((i) => i.key === 'interests')?.done).toBe(true);
  });

  it('weights photo and contact fields so they move the needle most', () => {
    const withContact = computeProfileStrength({
      ...EMPTY,
      avatarUrl: 'https://x/storage/v1/object/public/avatars/a.png',
      contactPhone: '+15551234567',
      contactEmail: 'me@example.com',
    });
    const withDetails = computeProfileStrength({
      ...EMPTY,
      tagline: 'hi',
      location: 'PDX',
      pronouns: 'she/her',
    });
    // photo(3) + phone(3) + email(2) = 8 of 18 beats three weight-1 items.
    expect(withContact.percent).toBeGreaterThan(withDetails.percent);
  });
});

describe('nextProfileSteps', () => {
  it('surfaces photo and contact steps first when nothing is filled', () => {
    const strength = computeProfileStrength(EMPTY);
    const steps = nextProfileSteps(strength, 3).map((s) => s.key);
    expect(steps).toEqual(['avatar', 'phone', 'email']);
  });

  it('skips completed items', () => {
    const strength = computeProfileStrength({
      ...EMPTY,
      avatarUrl: 'https://x/storage/v1/object/public/avatars/a.png',
      contactPhone: '+15551234567',
      contactEmail: 'me@example.com',
    });
    const steps = nextProfileSteps(strength, 3).map((s) => s.key);
    expect(steps).not.toContain('avatar');
    expect(steps).not.toContain('phone');
    expect(steps).not.toContain('email');
  });

  it('returns nothing for a complete profile', () => {
    const strength = computeProfileStrength({
      avatarUrl: 'a',
      coverUrl: 'c',
      bio: 'b',
      tagline: 't',
      pronouns: 'p',
      location: 'l',
      interests: ['i'],
      downTo: [],
      links: [{}],
      socials: [{}],
      contactEmail: 'e@x.co',
      contactPhone: '+15551234567',
    });
    expect(nextProfileSteps(strength)).toEqual([]);
  });
});
