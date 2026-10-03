'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatRelative } from '@/lib/format';
import type { ActionResult } from '@/lib/errors';
import {
  removeReportedMessage,
  removeReportedPost,
  resolveReport,
  suspendReportedAccount,
} from '@/lib/actions/moderation';
import { SUSPENSION_CHOICES, suspensionLabel } from '@/lib/suspension';
import { alreadyHandled, splitQueue } from '@/lib/moderation-queue';

export interface OpenReport {
  id: string;
  reason: string;
  created_at: string;
  reporter_id: string;
  reporter_name: string | null;
  reported_id: string;
  reported_name: string | null;
  reported_handle: string | null;
  /** 'profile' for a person, 'board_post' for one post, 'room_message' for one message. */
  target_kind: string | null;
  /** The post's or the message's id. */
  target_id: string | null;
  /** As it was when it was reported (older post reports: as it is now). */
  target_title: string | null;
  target_body: string | null;
  /** False once its author deleted it; the report keeps the words. */
  target_exists: boolean | null;
  target_removed_at: string | null;
  room_title: string | null;
  reported_suspended_until: string | null;
  /** Whether the reported message carried a photo. */
  target_had_image: boolean;
  /** A short-lived signed URL for that photo. The stored path never reaches the browser. */
  target_image_src: string | null;
}

/** The body a photo message carries when it has no caption. */
const PHOTO_BODY = '📷 Photo';

