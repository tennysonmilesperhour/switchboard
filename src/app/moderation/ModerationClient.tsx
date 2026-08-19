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
  /** 'profile' for a report about a person, 'board_post' for one post. */
  target_kind: string | null;
  target_id: string | null;
  target_title: string | null;
  target_body: string | null;
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
        toast.error(result.error ?? 'Could not update the report.', result.code);
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
      {report.target_kind === 'board_post' && (
        /*
         * The post's own text, carried into the queue by `list_open_reports`
         * rather than linked. A post taken down between the report and this
         * screen would otherwise leave nothing to judge — and a moderator
         * deciding on the reporter's paraphrase alone is how the wrong call
         * gets made.
         */
        <div className="mt-1.5 rounded-card border border-line p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            The post they flagged
          </p>
          {report.target_title && (
            <p className="mt-1 text-sm font-bold break-words">{report.target_title}</p>
          )}
          {report.target_body ? (
            <p className="mt-0.5 text-sm text-ink-soft break-words whitespace-pre-wrap">
              {report.target_body}
            </p>
          ) : null}
          {!report.target_title && !report.target_body && (
            <p className="mt-1 text-sm text-ink-faint">
              This post has since been deleted.
            </p>
          )}
        </div>
      )}
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
