import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { paceFromChosenWindows, type WindowPace } from '@/lib/engine/windows';
import { EventWizard, type WizardFriend } from './EventWizard';

export const metadata: Metadata = { title: 'New plan' };

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{
    title?: string;
    description?: string;
    ritual?: string;
    invite?: string;
    error?: string;
    decide?: string;
  }>;
}) {
  const { title, description, ritual, invite, error, decide } = await searchParams;

  const errorMessage =
    error === 'title'
      ? 'Please give your plan a name before sending it.'
      : error === 'invitees'
        ? 'Add at least one person to invite before sending.'
        : error === 'save'
          ? 'Something went wrong saving your plan. Please try again.'
          : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    { data: connections },
    { data: householdRows },
    { data: circleRows },
    { data: operatorRows },
    { count: upcomingPlanCount },
  ] = await Promise.all([
    supabase
      .from('connections')
      .select(
        'requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name, handle, avatar_url), addressee:profiles!connections_addressee_id_fkey(id, display_name, handle, avatar_url)',
      )
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    supabase
      .from('households')
      .select('id, name, emoji, household_members(member_id)')
      .eq('owner_id', user.id),
    supabase
      .from('circles')
      .select('id, name, emoji, circle_members(member_id)')
      .eq('owner_id', user.id)
      .order('created_at'),
    supabase
      .from('operator_settings')
      .select('setting_key, enabled')
      .eq('user_id', user.id),
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('host_id', user.id)
      .gte('starts_at', now.toISOString())
      .lte('starts_at', weekAhead.toISOString())
      .in('status', ['inviting', 'deciding', 'confirmed']),
  ]);

  // Opt-in operator behaviors (default off). Both act only when the host has
  // turned them on in /you.
  const operatorSettings = new Map(
    (operatorRows ?? []).map((row) => [row.setting_key, row.enabled]),
  );
  const capacityGuard = operatorSettings.get('capacity_guard') === true;
  const tuneWindows = operatorSettings.get('tune_windows') === true;

  // "Tune my defaults": derive the host's tempo from the response windows they
  // actually chose on recent plans, and bias the wizard's suggestions to it.
  let defaultPace: WindowPace = 'standard';
  if (tuneWindows) {
    const { data: recentEvents } = await supabase
      .from('events')
      .select('id')
      .eq('host_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    const eventIds = (recentEvents ?? []).map((e) => e.id);
    if (eventIds.length > 0) {
      const { data: recentInvites } = await supabase
        .from('invites')
        .select('window_minutes')
        .in('event_id', eventIds)
        .limit(80);
      defaultPace = paceFromChosenWindows(
        (recentInvites ?? []).map((i) => i.window_minutes as number),
      );
    }
  }

  const households = (householdRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    memberIds: (row.household_members ?? []).map(
      (member: { member_id: string }) => member.member_id,
    ),
  }));

  const circles = (circleRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    memberIds: (row.circle_members ?? []).map(
      (member: { member_id: string }) => member.member_id,
    ),
  }));

  const friends: WizardFriend[] = (connections ?? []).map((connection) => {
    const other =
      connection.requester_id === user.id
        ? connection.addressee
        : connection.requester;
    const profile = Array.isArray(other) ? other[0] : other;
    return {
      id: profile.id,
      name: profile.display_name,
      handle: profile.handle ?? '',
    };
  });

  return (
    // No header back arrow: it went to /plans, which threw the whole draft
    // away. On a screen with a Back on every step, a second control wearing the
    // same word and meaning "abandon this" is the one people press by mistake.
    // Leaving deliberately is the bottom bar, which is always on screen.
    <AppShell title="New plan">
      <EventWizard
        userId={user.id}
        friends={friends}
        households={households}
        circles={circles}
        initialTitle={title ?? ''}
        initialDescription={description ?? ''}
        ritualId={ritual ?? null}
        initialInviteeId={invite ?? null}
        initialDecide={decide === '1'}
        initialError={errorMessage}
        defaultPace={defaultPace}
        upcomingPlanCount={upcomingPlanCount ?? 0}
        capacityGuard={capacityGuard}
      />
    </AppShell>
  );
}
