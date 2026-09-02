import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppShell } from '@/components/shell/AppShell';
import { AroundTabs } from '@/components/around/AroundTabs';
import {
  MomentsClient,
  type MyMoment,
} from './MomentsClient';
import {
  buildMomentCandidates,
  type FoundMomentCandidate,
  type MomentCandidate,
  type MomentCandidateIntro,
} from '@/lib/moment-candidates';

export const metadata: Metadata = { title: 'Moments' };

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
  let candidates: MomentCandidate[] = [];
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

    const foundList = (found ?? []) as FoundMomentCandidate[];

    // Only the mutually-curious candidates get a gentle introduction. Fetch all
    // of their moments in one query rather than one round trip per candidate.
    const introIds = foundList
      .map((candidate) => candidate.id)
      .filter((id) => {
        const stage = stageByOther.get(id) ?? 'none';
        return stage === 'revealed' || stage === 'accepted';
      });
    const introById = new Map<string, MomentCandidateIntro>();
    const userIdByMoment = new Map<string, string>();
    if (introIds.length > 0) {
      const admin = createAdminClient();
      const { data: others } = await admin
        .from('moments')
        .select('id, user_id, headline, profile:profiles(display_name, interests)')
        .in('id', introIds);
      for (const other of others ?? []) {
        const profile = Array.isArray(other.profile) ? other.profile[0] : other.profile;
        if (profile) {
          userIdByMoment.set(other.id, other.user_id);
          introById.set(other.id, {
            name: profile.display_name,
            interests: (profile.interests ?? []).slice(0, 4),
            headline: other.headline ?? null,
          });
        }
      }
    }

    candidates = buildMomentCandidates({
      found: foundList,
      stageByMoment: stageByOther,
      introByMoment: introById,
      userIdByMoment,
    });
  }

  return (
    <AppShell title="Around">
      <div className="space-y-4">
        <AroundTabs active="moments" />
        <MomentsClient
          myMoment={myMoment}
          candidates={candidates}
          matchedRoomId={matchedRoomId}
        />
      </div>
    </AppShell>
  );
}
