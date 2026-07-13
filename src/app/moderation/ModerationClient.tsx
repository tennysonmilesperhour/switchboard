'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatRelative } from '@/lib/format';
import { resolveReport } from '@/lib/actions/moderation';

export interface OpenReport {
  id: string;
  reason: string;
  created_at: string;
  reporter_id: string;
  reporter_name: string | null;
  reported_id: string;
  reported_name: string | null;
  reported_handle: string | null;
}

export function ModerationClient({ reports }: { reports: OpenReport[] }) {
  return (
    <ul className="space-y-3">
      {reports.map((report) => (
        <li key={report.id}>
          <ReportCard report={report} />
        </li>
      ))}
    </ul>
  );
}

function ReportCard({ report }: { report: OpenReport }) {
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function act(status: 'resolved' | 'dismissed') {
    startTransition(async () => {
      const result = await resolveReport(report.id, status, note);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update the report.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <p className="text-sm">
        <span className="font-bold">{report.reporter_name ?? 'Someone'}</span>
        <span className="text-ink-soft"> reported </span>
        {report.reported_handle ? (
          <Link
            href={`/u/${report.reported_handle}`}
            className="font-bold text-terracotta-deep hover:underline"
          >
            {report.reported_name ?? `@${report.reported_handle}`}
          </Link>
        ) : (
          <span className="font-bold">{report.reported_name ?? 'a member'}</span>
        )}
      </p>
      <p className="mt-1.5 rounded-card bg-cream p-3 text-sm text-ink-soft break-words">
        “{report.reason}”
      </p>
      <p className="mt-1.5 text-[11px] text-ink-faint">
        {formatRelative(report.created_at)}
      </p>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Resolution note (optional)"
        aria-label="Resolution note"
        className="mt-3 w-full rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => act('resolved')}>
          Mark actioned
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => act('dismissed')}
        >
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
