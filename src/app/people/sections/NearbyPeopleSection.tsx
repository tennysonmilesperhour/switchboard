'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { sendConnectionRequest } from '@/lib/actions/connections';
import { setDiscoverable } from '@/lib/actions/profile';
import { errorFor, type ErrorCode } from '@/lib/errors';

export interface NearbyPerson {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  tagline: string | null;
  location: string | null;
  shared_interests: string[];
  mutual_friend_count: number;
}

export function NearbyPeopleSection({
  people,
  discoverable,
  geographyReady,
  requestedIds = [],
  loadError = null,
}: {
  people: NearbyPerson[];
  discoverable: boolean;
  /** The reader shares a pinned home area under Discoverability, so Nearby can count them. */
  geographyReady: boolean;
  /** Profile ids the reader already has an outgoing request to. */
  requestedIds?: string[];
  loadError?: ErrorCode | null;
}) {
  const [requested, setRequested] = useState<Set<string>>(() => new Set(requestedIds));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [discoverPending, startDiscoverTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function turnOnDiscoverability() {
    startDiscoverTransition(async () => {
      const result = await setDiscoverable(true);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not turn on discoverability.', result.code);
        return;
      }
      toast.success('You are discoverable now.');
      router.refresh();
    });
  }

  function connect(person: NearbyPerson) {
    setPendingId(person.id);
    startTransition(async () => {
      const result = await sendConnectionRequest(`@${person.handle}`);
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not send that request.', result.code);
        return;
      }
      toast.success(
        result.connected
          ? `You’re connected with ${person.display_name}.`
          : `Request sent to ${person.display_name}.`,
      );
      setRequested((current) => new Set(current).add(person.id));
      router.refresh();
    });
  }

  return (
    <section>
      <SectionHeader
        title="Near you"
        hint="People in your area who are also open to being found. You only see each other when you both opt in."
        action={
          <Link href="/discover#browse" className="text-sm font-bold text-terracotta-deep">
            See all
          </Link>
        }
      />

      {!discoverable ? (
        <Card tone="terracotta">
          <p className="text-sm font-bold text-terracotta-deep">Turn on discovery to see who is nearby.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Discovery is see-and-be-seen: you can browse people only while they can find you too.
            You can fine-tune what they see, or turn it off, anytime in Settings.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-terracotta/20 pt-3">
            <span className="text-sm font-bold text-terracotta-deep">Show me in discovery</span>
            <Switch
              checked={false}
              label="Show me in people discovery"
              disabled={discoverPending}
              onCheckedChange={turnOnDiscoverability}
            />
          </div>
        </Card>
      ) : loadError ? (
        <Card>
          <ErrorNotice
            message={errorFor(loadError).message}
            fix={errorFor(loadError).fix}
            code={loadError}
          />
        </Card>
      ) : !geographyReady ? (
        <Card tone="cream">
          <p className="text-sm text-ink-soft">
            Nearby compares your home area with people who share theirs. Turn on Geography under
            Discoverability in Settings, then pick your city from the suggestions under City or
            area in Edit profile.
          </p>
          <Link
            href="/settings"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-terracotta-deep"
          >
            Open Settings
          </Link>
        </Card>
      ) : people.length === 0 ? (
        <Card tone="cream">
          <p className="text-sm text-ink-soft">
            No one nearby has opted in yet. As more people in your area turn on discovery and
            share their area, they will show up here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {people.map((person) => {
            const profileHref = `/u/${encodeURIComponent(person.handle)}?from=/people`;
            const sent = requested.has(person.id) || requestedIds.includes(person.id);
            const busy = pending && pendingId === person.id;
            return (
              <Card key={person.id}>
                <div className="flex items-center gap-3">
                  <Link href={profileHref} aria-label={`${person.display_name}’s profile`}>
                    <Avatar
                      name={person.display_name}
                      seed={person.id}
                      src={person.avatar_url}
                      size="md"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={profileHref}
                      className="block truncate font-bold hover:text-terracotta-deep"
                    >
                      {person.display_name}
                    </Link>
                    <p className="truncate text-xs text-ink-faint">
                      @{person.handle}
                      {person.location ? ` · ${person.location}` : ''}
                    </p>
                    {person.shared_interests.length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-ink-faint">
                        Shared: {person.shared_interests.slice(0, 3).join(', ')}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={sent ? 'ghost' : undefined}
                    disabled={sent || busy}
                    onClick={() => connect(person)}
                  >
                    {sent ? 'Requested' : busy ? 'Sending' : 'Add'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
