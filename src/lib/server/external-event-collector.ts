import 'server-only';

import { normalizeExternalEvent, type EventSource } from '@/lib/external-events';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchSourceEvents } from './external-event-sources';

export interface CollectionSummary { sources: number; succeeded: number; failed: number; found: number; upserted: number }

export async function collectExternalEvents(): Promise<CollectionSummary> {
  // These tables are introduced by the accompanying migration; the cast can be
  // removed after regenerating database.types.ts against the migrated project.
  const admin = createAdminClient() as unknown as {
    from(table: string): {
      select(columns: string): { eq(column: string, value: unknown): Promise<{ data: unknown[] | null; error: { message: string } | null }> };
      upsert(values: unknown[], options: { onConflict: string }): Promise<{ error: { message: string } | null }>;
      update(values: unknown): { eq(column: string, value: unknown): Promise<{ error: { message: string } | null }> };
    };
  };
  const result = await admin.from('event_sources').select('id,name,url,format,city').eq('enabled', true);
  if (result.error) throw new Error(`Could not load event sources: ${result.error.message}`);
  const sources = (result.data ?? []) as EventSource[];
  const summary: CollectionSummary = { sources: sources.length, succeeded: 0, failed: 0, found: 0, upserted: 0 };

  for (const source of sources) {
    const started = new Date().toISOString();
    await admin.from('event_sources').update({ last_started_at: started, updated_at: started }).eq('id', source.id);
    try {
      const found = await fetchSourceEvents(source);
      const rows = found.map((event) => normalizeExternalEvent(source, event)).filter((event) => event !== null);
      summary.found += found.length;
      if (rows.length) {
        const write = await admin.from('external_events').upsert(rows, { onConflict: 'dedupe_key' });
        if (write.error) throw new Error(write.error.message);
      }
      const now = new Date().toISOString();
      await admin.from('event_sources').update({ last_succeeded_at: now, last_error: null, updated_at: now }).eq('id', source.id);
      summary.succeeded += 1;
      summary.upserted += rows.length;
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : 'Unknown collection error';
      await admin.from('event_sources').update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', source.id);
    }
  }
  return summary;
}