export function ModerationClient({ reports }: { reports: OpenReport[] }) {
  // Reports someone already acted on sort below the rest, still open so the
  // decision can be closed, never hidden.
  const { open, handled } = splitQueue(reports);
  return (
    <div className="space-y-4">
      {open.length > 0 && (
        <ul className="space-y-3">
          {open.map((report) => (
            <li key={report.id}>
              <ReportCard report={report} />
            </li>
          ))}
        </ul>
      )}
      {handled.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Already handled, waiting to be marked actioned
          </p>
          <ul className="space-y-3">
            {handled.map((report) => (
              <li key={report.id}>
                <ReportCard report={report} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The post or message itself, carried into the queue rather than linked. The
 * report keeps the words even after its author deletes them, and a moderator
 * deciding on the reporter's paraphrase alone is how the wrong call gets made.
 */
function ReportedContent({ report }: { report: OpenReport }) {
  const isMessage = report.target_kind === 'room_message';
  const caption = isMessage && report.target_body === PHOTO_BODY ? null : report.target_body;
  return (
    <div className="mt-1.5 rounded-card border border-line p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        {isMessage ? 'The message they flagged' : 'The post they flagged'}
        {isMessage && report.room_title ? (
          <span className="normal-case font-normal"> · in {report.room_title}</span>
        ) : null}
      </p>
      {report.target_title && (
        <p className="mt-1 text-sm font-bold break-words">{report.target_title}</p>
      )}
      {report.target_had_image ? (
        report.target_image_src ? (
          <a
            href={report.target_image_src}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 block w-fit overflow-hidden rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.target_image_src}
              alt="The photo that was reported"
              className="max-h-60 w-auto max-w-full object-contain"
              loading="lazy"
            />
          </a>
        ) : (
          <p className="mt-1 text-sm text-ink-faint">The photo couldn’t be shown.</p>
        )
      ) : null}
      {caption ? (
        <p className="mt-0.5 text-sm text-ink-soft break-words whitespace-pre-wrap">{caption}</p>
      ) : null}
      {report.target_removed_at ? (
        <p className="mt-1.5 text-xs font-bold text-rose-deep">
          Removed {formatRelative(report.target_removed_at)}. Members no longer see it.
        </p>
      ) : report.target_exists === false ? (
        <p className="mt-1.5 text-xs text-ink-faint">
          {isMessage ? 'Its sender has since deleted it.' : 'This post has since been deleted.'}
        </p>
      ) : null}
    </div>
  );
}

function ReportCard({ report }: { report: OpenReport }) {
  const [note, setNote] = useState('');
  const [choosingLength, setChoosingLength] = useState(false);
  const [days, setDays] = useState<number | null>(SUSPENSION_CHOICES[0].days);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const name = report.reported_name ?? (report.reported_handle ? `@${report.reported_handle}` : 'this member');
  const hasContent = report.target_kind === 'board_post' || report.target_kind === 'room_message';
  const canRemove = hasContent && report.target_exists === true && !report.target_removed_at;

  function run(action: () => Promise<ActionResult>, fallback: string, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? fallback, result.code);
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  }

  function resolve(status: 'resolved' | 'dismissed') {
    run(() => resolveReport(report.id, status, note), 'Could not update the report.');
  }

  async function remove() {
    const isMessage = report.target_kind === 'room_message';
    const ok = await confirm({
      title: isMessage ? 'Remove this message?' : 'Remove this post?',
      body: isMessage
        ? 'Nobody in the room will see it again. Everything it filed into the room’s tabs is removed too: photos, places, tasks, links, and notes. It stays in this report so the decision can be read later.'
        : 'Nobody on the board will see it again, and its author can’t edit it. It stays in this report so the decision can be read later.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok || !report.target_id) return;
    const targetId = report.target_id;
    run(
      () =>
        isMessage
          ? removeReportedMessage(report.id, targetId, note)
          : removeReportedPost(report.id, targetId, note),
      'Could not remove it.',
      isMessage ? 'Message removed.' : 'Post removed.',
    );
  }

  async function suspend() {
    const choice = SUSPENSION_CHOICES.find((option) => option.days === days);
    const length = days === null ? 'until a moderator lifts it' : `for ${days} days`;
    const ok = await confirm({
      title: `Suspend ${name}?`,
      body: `They’ll be signed out, and signing in will tell them the account is suspended, with the address to write to if they think it’s a mistake. It lasts ${length}; you can lift it sooner from this page.`,
      confirmLabel: 'Suspend',
      danger: true,
    });
    if (!ok || !choice) return;
    setChoosingLength(false);
    run(
      () => suspendReportedAccount(report.id, report.reported_id, choice.days, note),
      'Could not suspend the account.',
      `${name} is suspended.`,
    );
  }

  const handledLabel = alreadyHandled(report);

  return (
    <Card>
      {handledLabel ? (
        <p className="mb-1.5 text-xs font-bold text-sage-deep">{handledLabel}</p>
      ) : null}
      <p className="text-sm">
        <span className="font-bold">{report.reporter_name ?? 'Someone'}</span>
        <span className="text-ink-soft">
          {report.target_kind === 'room_message'
            ? ' reported a message from '
            : report.target_kind === 'board_post'
              ? ' reported a post by '
              : ' reported '}
        </span>
        {report.reported_handle ? (
          <Link
            href={`/u/${report.reported_handle}`}
            className="font-bold text-terracotta-deep hover:underline"
          >
            {name}
          </Link>
        ) : (
          <span className="font-bold">{name}</span>
        )}
      </p>
      {report.reported_suspended_until ? (
        <p className="mt-1 text-xs font-bold text-rose-deep">
          Suspended {suspensionLabel(report.reported_suspended_until)}
        </p>
      ) : null}
      <p className="mt-1.5 rounded-card bg-cream p-3 text-sm text-ink-soft break-words">
        “{report.reason}”
      </p>
      {hasContent && <ReportedContent report={report} />}
      <p className="mt-1.5 text-[11px] text-ink-faint">
        {formatRelative(report.created_at)}
      </p>

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional), kept with whatever you do here"
        aria-label="Moderation note"
        maxLength={500}
        className="mt-3 w-full rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
      />

      {(canRemove || !report.reported_suspended_until) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {canRemove && (
            <Button size="sm" variant="danger" className="min-h-11" disabled={pending} onClick={remove}>
              {report.target_kind === 'room_message' ? 'Remove message' : 'Remove post'}
            </Button>
          )}
          {!report.reported_suspended_until && !choosingLength && (
            <Button
              size="sm"
              variant="danger"
              className="min-h-11"
              disabled={pending}
              onClick={() => setChoosingLength(true)}
            >
              Suspend account…
            </Button>
          )}
        </div>
      )}

      {choosingLength && !report.reported_suspended_until && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-card bg-cream p-2">
          <label htmlFor={`length-${report.id}`} className="text-sm text-ink-soft">
            How long
          </label>
          <select
            id={`length-${report.id}`}
            value={days === null ? 'lifted' : String(days)}
            onChange={(event) =>
              setDays(event.target.value === 'lifted' ? null : Number(event.target.value))
            }
            className="min-h-11 rounded-card border border-line bg-paper px-2 text-sm outline-none focus:border-terracotta"
          >
            {SUSPENSION_CHOICES.map((choice) => (
              <option key={choice.label} value={choice.days === null ? 'lifted' : String(choice.days)}>
                {choice.label}
              </option>
            ))}
          </select>
          <Button size="sm" variant="danger" className="min-h-11" disabled={pending} onClick={suspend}>
            Suspend
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11"
            disabled={pending}
            onClick={() => setChoosingLength(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" className="min-h-11" disabled={pending} onClick={() => resolve('resolved')}>
          Mark actioned
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="min-h-11"
          disabled={pending}
          onClick={() => resolve('dismissed')}
        >
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
