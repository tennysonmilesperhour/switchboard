'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { resendParentalApproval } from '@/lib/actions/parental-approval';

export interface PendingParentalApproval {
  inviteId: string;
  inviteeName: string;
  guardianEmail: string;
  guardianName: string | null;
}

interface ApprovalDraft {
  guardianEmail: string;
  guardianName: string;
}

/** Host-only recovery for guardian requests that are still pending. */
export function ParentalApprovalManager({
  eventId,
  approvals,
}: {
  eventId: string;
  approvals: PendingParentalApproval[];
}) {
  const [drafts, setDrafts] = useState<Record<string, ApprovalDraft>>(() =>
    Object.fromEntries(
      approvals.map((approval) => [
        approval.inviteId,
        {
          guardianEmail: approval.guardianEmail,
          guardianName: approval.guardianName ?? '',
        },
      ]),
    ),
  );
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  if (approvals.length === 0) return null;

  function updateDraft(inviteId: string, field: keyof ApprovalDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [inviteId]: {
        ...current[inviteId],
        [field]: value,
      },
    }));
  }

  function resend(approval: PendingParentalApproval) {
    const draft = drafts[approval.inviteId];
    if (!draft) return;
    setSendingId(approval.inviteId);
    startTransition(async () => {
      const result = await resendParentalApproval({
        eventId,
        inviteId: approval.inviteId,
        guardianEmail: draft.guardianEmail,
        guardianName: draft.guardianName || undefined,
      });
      setSendingId(null);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not resend the guardian request.', result.code);
        return;
      }
      toast.success(`Guardian request sent again for ${approval.inviteeName}.`);
      router.refresh();
    });
  }

  return (
    <section>
      <SectionHeader
        title="Guardian approvals"
        hint="Only hosts see this - correct an address and resend while approval is pending"
      />
      <ul className="space-y-2">
        {approvals.map((approval) => {
          const draft = drafts[approval.inviteId] ?? {
            guardianEmail: approval.guardianEmail,
            guardianName: approval.guardianName ?? '',
          };
          const isSending = pending && sendingId === approval.inviteId;
          return (
            <li
              key={approval.inviteId}
              className="rounded-card border border-gold/40 bg-gold-soft px-3.5 py-3"
            >
              <p className="text-sm font-bold text-ink">
                {approval.inviteeName}
                <span className="ml-2 text-xs font-semibold text-gold-deep">
                  Waiting for guardian
                </span>
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] sm:items-end">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">
                    Guardian email
                  </span>
                  <input
                    type="email"
                    value={draft.guardianEmail}
                    disabled={pending}
                    onChange={(event) =>
                      updateDraft(
                        approval.inviteId,
                        'guardianEmail',
                        event.target.value,
                      )
                    }
                    className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">
                    Name (optional)
                  </span>
                  <input
                    type="text"
                    value={draft.guardianName}
                    disabled={pending}
                    onChange={(event) =>
                      updateDraft(
                        approval.inviteId,
                        'guardianName',
                        event.target.value,
                      )
                    }
                    className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
                  />
                </label>
                <Button
                  variant="secondary"
                  disabled={pending || !draft.guardianEmail.trim()}
                  onClick={() => resend(approval)}
                >
                  {isSending ? 'Sending…' : 'Update & resend'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
