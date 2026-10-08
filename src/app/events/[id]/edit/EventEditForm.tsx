'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { hasInviteDetails } from '@/lib/event-details';
import { capacityProblem } from '@/lib/plan-capacity';
import { updateEventDetails } from '@/lib/actions/events';
import { resolveTimeZone } from '@/lib/client/time-zone';
import type { SwitchboardEvent } from '@/lib/types';
import { errorRef, type ErrorCode } from '@/lib/errors';
import { isEventTheme, normalizeNewQuestions, planExtrasProblem } from '@/lib/plan-extras';
import { recurrenceLabel } from '@/lib/engine/recurrence';
import { PlanExtrasFields, type PlanExtrasValue } from './PlanExtrasFields';

const FIELD =
  'w-full rounded-card border border-line bg-card px-4 py-3 text-[15px] text-ink outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft';
const FIELD_LABEL = 'text-sm font-semibold text-ink';

/** ISO timestamp → value for a `datetime-local` input, in the viewer's zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `datetime-local` value → ISO timestamp (interpreted in the viewer's zone). */
function toIso(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function EventEditForm({
  event,
  userId,
  existingQuestions,
}: {
  event: SwitchboardEvent;
  userId: string;
  /** Prompts already asked, in order. Listed, never edited (D18). */
  existingQuestions: string[];
}) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? '');
  // Converting an ISO timestamp to a datetime-local value depends on the
  // viewer's timezone, so the SSR pass (server zone) and the client render can
  // differ. suppressHydrationWarning on these inputs lets React keep the
  // client-timezone value without a mismatch warning.
  const [startsAt, setStartsAt] = useState(() => toLocalInput(event.starts_at));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(event.ends_at));
  const [locationName, setLocationName] = useState(event.location_name ?? '');
  const [locationAddress, setLocationAddress] = useState(event.location_address ?? '');
  const [capacity, setCapacity] = useState(event.capacity ? String(event.capacity) : '');
  const [wishlistUrl, setWishlistUrl] = useState(event.wishlist_url ?? '');
  const [extras, setExtras] = useState<PlanExtrasValue>(() => ({
    coverUrl: event.cover_url ?? '',
    theme: isEventTheme(event.theme) ? event.theme : 'default',
    remindersEnabled: event.reminders_enabled,
    openTable: event.open_table,
    broadcastNearby: event.broadcast_nearby,
    newQuestions: [],
  }));
  const [error, setError] = useState<string | null>(null);
  // Set only by a refused save; the field checks above it carry none.
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorCode(null);
    if (!title.trim()) {
      setError('Give your plan a name.');
      return;
    }
    // Mirrors the server's floor so the message lands on the field rather than
    // after a round trip. The server check is the real one.
    if (!hasInviteDetails(locationName, description)) {
      setError('Add a location or a short detail so invitees know what they’re answering.');
      return;
    }
    // The server refuses both of these too; checking here puts the sentence on
    // the form instead of after a round trip.
    const start = toIso(startsAt);
    const end = toIso(endsAt);
    if (start && end && new Date(end) <= new Date(start)) {
      setError('End time should be after the start time.');
      return;
    }
    const capacityError = capacityProblem(capacity);
    if (capacityError) {
      setError(capacityError);
      return;
    }
    const newQuestions = normalizeNewQuestions(extras.newQuestions);
    const extrasError = planExtrasProblem({
      openTable: extras.openTable,
      capacity: capacity ? Number(capacity) : null,
      theme: extras.theme,
      existingQuestions: existingQuestions.length,
      newQuestions: newQuestions.length,
    });
    if (extrasError) {
      setError(extrasError);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateEventDetails(event.id, {
        title,
        description: description.trim() || null,
        locationName: locationName.trim() || null,
        locationAddress: locationAddress.trim() || null,
        startsAt: toIso(startsAt),
        endsAt: toIso(endsAt),
        timeZone: resolveTimeZone(),
        capacity: capacity ? Number(capacity) : null,
        wishlistUrl: wishlistUrl.trim() || null,
        extras: {
          coverUrl: extras.coverUrl.trim() || null,
          theme: extras.theme,
          remindersEnabled: extras.remindersEnabled,
          openTable: extras.openTable,
          broadcastNearby: extras.openTable && extras.broadcastNearby,
          newQuestions,
        },
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not save your changes.');
        setErrorCode(result.code ?? null);
        return;
      }
      toast.success('Plan updated.');
      router.push(`/events/${event.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="title" className={FIELD_LABEL}>Title</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={FIELD}
          maxLength={120}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 min-w-0">
          <label htmlFor="startsAt" className={FIELD_LABEL}>Starts</label>
          <input
            id="startsAt"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={`${FIELD} min-w-0`}
            suppressHydrationWarning
          />
        </div>
        <div className="space-y-1.5 min-w-0">
          <label htmlFor="endsAt" className={FIELD_LABEL}>Ends</label>
          <input
            id="endsAt"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={`${FIELD} min-w-0`}
            suppressHydrationWarning
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="locationName" className={FIELD_LABEL}>Place</label>
        <input
          id="locationName"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          className={FIELD}
          placeholder="Where it's happening"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="locationAddress" className={FIELD_LABEL}>Address</label>
        <input
          id="locationAddress"
          value={locationAddress}
          onChange={(e) => setLocationAddress(e.target.value)}
          className={FIELD}
          placeholder="Optional street address"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className={FIELD_LABEL}>Description</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${FIELD} min-h-24 resize-y`}
          maxLength={2000}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="capacity" className={FIELD_LABEL}>Capacity</label>
          <input
            id="capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={FIELD}
            placeholder="No limit"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="wishlistUrl" className={FIELD_LABEL}>Wishlist link</label>
          <input
            id="wishlistUrl"
            value={wishlistUrl}
            onChange={(e) => setWishlistUrl(e.target.value)}
            className={FIELD}
            placeholder="Optional"
          />
        </div>
      </div>

      <PlanExtrasFields
        userId={userId}
        value={extras}
        onChange={setExtras}
        existingQuestions={existingQuestions}
        hasCapacity={Boolean(capacity)}
        fixedRules={[
          ...(event.parental_approval ? ['parental approval for every yes'] : []),
          ...(recurrenceLabel(event.recurrence, event.recurrence_interval_days)
            ? [recurrenceLabel(event.recurrence, event.recurrence_interval_days)!.toLowerCase()]
            : []),
        ]}
      />

      {error && (
        <p className="text-plate text-plate-inset text-sm text-rose-deep" role="alert">
          {error}
          {errorCode && (
            <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              {errorRef(errorCode)}
            </span>
          )}
        </p>
      )}

      <p className="text-plate text-plate-inset text-xs text-ink-faint">
        Changing the time or place lets everyone who’s already said yes know.
      </p>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="lg" className="flex-1" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          disabled={pending}
          onClick={() => router.push(`/events/${event.id}`)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
