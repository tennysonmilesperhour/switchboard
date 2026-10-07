import 'server-only';

import { randomUUID } from 'node:crypto';
import { normalizeExternalEvent, type EventSource } from '@/lib/external-events';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchSourceEvents } from './external-event-sources';
import type { Json } from '@/lib/supabase/database.types';

export interface CollectionSummary {
  sources: number; succeeded: number; failed: number; backedOff: number;
  found: number; accepted: number; rejected: number; stale: number; catalogued: number;
  submissionsAccepted: number; submissionsNeedsReview: number;
}

function message(error: unknown) { return error instanceof Error ? error.message : 'Unknown collection error'; }
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function sourceIsBackedOff(source: EventSource & { consecutive_failures: number; last_started_at: string | null }, now = Date.now()) {
  if (!source.last_started_at || source.consecutive_failures < 2) return false;
  const delayMs = Math.min(24, 2 ** Math.min(source.consecutive_failures - 2, 5)) * 60 * 60 * 1000;
  return now - Date.parse(source.last_started_at) < delayMs;
}

async function fetchWithRetry(source: EventSource) {
  let error: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetchSourceEvents(source); }
    catch (caught) { error = caught; if (attempt < 2) await pause(250 * 2 ** attempt); }
  }
  throw error;
}

export async function collectExternalEvents(): Promise<CollectionSummary> {
  const admin = createAdminClient();
  const result = await admin.from('event_sources')
    .select('id,name,url,format,city,time_zone,trust_score,stale_after_hours,consecutive_failures,last_started_at')
    .eq('enabled', true)
    .order('trust_score', { ascending: true });
  if (result.error) throw new Error(`Could not load event sources: ${result.error.message}`);
  const sources = (result.data ?? []) as (EventSource & { consecutive_failures: number; last_started_at: string | null })[];
  const summary: CollectionSummary = {
    sources: sources.length, succeeded: 0, failed: 0, backedOff: 0,
    found: 0, accepted: 0, rejected: 0, stale: 0, catalogued: 0,
    submissionsAccepted: 0, submissionsNeedsReview: 0,
  };

  async function collectSource(source: typeof sources[number]) {
    if (sourceIsBackedOff(source)) { summary.backedOff += 1; return; }
    const started = new Date();
    const runId = randomUUID();
    await admin.from('event_sources').update({ last_started_at: started.toISOString(), updated_at: started.toISOString() }).eq('id', source.id);
    try {
      const found = await fetchWithRetry(source);
      summary.found += found.length;
      for (const input of found) {
        const normalized = normalizeExternalEvent(source, input, runId);
        if (!normalized) { summary.rejected += 1; continue; }
        const eventWrite = await admin.from('external_events')
          .upsert(normalized.canonical, { onConflict: 'dedupe_key' })
          .select('id').single();
        if (eventWrite.error || !eventWrite.data) throw new Error(eventWrite.error?.message ?? 'Event upsert returned no row');
        const listingWrite = await admin.from('external_event_listings').upsert({
          ...normalized.listing, payload: normalized.listing.payload as Json, event_id: eventWrite.data.id,
        }, { onConflict: 'source_id,source_event_id' });
        if (listingWrite.error) throw new Error(listingWrite.error.message);
        summary.accepted += 1;
      }

      // Only age missing records after a successful complete fetch. A transient
      // source failure must never erase an otherwise trustworthy event.
      const staleBefore = new Date(started.getTime() - source.stale_after_hours * 60 * 60 * 1000).toISOString();
      const staleWrite = await admin.from('external_event_listings')
        .update({ source_status: 'stale' })
        .eq('source_id', source.id).eq('source_status', 'active')
        .neq('last_seen_run', runId).lt('last_seen_at', staleBefore)
        .select('id');
      if (staleWrite.error) throw new Error(staleWrite.error.message);
      summary.stale += staleWrite.data?.length ?? 0;
      const now = new Date().toISOString();
      const health = await admin.from('event_sources').update({
        last_succeeded_at: now, last_error: null, consecutive_failures: 0,
        last_event_count: found.length, updated_at: now,
      }).eq('id', source.id);
      if (health.error) throw new Error(health.error.message);
      summary.succeeded += 1;
    } catch (error) {
      summary.failed += 1;
      await admin.from('event_sources').update({
        last_error: message(error).slice(0, 500),
        consecutive_failures: source.consecutive_failures + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', source.id);
    }
  }

  // Bounded concurrency keeps one slow publisher from consuming the entire
  // cron window without opening an unbounded number of outbound connections.
  for (let index = 0; index < sources.length; index += 3) {
    await Promise.all(sources.slice(index, index + 3).map(collectSource));
  }

  // Submitted public links use the same guarded fetch and parser, then enter
  // the catalogue at a lower confidence until a publisher claims the source.
  const submissions = await admin.from('external_event_submissions')
    .select('id,url').eq('status', 'pending').order('created_at').limit(25);
  if (submissions.error) throw new Error(`Could not load event submissions: ${submissions.error.message}`);
  for (const submission of submissions.data ?? []) {
    const source: EventSource = {
      id: 'community-submissions', name: 'Community submission', url: submission.url,
      format: 'html', city: 'Salt Lake City', time_zone: 'America/Denver', trust_score: 60, stale_after_hours: 72,
    };
    try {
      const found = await fetchWithRetry(source);
      const normalized = found.map((input) => normalizeExternalEvent(source, input)).filter((row) => row !== null);
      if (normalized.length === 0) throw new Error('No structured event was found at that link');
      for (const row of normalized) {
        const existing = await admin.from('external_events').select('id').eq('dedupe_key', row.canonical.dedupe_key).maybeSingle();
        if (existing.error) throw new Error(existing.error.message);
        const eventWrite = existing.data
          ? { data: existing.data, error: null }
          : await admin.from('external_events').insert(row.canonical).select('id').single();
        if (eventWrite.error || !eventWrite.data) throw new Error(eventWrite.error?.message ?? 'Event insert returned no row');
        const listingWrite = await admin.from('external_event_listings').upsert({ ...row.listing, payload: row.listing.payload as Json, event_id: eventWrite.data.id }, { onConflict: 'source_id,source_event_id' });
        if (listingWrite.error) throw new Error(listingWrite.error.message);
      }
      await admin.from('external_event_submissions').update({ status: 'accepted', reviewed_at: new Date().toISOString(), review_note: null }).eq('id', submission.id);
      summary.submissionsAccepted += 1;
    } catch (error) {
      await admin.from('external_event_submissions').update({ status: 'needs_review', review_note: message(error).slice(0, 500) }).eq('id', submission.id);
      summary.submissionsNeedsReview += 1;
    }
  }
  const refresh = await admin.rpc('refresh_external_event_catalog');
  if (refresh.error) throw new Error(`Could not refresh event catalogue: ${refresh.error.message}`);
  summary.catalogued = refresh.data ?? 0;
  return summary;
}
