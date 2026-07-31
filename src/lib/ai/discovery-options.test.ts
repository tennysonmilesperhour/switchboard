import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GROUP_SIZE,
  GROUP_SIZES,
  describeCompany,
  isGroupSize,
  isSolo,
  normalizeGroupSize,
} from './discovery-options';

describe('group sizes', () => {
  it('offers a solo option and keeps the default a real option', () => {
    expect(GROUP_SIZES).toContain('Just me');
    expect(isGroupSize(DEFAULT_GROUP_SIZE)).toBe(true);
  });

  it('normalises anything the form did not offer', () => {
    expect(normalizeGroupSize('Just me')).toBe('Just me');
    expect(normalizeGroupSize('a busload')).toBe(DEFAULT_GROUP_SIZE);
    expect(normalizeGroupSize('')).toBe(DEFAULT_GROUP_SIZE);
  });

  it('treats only the solo option as solo', () => {
    expect(isSolo('Just me')).toBe(true);
    expect(isSolo('Just us two')).toBe(false);
    // A junk value must not fall through to solo.
    expect(isSolo('just me')).toBe(false);
  });
});

describe('describeCompany', () => {
  it('says solo plainly rather than as a group of one', () => {
    const line = describeCompany('Just me', false);
    expect(line).toMatch(/solo/i);
    expect(line).not.toMatch(/Group size/);
  });

  it('keeps solo and open-to-meeting independent', () => {
    const alone = describeCompany('Just me', false);
    const mingling = describeCompany('Just me', true);
    expect(alone).toMatch(/own company/i);
    expect(alone).not.toMatch(/meeting people/i);
    expect(mingling).toMatch(/meeting people/i);
  });

  it('never suggests a companion-only activity for a solo search', () => {
    expect(describeCompany('Just me', true)).toMatch(/only works if someone comes with them/i);
  });

  it('adds mixing guidance to group searches only when asked', () => {
    const closed = describeCompany('Small group (3-6)', false);
    const open = describeCompany('Small group (3-6)', true);
    expect(closed).toBe('Group size: Small group (3-6).');
    expect(open).toMatch(/mixes with strangers/i);
  });

  it('describes every offered option without leaking a raw junk value', () => {
    for (const size of GROUP_SIZES) {
      for (const open of [true, false]) {
        expect(describeCompany(size, open).length).toBeGreaterThan(0);
      }
    }
    expect(describeCompany('<script>', false)).toContain(DEFAULT_GROUP_SIZE);
    expect(describeCompany('<script>', false)).not.toContain('<script>');
  });
});
