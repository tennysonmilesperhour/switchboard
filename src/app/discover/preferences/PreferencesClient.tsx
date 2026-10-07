'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import {
  clearMood,
  resetDiscoveryHistory,
  saveSelf,
  saveWeights,
  setMood,
  setMoodIncludes,
} from '@/lib/actions/discovery-prefs';
import {
  AUDIENCES,
  AUDIENCE_INFO,
  GENDERS,
  GENDER_LABEL,
  MOODS,
  SELVES,
  SELF_INFO,
  clampWeight,
  describeMoodRemaining,
  effectiveBar,
  laneIsPausedByMood,
  moodInfo,
  moodIsActive,
  splitByBar,
  suggestWeightChanges,
  weightLabel,
  type Audience,
  type Gender,
  type Self,
} from '@/lib/discovery-lanes';
import type { DiscoveryPrefs, LaneState, PrefItem } from '@/lib/server/discovery-prefs';

const inputCls =
  'w-full rounded-card border border-line bg-card px-4 py-3 text-sm outline-none focus:border-terracotta transition-colors';

/** The four stops the bar can sit at. They match the database's strength tiers. */
const BAR_STOPS = [
  { value: 0, label: 'Anyone', hint: 'Show me people even with nothing obvious in common.' },
  { value: 30, label: 'Something in common', hint: 'At least one shared interest or place.' },
  { value: 65, label: 'Shared favourites', hint: 'Something we both rate well.' },
  { value: 90, label: 'Only top favourites', hint: 'Something we both love.' },
] as const;

function nearestStop(bar: number): number {
  return BAR_STOPS.reduce((best, stop) =>
    Math.abs(stop.value - bar) < Math.abs(best.value - bar) ? stop : best,
  ).value;
}

