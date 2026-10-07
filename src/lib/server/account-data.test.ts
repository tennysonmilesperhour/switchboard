import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_STORAGE_BUCKETS,
  deleteAccountAndData,
  deleteUserStorage,
  serializeMyDataExport,
  type MyDataExport,
} from './account-data';

function storageClient(
  initial: Record<string, string[]>,
  options: { listErrorBucket?: string } = {},
) {
  const objects = new Map(
    Object.entries(initial).map(([bucket, paths]) => [bucket, new Set(paths)]),
  );
  const deleteUser = vi.fn(async () => ({ data: {}, error: null }));

  const admin = {
    storage: {
      from: (bucket: string) => ({
        list: async (
          folder: string,
          query: { limit: number; offset: number },
        ) => {
          if (options.listErrorBucket === bucket) {
            return { data: null, error: { message: 'list failed' } };
          }
          const entries = new Map<
            string,
            { name: string; id: string | null }
          >();
          const prefix = `${folder}/`;
          for (const path of objects.get(bucket) ?? []) {
            if (!path.startsWith(prefix)) continue;
            const remainder = path.slice(prefix.length);
            const [name, ...tail] = remainder.split('/');
            if (!name) continue;
            entries.set(name, {
              name,
              id: tail.length === 0 ? `object-${name}` : null,
            });
          }
          const page = [...entries.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(query.offset, query.offset + query.limit);
          return { data: page, error: null };
        },
        remove: async (paths: string[]) => {
          for (const path of paths) objects.get(bucket)?.delete(path);
          return { data: [], error: null };
        },
      }),
    },
    auth: { admin: { deleteUser } },
  } as unknown as SupabaseClient;

  return { admin, objects, deleteUser };
}

describe('account storage deletion', () => {
  it('recursively removes every owned object from every app bucket', async () => {
    const userId = 'user-1';
    const { admin, objects } = storageClient({
      avatars: [`${userId}/avatar.png`],
      covers: [`${userId}/nested/cover.jpg`],
      media: [`${userId}/room-photo.webp`, `${userId}/deep/path/plan.jpg`],
      'media-private': [`${userId}/voice.webm`],
    });

    const deleted = await deleteUserStorage(admin, userId);

    expect(deleted).toEqual({
      avatars: 1,
      covers: 1,
      media: 2,
      'media-private': 1,
    });
    for (const bucket of ACCOUNT_STORAGE_BUCKETS) {
      expect(objects.get(bucket)?.size ?? 0, bucket).toBe(0);
    }
  });

  it('does not delete the auth user when storage cannot be verified empty', async () => {
    const { admin, deleteUser } = storageClient(
      { avatars: [], covers: [], media: [], 'media-private': [] },
      { listErrorBucket: 'media' },
    );

    await expect(deleteAccountAndData(admin, 'user-2')).rejects.toThrow(
      'Could not list account objects in media',
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

describe('data export serialization', () => {
  it('produces valid, human-readable JSON with the documented top-level data', () => {
    const data: MyDataExport = {
      schemaVersion: 1,
      exportedAt: '2026-09-02T12:00:00.000Z',
      accountId: 'user-1',
      profile: { display_name: 'Ada' },
      plans: [{ id: 'plan-1' }],
      rsvps: [{ id: 'rsvp-1' }],
      messages: { rooms: [{ id: 'message-1' }], plans: [] },
      signals: [{ id: 'signal-1' }],
      discovery: { facts: [], lanes: [], weights: [], mood: null, taps: [] },
    };

    const json = serializeMyDataExport(data);

    expect(JSON.parse(json)).toEqual(data);
    expect(json).toContain('\n  "profile"');
  });
});
