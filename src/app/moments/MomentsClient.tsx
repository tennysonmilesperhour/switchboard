'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import {
  acceptMoment,
  checkIn,
  closeMoment,
  expressCuriosity,
  passMoment,
} from '@/lib/actions/moments';
import { formatRelative } from '@/lib/format';
import { EXPERIENCE_PRESETS } from '@/lib/types';
import { useCurrentLocation } from '@/lib/client/use-current-location';

export interface MyMoment {
  id: string;
  place_name: string;
  experiences: string[];
  headline: string | null;
  available_until: string;
  status: string;
}

export interface Candidate {
  id: string;
  experiences: string[];
  headline: string | null;
  stage: 'none' | 'curious' | 'revealed' | 'accepted' | 'passed';
  intro: { name: string; interests: string[]; headline: string | null } | null;
}

export function MomentsClient({
  myMoment,
  candidates,
  matchedRoomId,
}: {
  myMoment: MyMoment | null;
  candidates: Candidate[];
  matchedRoomId?: string | null;
}) {
  const [place, setPlace] = useState('');
  const [experiences, setExperiences] = useState<string[]>([]);
  const [headline, setHeadline] = useState('');
  const [hours, setHours] = useState(2);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const location = useCurrentLocation();
  const router = useRouter();
  const toast = useToast();

  function toggleExperience(label: string) {
    setExperiences((current) =>
      current.includes(label)
        ? current.filter((e) => e !== label)
        : [...current, label],
    );
  }

  if (!myMoment) {
    return (
      <div className="space-y-6">
        <Link
          href="/zones"
          className="block rounded-card border border-dashed border-line bg-cream px-4 py-3 text-sm text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors"
        >
          🎪 At a conference, cruise, or festival? Check in through its{' '}
          <strong>Serendipity Zone</strong> instead.
        </Link>
        <Link
          href="/map"
          className="block rounded-card border border-dashed border-line bg-cream px-4 py-3 text-sm text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors"
        >
          🧭 Want to be seen live? Turn on location on the <strong>Map</strong> to
          appear to others sharing nearby, right now.
        </Link>
        <p className="text-sm text-ink-soft leading-relaxed -mt-1">
          Waiting somewhere - an airport, a coffee shop, soccer practice?
          Check in and Switchboard will quietly look for someone nearby who’d
          enjoy the same kind of moment. Nobody is revealed unless you’re{' '}
          <strong>both</strong> curious.
        </p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="place" className="text-sm font-bold">Where are you?</label>
            <input
              id="place"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Denver Airport Gate B27, Café Luna, Miller Park…"
              className="w-full rounded-card border border-line bg-card px-4 py-3 outline-none focus:border-terracotta"
            />
            <p className="text-xs text-ink-faint">
              People at the same place see the same name - be specific enough to match.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => void location.request()}
                disabled={location.status === 'locating'}
                aria-pressed={location.status === 'ready'}
                className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${
                  location.status === 'ready'
                    ? 'border-sage bg-sage-soft text-sage-deep'
                    : 'border-line bg-card text-ink-soft hover:border-terracotta hover:text-terracotta-deep'
                }`}
              >
                📍 {location.status === 'locating'
                  ? 'Locating…'
                  : location.status === 'ready'
                    ? 'Pinned to the map'
                    : 'Use my current location'}
              </button>
              {location.status === 'ready' && (
                <button
                  type="button"
                  onClick={location.clear}
                  className="text-xs font-semibold text-ink-faint hover:text-ink-soft"
                >
                  Clear
                </button>
              )}
            </div>
            {location.status === 'ready' && (
              <p className="text-xs text-sage-deep">
                Your check-in will show up on the Map. Others still only see you
                after mutual curiosity.
              </p>
            )}
            {location.error && <p className="text-xs text-ink-faint">{location.error}</p>}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-bold">What would you enjoy sharing?</p>
            <div className="flex flex-wrap gap-2">
              {EXPERIENCE_PRESETS.map((experience) => (
                <Chip
                  key={experience.label}
                  emoji={experience.emoji}
                  selected={experiences.includes(experience.label)}
                  onClick={() => toggleExperience(experience.label)}
                >
                  {experience.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="headline" className="text-sm font-bold">
              A line about you <span className="text-ink-faint font-normal">(shown only after mutual curiosity)</span>
            </label>
            <input
              id="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={90}
              placeholder="“My favorite trips begin with unexpected conversations.”"
              className="w-full rounded-card border border-line bg-card px-4 py-3 text-sm outline-none focus:border-terracotta"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="hours" className="text-sm font-bold">
              I’m here for about {hours} {hours === 1 ? 'hour' : 'hours'}
            </label>
            <input
              id="hours"
              type="range"
              min={1}
              max={8}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full accent-terracotta"
            />
          </div>

          {error && <p role="alert" className="text-sm text-rose-deep">{error}</p>}
          <Button
            size="lg"
            className="w-full"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await checkIn(
                  place,
                  experiences,
                  headline,
                  hours,
                  null,
                  location.point,
                );
                if (!result.ok) setError(result.error ?? 'Something went wrong');
                else router.refresh();
              })
            }
          >
            {pending ? 'Checking in…' : 'Check in ✨'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card tone="gold" className="animate-rise">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-faint font-bold">
              Checked in
            </p>
            <p className="font-display text-xl mt-0.5 flex items-center gap-1.5">
              <Icon name="mapPin" size={20} className="text-terracotta" />
              {myMoment.place_name}
            </p>
            <p className="text-xs text-ink-soft mt-1">
              {myMoment.experiences.join(' · ')} · ends{' '}
              {formatRelative(myMoment.available_until)}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="whitespace-nowrap"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await closeMoment();
                  router.refresh();
                } catch {
                  toast.error('Could not check out. Try again.');
                }
              })
            }
          >
            Check out
          </Button>
        </div>
      </Card>

      {myMoment.status === 'matched' ? (
        <section>
          <SectionHeader title="It’s a match" hint="You both said yes" />
          <Card tone="gold" lifted className="animate-rise">
            <p className="font-display text-lg">✨ You’re sharing this moment</p>
            <p className="text-sm text-ink-soft mt-1 leading-relaxed">
              You both chose to connect. A private conversation is open - say hi
              and pick a spot.
            </p>
            {matchedRoomId ? (
              <Link href={`/rooms/${matchedRoomId}`} className="mt-4 block">
                <Button className="w-full">Open the conversation</Button>
              </Link>
            ) : (
              <Link href="/rooms" className="mt-4 block">
                <Button variant="secondary" className="w-full">
                  Go to your rooms
                </Button>
              </Link>
            )}
          </Card>
        </section>
      ) : (
      <section>
        <SectionHeader
          title="Sharing this moment"
          hint={
            candidates.length === 0
              ? 'Serendipity is watching quietly - check back in a bit'
              : 'Same place, same time, similar interests'
          }
        />
        {candidates.length === 0 ? (
          <Card tone="cream">
            <p className="text-sm text-ink-soft leading-relaxed">
              Nobody else has checked in here yet. That’s the thing about
              serendipity - it can’t be rushed. You’ll get a gentle nudge if a
              match appears. ✨
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {candidates.map((candidate) => (
              <Card key={candidate.id} lifted className="animate-rise">
                {candidate.intro ? (
                  <>
                    <p className="text-xs uppercase tracking-wide text-terracotta-deep font-bold">
                      ✨ Mutual curiosity
                    </p>
                    <p className="font-display text-xl mt-1">{candidate.intro.name}</p>
                    {candidate.intro.headline && (
                      <p className="text-sm text-ink-soft mt-1">
                        “{candidate.intro.headline}”
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {candidate.intro.interests.map((interest) => (
                        <span
                          key={interest}
                          className="rounded-pill bg-terracotta-soft px-2.5 py-1 text-xs font-semibold text-terracotta-deep"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                    {candidate.stage === 'accepted' ? (
                      <p className="text-sm text-sage-deep mt-3">
                        You said yes - waiting for them. 🤞
                      </p>
                    ) : (
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="accept"
                          size="sm"
                          className="flex-1"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await acceptMoment(myMoment.id, candidate.id);
                              if (!result.ok) {
                                toast.error(result.error ?? 'Could not respond. Try again.', result.code);
                                return;
                              }
                              if (result.stage === 'matched' && result.roomId) {
                                router.push(`/rooms/${result.roomId}`);
                              } else {
                                router.refresh();
                              }
                            })
                          }
                        >
                          🤝 I’d love to share this moment
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await passMoment(myMoment.id, candidate.id);
                                router.refresh();
                              } catch {
                                toast.error('Could not pass. Try again.');
                              }
                            })
                          }
                        >
                          Pass
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold">
                      Someone here is open to:
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {candidate.experiences.map((experience) => (
                        <span
                          key={experience}
                          className="rounded-pill bg-cream px-2.5 py-1 text-xs text-ink-soft"
                        >
                          {experience}
                        </span>
                      ))}
                    </div>
                    {candidate.headline && (
                      <p className="text-sm text-ink-soft mt-2">
                        “{candidate.headline}”
                      </p>
                    )}
                    {candidate.stage === 'curious' ? (
                      <p className="text-xs text-ink-faint mt-3">
                        You’re curious - they haven’t decided yet. Nothing is
                        revealed until it’s mutual.
                      </p>
                    ) : (
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await expressCuriosity(myMoment.id, candidate.id);
                              if (!result.ok) {
                                toast.error(result.error ?? 'Could not respond. Try again.', result.code);
                                return;
                              }
                              router.refresh();
                            })
                          }
                        >
                          I’d like to learn more
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await passMoment(myMoment.id, candidate.id);
                                router.refresh();
                              } catch {
                                toast.error('Could not pass. Try again.');
                              }
                            })
                          }
                        >
                          Not today
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
      )}

      <p className="text-xs text-ink-faint leading-relaxed">
        Three moments of consent: you’re open to the experience → you’d like to
        learn more → 🤝 you’d love to share it. Identity unfolds gradually, and
        only ever mutually.
      </p>
    </div>
  );
}