export function PreferencesClient({
  prefs,
  initialSelf,
}: {
  prefs: DiscoveryPrefs;
  initialSelf: Self;
}) {
  const [self, setSelf] = useState<Self>(initialSelf);
  const [lanes, setLanes] = useState<Record<Self, LaneState>>(prefs.lanes);
  const [edits, setEdits] = useState<Record<Self, Record<string, number>>>({
    friends: {},
    dating: {},
    networking: {},
  });
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const lane = lanes[self];
  const mood = prefs.mood;
  const active = moodIsActive(mood);
  const paused = laneIsPausedByMood(self, mood);
  const barNow = effectiveBar(lane.bar, mood);

  function patchLane(patch: Partial<LaneState>) {
    setLanes((current) => ({ ...current, [self]: { ...current[self], ...patch } }));
  }

  function weightOf(item: PrefItem): number {
    return edits[self][item.key] ?? prefs.weights[self][item.key] ?? item.defaultWeight;
  }

  function run(
    work: () => Promise<{ ok: boolean; error?: string; code?: import('@/lib/errors').ErrorCode }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save that.', result.code);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function saveLane() {
    run(
      () =>
        saveSelf(self, {
          enabled: lane.enabled,
          bar: lane.bar,
          visible_to: lane.visible_to,
          seeking: lane.seeking,
          blurb: lane.blurb,
          identifies_as: lane.identifies_as,
          interested_in: lane.interested_in,
        }),
      `${SELF_INFO[self].label} saved.`,
    );
  }

  const changed = Object.entries(edits[self]).filter(
    ([key, value]) => value !== (prefs.weights[self][key] ?? prefs.items.find((i) => i.key === key)?.defaultWeight),
  );

  function saveItemWeights() {
    run(async () => {
      const result = await saveWeights(
        self,
        changed.map(([item, weight]) => ({ item, weight })),
      );
      if (result.ok) setEdits((current) => ({ ...current, [self]: {} }));
      return result;
    }, 'Ratings saved.');
  }

  const weighted = prefs.items.map((item) => ({ key: item.key, label: item.label, weight: weightOf(item) }));
  const split = splitByBar(weighted, barNow);
  const included = new Set(mood?.include_items ?? []);
  const groups = useMemo(() => {
    const map = new Map<string, PrefItem[]>();
    for (const item of prefs.items) map.set(item.group, [...(map.get(item.group) ?? []), item]);
    return [...map.entries()];
  }, [prefs.items]);

  const suggestions = suggestWeightChanges(prefs.signals[self], (key) => {
    const item = prefs.items.find((i) => i.key === key);
    return prefs.weights[self][key] ?? item?.defaultWeight ?? 50;
  });

  function toggleInclude(key: string) {
    const next = new Set(included);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    run(() => setMoodIncludes([...next]), 'Updated for this mood.');
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-ink-soft">
        Choose who you’re open to meeting, in which lane, and how picky you are right now. A
        pair only shows up when both people’s settings let it through, and neither of you is
        ever told why someone didn’t appear.
      </p>

      {/* ———————————————— mood ———————————————— */}
      <section>
        <SectionHeader
          title="How are you feeling?"
          hint="A mood raises or lowers your bar for a while, then ends by itself."
        />
        <Card className="space-y-3">
          {active && mood ? (
            <div className="flex flex-wrap items-center gap-2 rounded-card bg-sage-soft px-3 py-2.5">
              <p className="min-w-0 flex-1 text-sm text-sage-deep">
                <strong>{moodInfo(mood.preset)?.label ?? 'Custom mood'}</strong> ·{' '}
                {describeMoodRemaining(mood.expires_at)}
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => clearMood(), 'Back to your usual settings.')}
              >
                End it now
              </Button>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              No mood set. Your usual settings apply.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {MOODS.map((option) => (
              <Chip
                key={option.id}
                selected={active && mood?.preset === option.id}
                disabled={pending}
                onClick={() =>
                  run(() => setMood(option.id), `${option.label} for the next ${option.hours} hours.`)
                }
                title={option.blurb}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-ink-faint">
            {active && mood
              ? moodInfo(mood.preset)?.blurb
              : 'Pick one to try it. People never see your mood, and a quiet person looks the same as someone who simply doesn’t match.'}
          </p>
        </Card>
      </section>

      {/* ———————————————— lane tabs ———————————————— */}
      <div role="tablist" aria-label="Lanes" className="flex gap-2 overflow-x-auto pb-1">
        {SELVES.map((option) => (
          <Chip
            key={option}
            role="tab"
            aria-selected={self === option}
            selected={self === option}
            onClick={() => setSelf(option)}
            className="shrink-0"
          >
            {SELF_INFO[option].label}
            {lanes[option].enabled ? '' : ' (off)'}
          </Chip>
        ))}
      </div>

      <section className="space-y-4" aria-label={`${SELF_INFO[self].label} settings`}>
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg">{SELF_INFO[self].label}</p>
              <p className="text-sm text-ink-soft">{SELF_INFO[self].blurb}</p>
            </div>
            <Switch
              checked={lane.enabled}
              onCheckedChange={(next) => patchLane({ enabled: next })}
              label={`Turn on ${SELF_INFO[self].label}`}
            />
          </div>

          {paused ? (
            <p role="status" className="rounded-card bg-gold-soft px-3 py-2 text-sm">
              Your current mood is resting this lane. It comes back when the mood ends.
            </p>
          ) : null}

          <div>
            <label className="text-sm font-medium" htmlFor={`blurb-${self}`}>
              {SELF_INFO[self].cardHint}
            </label>
            <textarea
              id={`blurb-${self}`}
              value={lane.blurb}
              maxLength={140}
              rows={2}
              onChange={(event) => patchLane({ blurb: event.target.value })}
              className={`${inputCls} mt-1 resize-none`}
              placeholder="Optional. Shown only to people who match."
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium">How picky are you, normally?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {BAR_STOPS.map((stop) => {
                const selected = nearestStop(lane.bar) === stop.value;
                return (
                  <button
                    key={stop.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => patchLane({ bar: stop.value })}
                    className={`rounded-card border px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? 'border-terracotta bg-terracotta-soft'
                        : 'border-line bg-card hover:border-terracotta'
                    }`}
                  >
                    <span className="block font-bold">{stop.label}</span>
                    <span className="block text-xs text-ink-faint">{stop.hint}</span>
                  </button>
                );
              })}
            </div>
            {active && mood && mood.bar_shift !== 0 ? (
              <p className="mt-2 text-xs text-ink-faint">
                With your mood, the bar right now is{' '}
                <strong>{BAR_STOPS.find((s) => s.value === nearestStop(barNow))?.label}</strong>.
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <AudienceSelect
              id={`visible-${self}`}
              label="Who can see me"
              value={lane.visible_to}
              onChange={(value) => patchLane({ visible_to: value })}
            />
            <AudienceSelect
              id={`seeking-${self}`}
              label="Who I want to see"
              value={lane.seeking}
              onChange={(value) => patchLane({ seeking: value })}
            />
          </div>

          {self === 'dating' ? (
            <div className="space-y-3 rounded-card bg-cream p-3">
              <div>
                <label className="text-sm font-medium" htmlFor="identifies-as">
                  I am
                </label>
                <select
                  id="identifies-as"
                  value={lane.identifies_as ?? ''}
                  onChange={(event) =>
                    patchLane({ identifies_as: (event.target.value || null) as Gender | null })
                  }
                  className={`${inputCls} mt-1`}
                >
                  <option value="">Prefer not to say</option>
                  {GENDERS.map((gender) => (
                    <option key={gender} value={gender}>
                      {GENDER_LABEL[gender]}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset>
                <legend className="text-sm font-medium">I’m open to meeting</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {GENDERS.map((gender) => (
                    <Chip
                      key={gender}
                      selected={lane.interested_in.includes(gender)}
                      onClick={() =>
                        patchLane({
                          interested_in: lane.interested_in.includes(gender)
                            ? lane.interested_in.filter((g) => g !== gender)
                            : [...lane.interested_in, gender],
                        })
                      }
                    >
                      {GENDER_LABEL[gender]}
                    </Chip>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  Leave all unselected to be open to everyone. This only matters when both people’s
                  settings agree; it’s never shown on your card.
                </p>
              </fieldset>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <p className="text-xs text-ink-faint">
              {lane.enabled && !prefs.discoverable
                ? 'Saving will also make you discoverable.'
                : 'Changes apply when you save.'}
            </p>
            <Button size="sm" disabled={pending} onClick={saveLane}>
              {pending ? 'Saving' : 'Save lane'}
            </Button>
          </div>
        </Card>

        {/* ———————————————— what's ready for this mood ———————————————— */}
        {active && prefs.items.length > 0 ? (
          <Card className="space-y-3">
            <p className="font-display text-lg">Ready for this mood</p>
            {split.clear.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {split.clear.map((item) => (
                  <li key={item.key} className="rounded-pill bg-sage-soft px-3 py-1 text-sm font-semibold text-sage-deep">
                    {item.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">
                Nothing you’ve rated clears the bar right now, so only verified shared places
                can get through.
              </p>
            )}
            {split.below.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-sm font-bold text-terracotta-deep">
                  Not at this energy ({split.below.length})
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {split.below.map((item) => (
                    <li key={item.key} className="flex items-center gap-2 text-sm text-ink-faint">
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <Button
                        size="sm"
                        variant={included.has(item.key) ? 'secondary' : 'ghost'}
                        disabled={pending}
                        aria-pressed={included.has(item.key)}
                        onClick={() => toggleInclude(item.key)}
                      >
                        {included.has(item.key) ? 'Included' : 'Include for now'}
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Card>
        ) : null}

        {/* ———————————————— suggestions ———————————————— */}
        {suggestions.length > 0 ? (
          <Card tone="cream" className="space-y-2">
            <p className="font-display text-lg">Worth a look</p>
            {suggestions.map((suggestion) => (
              <div key={suggestion.key} className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-sm">
                  <strong>{suggestion.label}</strong>: {suggestion.reason}{' '}
                  {suggestion.to > suggestion.from ? 'Rate it higher?' : 'Rate it lower?'}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => saveWeights(self, [{ item: suggestion.key, weight: suggestion.to }]),
                      `${suggestion.label} is now ${weightLabel(suggestion.to).toLowerCase()}.`,
                    )
                  }
                >
                  Yes
                </Button>
              </div>
            ))}
            <p className="text-xs text-ink-faint">
              Based only on your own taps in this lane. Nothing changes unless you say yes.
            </p>
          </Card>
        ) : null}

        {/* ———————————————— weights ———————————————— */}
        <div>
          <SectionHeader
            title="What matters to you"
            hint="Rate each one. Higher means it counts for more when you’re picky."
          />
          {prefs.items.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-soft">
                Add interests in{' '}
                <Link href="/settings" className="font-bold text-terracotta-deep">
                  Settings
                </Link>{' '}
                or a school in{' '}
                <Link href="/profile/edit" className="font-bold text-terracotta-deep">
                  Edit profile
                </Link>{' '}
                and they’ll show up here to rate.
              </p>
            </Card>
          ) : (
            <Card className="space-y-5">
              {groups.map(([group, groupItems]) => (
                <div key={group}>
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">{group}</p>
                  <ul className="mt-2 space-y-3">
                    {groupItems.map((item) => {
                      const value = weightOf(item);
                      return (
                        <li key={item.key}>
                          <div className="flex items-baseline justify-between gap-2">
                            <label htmlFor={`w-${self}-${item.key}`} className="min-w-0 truncate text-sm font-semibold">
                              {item.label}
                            </label>
                            <span className="shrink-0 text-xs text-ink-faint">{weightLabel(value)}</span>
                          </div>
                          <input
                            id={`w-${self}-${item.key}`}
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={value}
                            aria-valuetext={weightLabel(value)}
                            onChange={(event) =>
                              setEdits((current) => ({
                                ...current,
                                [self]: { ...current[self], [item.key]: clampWeight(event.target.value) },
                              }))
                            }
                            className="mt-1 w-full accent-terracotta"
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-xs text-ink-faint">
                  Never show hides an item from this lane entirely.
                </p>
                <Button size="sm" disabled={pending || changed.length === 0} onClick={saveItemWeights}>
                  {pending ? 'Saving' : changed.length > 0 ? `Save ${changed.length}` : 'Saved'}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </section>

      <Card tone="cream" className="space-y-2">
        <p className="text-sm text-ink-soft">
          Location, demographics and the contexts you list are still under Discoverability in{' '}
          <Link href="/settings" className="font-bold text-terracotta-deep">
            Settings
          </Link>
          . Marking interest stays private unless it’s mutual.
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => resetDiscoveryHistory(), 'Cleared what the app had learned.')}
        >
          Forget what the app learned from my taps
        </Button>
      </Card>
    </div>
  );
}

function AudienceSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: Audience;
  onChange: (value: Audience) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as Audience)}
        className={`${inputCls} mt-1`}
      >
        {AUDIENCES.map((option) => (
          <option key={option} value={option}>
            {AUDIENCE_INFO[option].label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-ink-faint">{AUDIENCE_INFO[value].blurb}</p>
    </div>
  );
}
