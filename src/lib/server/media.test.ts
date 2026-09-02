import { afterEach, describe, it, expect } from 'vitest';
import {
  isOwnPublicStorageUrl,
  isStoredMediaPath,
  isValidMediaRef,
} from './media';

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

describe('isStoredMediaPath', () => {
  it('accepts a per-user private-bucket path', () => {
    expect(isStoredMediaPath('a1b2/voice-123-abc.webm')).toBe(true);
    expect(isStoredMediaPath('user-id/capsule-1-2.jpg')).toBe(true);
  });

  it('rejects full URLs (legacy public / external / signed)', () => {
    expect(isStoredMediaPath('https://x.supabase.co/storage/v1/object/public/media/a/b.jpg')).toBe(false);
    expect(isStoredMediaPath('http://example.com/x.png')).toBe(false);
    expect(isStoredMediaPath('https://evil.com/x')).toBe(false);
  });

  it('rejects empty, traversal, and non-folder values', () => {
    expect(isStoredMediaPath('')).toBe(false);
    expect(isStoredMediaPath('../secrets/x')).toBe(false);
    expect(isStoredMediaPath('a/../b')).toBe(false);
    expect(isStoredMediaPath('nofolder.jpg')).toBe(false); // no `<uid>/` segment
  });
});

describe('isValidMediaRef', () => {
  it('accepts an https URL or a private path', () => {
    expect(isValidMediaRef('https://x.supabase.co/storage/v1/object/sign/media-private/a/b')).toBe(true);
    expect(isValidMediaRef('uid/voice-1.webm')).toBe(true);
  });

  it('rejects http, other schemes, and traversal', () => {
    expect(isValidMediaRef('http://example.com/x')).toBe(false);
    expect(isValidMediaRef('javascript:alert(1)')).toBe(false);
    expect(isValidMediaRef('../../etc/passwd')).toBe(false);
  });
});

describe('isOwnPublicStorageUrl', () => {
  it('requires both the configured Supabase origin and an allowed bucket', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://switchboard.supabase.co';

    expect(
      isOwnPublicStorageUrl(
        'https://switchboard.supabase.co/storage/v1/object/public/media/user/photo.jpg',
        ['media'],
      ),
    ).toBe(true);
    expect(
      isOwnPublicStorageUrl(
        'https://switchboard.supabase.co/storage/v1/object/public/avatars/user/photo.jpg',
        ['media'],
      ),
    ).toBe(false);
  });

  it('rejects an attacker origin carrying a lookalike storage path', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://switchboard.supabase.co';

    expect(
      isOwnPublicStorageUrl(
        'https://evil.example/storage/v1/object/public/media/user/photo.jpg',
        ['media'],
      ),
    ).toBe(false);
    expect(
      isOwnPublicStorageUrl(
        'not a url/storage/v1/object/public/media/user/photo.jpg',
        ['media'],
      ),
    ).toBe(false);
  });
});
