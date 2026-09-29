'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { useToast } from '@/components/ui/Toast';
import { requestToJoin } from '@/lib/actions/open-table';
import { errorFor, type ErrorCode } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';

export interface OpenTableRow {
  event_id: string;
  title: string;
  starts_at: string | null;
  /** IANA zone the plan was created in; passed to `formatDateTime` so the
   * server (UTC) and client (viewer's zone) render the same text and don't
   * trip a hydration mismatch (React #418). Supplied by `list_open_tables()`. */
  time_zone: string | null;
  location_name: string | null;
  host_name: string;
  spots_left: number;
  known_via: string | null;
}

/** A plan the reader asked to join that the host has not answered yet. */
export interface PendingJoinRequest {
  inviteId: string;
  eventId: string;
  title: string;
  startsAt: string | null;
  timeZone: string | null;
}

export function OpenTables({
  tables,
  requests = [],
  requestsError = null,
}: {
  tables: OpenTableRow[];
  /**
   * The reader's own requests still waiting on a host. A table they asked to
   * join drops out of `list_open_tables` the moment they ask, so without this
   * the request vanished from the one place they made it.
   */
  requests?: PendingJoinRequest[];
  requestsError?: ErrorCode | null;
}) {
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (tables.length === 0 && requests.length === 0 && !requestsError) return null;

  return (
    <section>
      <SectionHeader
        title="Open tables near your circle"
        hint="Plans from friends of friends with seats left"
      />
      {requestsError && (
        <ErrorNotice
          className="mb-3"
          message="Your requests to join didn’t load."
          fix={errorFor(requestsError).fix}
          code={requestsError}
        />
      )}
      {requests.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-plate text-plate-inset text-xs font-bold uppercase tracking-wide text-ink-soft">
            Waiting on the host
          </p>
          {requests.map((request) => (
            <Card key={request.inviteId}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">{request.title}</p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {formatDateTime(request.startsAt, request.timeZone)} · You asked to join. You’ll
                    hear back either way.
                  </p>
                </div>
                <Link
                  href={`/events/${request.eventId}`}
                  className="shrink-0 rounded-pill px-2.5 py-1.5 text-xs font-bold text-terracotta-deep hover:bg-terracotta-soft"
                >
                  See the plan
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className="space-y-2.5">
        {tables.map((table) => (
          <Card key={table.event_id} tone="gold" lifted>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold truncate">{table.title}</p>
                <p className="text-xs text-ink-soft mt-0.5">
                  {formatDateTime(table.starts_at, table.time_zone)}
                  {table.location_name ? ` · ${table.location_name}` : ''}
                </p>
                <p className="text-xs text-ink-faint mt-0.5">
                  Hosted by {table.host_name}
                  {table.known_via ? ` · you know ${table.known_via}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-terracotta-deep mb-1.5">
                  {table.spots_left} {table.spots_left === 1 ? 'seat' : 'seats'}
                </p>
                {requested.has(table.event_id) ? (
                  <span className="text-xs text-sage-deep font-bold">
                    Asked ✓
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await requestToJoin(table.event_id);
                        if (result.ok) {
                          setRequested((current) =>
                            new Set(current).add(table.event_id),
                          );
                          toast.success('Asked to join. The host will get back to you.');
                        } else {
                          toast.error(result.error ?? 'Could not send your request.', result.code);
                        }
                      })
                    }
                  >
                    Ask to join
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-ink-faint mt-2">
        The host approves every request, so asking is never presumptuous.
      </p>
    </section>
  );
}
