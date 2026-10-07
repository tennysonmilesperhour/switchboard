import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forgetSavedContactPhones,
  rememberContactPhones,
  savedContactPhone,
} from './saved-contact-phones';

const store = new Map<string, string>();

describe('saved contact phones', () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
  });

  it('keeps the number of a contact that matched an account', () => {
    rememberContactPhones([{ profile: { id: 'p1' }, smsTarget: '+15551234567' }]);
    expect(savedContactPhone('p1')).toBe('+15551234567');
  });

  it('ignores contacts with no account or no number', () => {
    rememberContactPhones([
      { profile: null, smsTarget: '+15551234567' },
      { profile: { id: 'p2' }, smsTarget: null },
    ]);
    expect(savedContactPhone('p2')).toBeNull();
  });

  it('refuses anything that is not a plain phone number', () => {
    store.set(
      'switchboard.contact-phones.v1',
      JSON.stringify({ p3: 'javascript:alert(1)', p4: '+15557654321' }),
    );
    expect(savedContactPhone('p3')).toBeNull();
    expect(savedContactPhone('p4')).toBe('+15557654321');
  });

  it('forgets everything on request', () => {
    rememberContactPhones([{ profile: { id: 'p1' }, smsTarget: '+15551234567' }]);
    forgetSavedContactPhones();
    expect(savedContactPhone('p1')).toBeNull();
  });

  it('survives corrupt storage', () => {
    store.set('switchboard.contact-phones.v1', '{not json');
    expect(savedContactPhone('p1')).toBeNull();
  });
});
