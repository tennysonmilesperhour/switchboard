import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppShell } from '@/components/shell/AppShell';
import {
  MomentsClient,
  type Candidate,
  type MyMoment,
} from './MomentsClient';

export const metadata: Metadata = { title: 'Shared Moments' };

export default async function MomentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: momentRow } = await supabase
    .from('moments')
    .select('id, place_name, experiences, headline, available_until, status')
    .eq('user_id', user.id)
    .in('status', ['open', 'matched'])
    .gt('available_until', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const myMoment: MyMoment | null = momentRow ?? null;
  let candidates: Candidate[] = [];
  let matchedRoomId: string | null = null;

  if (myMoment && myMoment.status === 'matched') {
    // The moment matched — find the shared room so we can link to it instead of
    // stranding the user on the "nobody checked in" empty state.
    const admin = createAdminClient();
    const { data: rooms } = await admin
      .from('rooms')
      .select('id, created_at, room_members!inner(member_id)')
      .eq('kind', 'moment')
      .eq('room_members.member_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    matchedRoomId = rooms?.[0]?.id ?? null;
  }

  if (myMoment && myMoment.status === 'open') {
    // Anonymized discovery via security-definer RPC (mutual exposure required).
    const { data: found } = await supabase.rpc('find_shared_moments', {
      p_place: myMoment.place_name,
    });

    const { data: interests } = await supabase
      .from('moment_interests')
      .select('other_moment_id, stage')
      .eq('moment_id', myMoment.id);
    const stageByOther = new Map(
      (interests ?? []).map((i) => [i.other_moment_id, i.stage]),
    );

    const admin = createAdminClient();
    const foundList = (found ?? []) as Array<{
      id: string;
      experiences: string[];
      headline: string | null;
    }>;

    const userIdByMoment = new Map<string, string>();
    if (foundList.length > 0) {
      const { data: momentOwners } = await admin
        .from('moments')
        .select('id, user_id')
        .in('id', foundList.map((c) => c.id));
      for (const m of momentOwners ?? []) {
        userIdByMoment.set(m.id, m.user_id);
      }
    }

    // Only the mutually-curious candidates get a gentle introduction. Fetch all
    // of their moments in one query rather than one round trip per candidate.
    const introIds = foundList
      .map((candidate) => candidate.id)
      .filter((id) => {
        const stage = stageByOther.get(id) ?? 'none';
        return stage === 'revealed' || stage === 'accepted';
      });
    const introById = new Map<string, Candidate['intro']>();
    if (introIds.length > 0) {
      const { data: others } = await admin
        .from('moments')
        .select('id, headline, profile:profiles(display_name, interests)')
        .in('id', introIds);
      for (const other of others ?? []) {
        const profile = Array.isArray(other.profile) ? other.profile[0] : other.profile;
        if (profile) {
          introById.set(other.id, {
            name: profile.display_name,
            interests: (profile.interests ?? []).slice(0, 4),
            headline: other.headline ?? null,
          });
        }
      }
    }

    candidates = foundList
      .map((candidate) => {
        const stage = (stageByOther.get(candidate.id) ?? 'none') as Candidate['stage'];
        return {
          id: candidate.id,
          userId: userIdByMoment.get(candidate.id) ?? null,
          experiences: candidate.experiences,
          headline: candidate.headline,
          stage,
          intro:
            stage === 'revealed' || stage === 'accepted'
              ? introById.get(candidate.id) ?? null
              : null,
        };
      })
      .filter((c) => c.stage !== 'passed');
  }

  return (
    <AppShell title="Moments">
      <MomentsClient
        myMoment={myMoment}
        candidates={candidates}
        matchedRoomId={matchedRoomId}
      />
    </AppShell>
  );
}
