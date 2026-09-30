import type { Metadata } from 'next';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { errorFor } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadGuardianPlanFacts } from '@/lib/server/guardian-facts';
import { ApproveClient } from './ApproveClient';

export const metadata: Metadata = {
  title: 'Guardian Approval | Switchboard',
};

/**
 * The guardian's page. The token is the whole authorization (docs/SECURITY.md,
 * "Guardian approval"): the reader usually has no account, and must not need
 * one to answer.
 *
 * Decision D2 fixes what they see — the plan's title, when and where, who is
 * hosting, and who said yes — the same facts the email carries, from the same
 * loader. It used to show only the title, so a parent was asked to approve
 * "someone" for a plan with no time or place.
 */
export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: approval } = await admin
    .from('parental_approvals')
    .select('id, status, guardian_name, event_id, invite_id')
    .eq('token', token)
    .maybeSingle();

  if (!approval) {
    const { fix } = errorFor('SB-LINK-UNKNOWN');
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ErrorNotice message="This approval link is not valid." fix={fix} code="SB-LINK-UNKNOWN" />
      </div>
    );
  }

  if (approval.status !== 'pending') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-bold">This has already been {approval.status}.</p>
      </div>
    );
  }

  const facts = await loadGuardianPlanFacts(admin, approval.event_id, approval.invite_id);
  if (!facts) {
    const gone = errorFor('SB-RSVP-GONE');
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ErrorNotice
          message="The plan or the RSVP this approval was for is gone."
          fix={gone.fix}
          code="SB-RSVP-GONE"
        />
      </div>
    );
  }

  return (
    <ApproveClient token={token} facts={facts} guardianName={approval.guardian_name} />
  );
}
