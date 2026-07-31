'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { requestToJoin } from '@/lib/actions/invites';
import { formatDateTime } from '@/lib/format';

export interface OpenTableRow {
  event_id: string;
  title: string;
  starts_at: string | null;
  location_name: string | null;
  host_name: string;
  spots_left: number;
  known_via: string | null;
}

export function OpenTables({ tables }: { tables: OpenTableRow[] }) {
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (tables.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title="Open tables near your circle"
        hint="Plans from friends of friends with seats left"
      />
      <div className="space-y-2.5">
        {tables.map((table) => (
          <Card key={table.event_id} tone="gold" lifted>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold truncate">{table.title}</p>
                <p className="text-xs text-ink-soft mt-0.5">
                  {formatDateTime(table.starts_at)}
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
