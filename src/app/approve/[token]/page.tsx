import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApproveClient } from './ApproveClient';

export const metadata: Metadata = {
  title: 'Guardian Approval | Switchboard',
};

export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: approval } = await admin
    .from('parental_approvals')
    .select('id, status, guardian_name, event_id')
    .eq('token', token)
    .maybeSingle();

  if (!approval) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-bold">This link isn&rsquo;t valid</p>
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

  const { data: event } = await admin
    .from('events')
    .select('title')
    .eq('id', approval.event_id)
    .maybeSingle();

  return (
    <ApproveClient
      token={token}
      eventTitle={event?.title ?? 'this plan'}
      guardianName={approval.guardian_name}
    />
  );
}
