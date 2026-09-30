import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coverImageType, fetchableCover, ogCoverDataUri } from './og-cover';

const ORIGIN = 'https://project.supabase.co';
const OWN = `${ORIGIN}/storage/v1/object/public/media/user-1/event-cover-1.jpg`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGIN;
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

function respond(bytes: Uint8Array, init: ResponseInit = {}) {
  return vi.fn(async () => new Response(bytes as unknown as BodyInit, { status: 200, ...init }));
}

describe('fetchableCover (G23)', () => {
  it('takes a cover uploaded to our own media bucket', () => {
    expect(fetchableCover(OWN)).toBe(OWN);
  });

  it('never fetches a link a host pasted, or anything that is not a web URL', () => {
    expect(fetchableCover('https://example.com/cover.jpg')).toBeNull();
    expect(fetchableCover('http://169.254.169.254/latest/meta-data')).toBeNull();
    expect(fetchableCover(`${ORIGIN}/storage/v1/object/public/avatars/user-1/a.jpg`)).toBeNull();
    expect(fetchableCover('javascript:alert(1)')).toBeNull();
    expect(fetchableCover(null)).toBeNull();
  });
});

describe('coverImageType', () => {
  it('reads the format from the bytes', () => {
    expect(coverImageType(JPEG)).toBe('image/jpeg');
    expect(coverImageType(PNG)).toBe('image/png');
    expect(coverImageType(new TextEncoder().encode('<svg xmlns=...>'))).toBeNull();
  });
});

describe('ogCoverDataUri', () => {
  it('hands the renderer the cover as a data URI', async () => {
    const fetchImpl = respond(JPEG, { headers: { 'content-type': 'text/html' } });
    const uri = await ogCoverDataUri(OWN, fetchImpl as unknown as typeof fetch);
    expect(uri).toBe(`data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}`);
    expect(fetchImpl).toHaveBeenCalledWith(OWN, expect.objectContaining({ redirect: 'error' }));
  });

  it('does not fetch at all for a cover that is not ours', async () => {
    const fetchImpl = respond(JPEG);
    expect(await ogCoverDataUri('https://example.com/c.jpg', fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to the text card for anything it cannot draw', async () => {
    const webp = new TextEncoder().encode('RIFF....WEBPVP8 ');
    expect(await ogCoverDataUri(OWN, respond(webp) as unknown as typeof fetch)).toBeNull();
    expect(await ogCoverDataUri(OWN, respond(JPEG, { status: 404 }) as unknown as typeof fetch)).toBeNull();
    expect(
      await ogCoverDataUri(
        OWN,
        respond(JPEG, { headers: { 'content-length': String(10 * 1024 * 1024) } }) as unknown as typeof fetch,
      ),
    ).toBeNull();
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await ogCoverDataUri(OWN, failing as unknown as typeof fetch)).toBeNull();
  });

  it('stops reading a cover larger than the cap', async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 10);
    big.set(JPEG);
    expect(await ogCoverDataUri(OWN, respond(big) as unknown as typeof fetch)).toBeNull();
  });
});
