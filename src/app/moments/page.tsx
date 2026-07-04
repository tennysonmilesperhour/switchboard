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
    candidates = await Promise.all(
      ((found ?? []) as Array<{ id: string; experiences: string[]; headline: string | null }>).map(
        async (candidate) => {
          const stage = (stageByOther.get(candidate.id) ?? 'none') as Candidate['stage'];
          let intro: Candidate['intro'] = null;
          if (stage === 'revealed' || stage === 'accepted') {
            // Mutual curiosity confirmed - a gentle introduction is allowed.
            const { data: otherMoment } = await admin
              .from('moments')
              .select('user_id, headline, profile:profiles(display_name, interests)')
              .eq('id', candidate.id)
              .single();
            const profile = Array.isArray(otherMoment?.profile)
              ? otherMoment?.profile[0]
              : otherMoment?.profile;
            if (profile) {
              intro = {
                name: profile.display_name,
                interests: (profile.interests ?? []).slice(0, 4),
                headline: otherMoment?.headline ?? null,
              };
            }
          }
          return {
            id: candidate.id,
            experiences: candidate.experiences,
            headline: candidate.headline,
            stage,
            intro,
          };
        },
      ),
    );
    candidates = candidates.filter((c) => c.stage !== 'passed');
  }

  return (
    <AppShell title="Moments">
      <MomentsClient myMoment={myMoment} candidates={candidates} />
    </AppShell>
  );
}
