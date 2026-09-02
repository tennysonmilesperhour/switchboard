import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_STORAGE_BUCKETS,
  buildMyDataExport,
  deleteAccountAndData,
  deleteUserStorage,
  listUserStoragePaths,
  serializeMyDataExport,
} from './account-data';

const localDescribe = process.env.E2E_DB === '1' ? describe : describe.skip;

localDescribe('account data on a local Supabase stack', () => {
  it('exports valid JSON, then deletes auth, database, and storage data', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(url, 'local Supabase URL').toBeTruthy();
    expect(serviceKey, 'local service-role key').toBeTruthy();
    const admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const marker = crypto.randomUUID();
    const email = `account-export-${marker}@example.com`;
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: `Local-${marker}-pass`,
        email_confirm: true,
        user_metadata: { full_name: 'Account Export Test' },
      });
    expect(createError).toBeNull();
    const user = created.user;
    expect(user).toBeTruthy();
    if (!user) throw new Error('Local test user was not created');

    try {
      const handle = `export_${marker.replaceAll('-', '').slice(0, 12)}`;
      const { error: profileError } = await admin
        .from('profiles')
        .update({ display_name: 'Account Export Test', handle })
        .eq('id', user.id);
      expect(profileError).toBeNull();

      const roomId = crypto.randomUUID();
      const eventId = crypto.randomUUID();
      const inviteId = crypto.randomUUID();
      const { error: roomError } = await admin.from('rooms').insert({
        id: roomId,
        kind: 'group',
        title: 'Export room',
        created_by: user.id,
      });
      expect(roomError).toBeNull();

      const { error: eventError } = await admin.from('events').insert({
        id: eventId,
        host_id: user.id,
        title: 'Export plan',
        invite_mode: 'individual',
        status: 'confirmed',
        room_id: roomId,
      });
      expect(eventError).toBeNull();

      const { error: inviteError } = await admin.from('invites').insert({
        id: inviteId,
        event_id: eventId,
        invitee_id: user.id,
        position: 1,
        status: 'accepted',
      });
      expect(inviteError).toBeNull();

      const [{ error: messageError }, { error: commentError }, { error: signalError }] =
        await Promise.all([
          admin.from('messages').insert({
            room_id: roomId,
            sender_id: user.id,
            body: 'Exported room message',
          }),
          admin.from('event_comments').insert({
            event_id: eventId,
            author_id: user.id,
            body: 'Exported plan message',
          }),
          admin.from('availability_signals').insert({
            user_id: user.id,
            emoji: '☕',
            label: 'Coffee',
            expires_at: '2099-01-01T00:00:00.000Z',
          }),
        ]);
      expect(messageError).toBeNull();
      expect(commentError).toBeNull();
      expect(signalError).toBeNull();

      for (const [index, bucket] of ACCOUNT_STORAGE_BUCKETS.entries()) {
        const path =
          index % 2 === 0
            ? `${user.id}/asset-${index}.txt`
            : `${user.id}/nested/asset-${index}.txt`;
        const { error } = await admin.storage
          .from(bucket)
          .upload(path, new Blob([`owned by ${user.id}`]), {
            contentType: 'text/plain',
            upsert: false,
          });
        expect(error, bucket).toBeNull();
      }

      const exported = await buildMyDataExport(
        admin,
        user,
        '2026-09-02T12:00:00.000Z',
      );
      const json = serializeMyDataExport(exported);
      const parsed = JSON.parse(json) as typeof exported;

      expect(parsed.profile.display_name).toBe('Account Export Test');
      expect(parsed.plans).toHaveLength(1);
      expect(parsed.rsvps).toHaveLength(1);
      expect(parsed.messages.rooms).toHaveLength(1);
      expect(parsed.messages.plans).toHaveLength(1);
      expect(parsed.signals).toHaveLength(1);
      expect(json).not.toContain('share_token');
      expect(json).not.toContain('guest_token');
      expect(json).not.toContain('calendar_token');

      const deleted = await deleteAccountAndData(admin, user.id);
      expect(deleted).toEqual({
        avatars: 1,
        covers: 1,
        media: 1,
        'media-private': 1,
      });

      const { data: deletedAuth } = await admin.auth.admin.getUserById(user.id);
      expect(deletedAuth.user).toBeNull();
      const { data: deletedProfile } = await admin
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      expect(deletedProfile).toBeNull();
      for (const bucket of ACCOUNT_STORAGE_BUCKETS) {
        expect(await listUserStoragePaths(admin, bucket, user.id), bucket).toEqual([]);
      }
    } finally {
      await deleteUserStorage(admin, user.id).catch(() => undefined);
      await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
    }
  }, 30_000);
});
