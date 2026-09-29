import { NextResponse } from 'next/server';
import { failure } from '@/lib/errors';
import { reportAndFail } from '@/lib/server/observability';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** Save (POST) or remove (DELETE) a web-push subscription for the signed-in user. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(failure('SB-AUTH-EXPIRED'), { status: 401 });

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.endpoint || !body.keys?.p256dh || !body.keys.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  // A browser keeps one subscription across accounts. When someone else was
  // signed in here before without signing out cleanly, the row still names
  // them, RLS hides it from this caller, and the upsert below would fail —
  // leaving their notifications on this screen and this caller's nowhere.
  // Holding the same endpoint AND both keys is proof of being that browser, so
  // only an exact match is handed over; an endpoint alone is not enough.
  if (hasAdminCredentials()) {
    await createAdminClient()
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', body.endpoint)
      .eq('p256dh', body.keys.p256dh)
      .eq('auth', body.keys.auth)
      .neq('user_id', user.id);
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
    { onConflict: 'endpoint' },
  );
  if (error) {
    return NextResponse.json(
      await reportAndFail('SB-PUSH-SAVE', 'push.subscribe', error, { userId: user.id }),
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(failure('SB-AUTH-EXPIRED'), { status: 401 });

  const { endpoint } = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
  };
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
