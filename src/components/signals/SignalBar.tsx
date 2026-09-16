'use client';

import { useMemo, useState, useTransition } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Card } from '@/components/ui/Card';
import { MultiSelectChips } from '@/components/ui/MultiSelectChips';
import { useToast } from '@/components/ui/Toast';
import { activateSignals, clearSignal, removeSignal } from '@/lib/actions/signals';
import { formatRelative } from '@/lib/format';
import {
  audienceIsUnreachable,
  describeAudience,
  EMPTY_AUDIENCE,
  type SignalAudience,
} from '@/lib/signal-audience';
import { SIGNAL_PRESETS } from '@/lib/types';

interface CircleOption {
  id: string;
  name: string;
  emoji: string;
}

interface PersonOption {
  id: string;
  name: string;
}

interface GroupOption {
  id: string;
  name: string;
}

interface ActiveSignal {
  id: string;
  emoji: string;
  label: string;
  expires_at: string;
  circle_ids: string[];
  person_ids: string[];
  board_ids: string[];
}

interface SignalBarProps {
  active: ActiveSignal[];
  circles: CircleOption[];
  /** Accepted connections, for naming people one by one. */
  people: PersonOption[];
  /** Boards this person belongs to, for reaching a whole group. */
  groups: GroupOption[];
  defaultCircleId: string | null;
}

interface Status {
  emoji: string;
  label: string;
}

/** How many people to show before a search box is worth the space. */
const PEOPLE_SEARCH_THRESHOLD = 8;
const PEOPLE_SHOWN_MAX = 40;

/**
 * The availability composer.
 *
 * Client feedback, in order: a status must not go live the moment it is
 * tapped; each signal should choose its own audience; and that audience should
 * be able to name specific people or a whole group. So this is a draft first —
 * tap statuses, choose who sees them — and nothing is saved until Turn on. What
 * is live is listed separately, each signal with the audience it has, and can
 * be edited (which loads it back into the draft) or turned off on its own.
 */
export function SignalBar({ active, circles, people, groups, defaultCircleId }: SignalBarProps) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const freshAudience = (): SignalAudience => ({
    ...EMPTY_AUDIENCE,
    circleIds: defaultCircleId ? [defaultCircleId] : [],
  });

  // ————————————————————————— the draft —————————————————————————
  const [draft, setDraft] = useState<Status[]>([]);
  const [audience, setAudience] = useState<SignalAudience>(freshAudience);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [customEmoji, setCustomEmoji] = useState('✨');
  const [customLabel, setCustomLabel] = useState('');
  const [showPeople, setShowPeople] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState('');
  // Signals this device just turned off, hidden until the server's list agrees.
  const [justRemoved, setJustRemoved] = useState<Set<string>>(() => new Set());

  const names = useMemo(
    () => ({
      circles: new Map(circles.map((c) => [c.id, c.name])),
      people: new Map(people.map((p) => [p.id, p.name])),
      groups: new Map(groups.map((g) => [g.id, g.name])),
    }),
    [circles, people, groups],
  );

  const live = active.filter((signal) => !justRemoved.has(signal.label));
  const draftLabels = new Set(draft.map((s) => s.label));
  // Statuses that are live but not in the preset list (custom ones), so they
  // still render as tappable chips.
  const customStatuses = useMemo(() => {
    const presetLabels = new Set<string>(SIGNAL_PRESETS.map((p) => p.label));
    const seen = new Set<string>();
    const extras: Status[] = [];
    for (const status of [...draft, ...live]) {
      if (presetLabels.has(status.label) || seen.has(status.label)) continue;
      seen.add(status.label);
      extras.push({ emoji: status.emoji, label: status.label });
    }
    return extras;
  }, [draft, live]);

  function toggleStatus(status: Status) {
    setDraft((current) =>
      current.some((s) => s.label === status.label)
        ? current.filter((s) => s.label !== status.label)
        : [...current, status],
    );
  }

  function addCustom() {
    const label = customLabel.trim();
    if (!label) return;
    setDraft((current) =>
      current.some((s) => s.label === label)
        ? current
        : [...current, { emoji: customEmoji.trim() || '✨', label }],
    );
    setCustomLabel('');
  }

  function resetDraft() {
    setDraft([]);
    setAudience(freshAudience());
    setEditingLabel(null);
    setShowPeople(false);
    setShowGroups(false);
    setPeopleQuery('');
  }

  /** Load a live signal back into the draft so its audience can be changed. */
  function edit(signal: ActiveSignal) {
    setDraft([{ emoji: signal.emoji, label: signal.label }]);
    setAudience({
      circleIds: [...signal.circle_ids],
      personIds: [...signal.person_ids],
      boardIds: [...signal.board_ids],
    });
    setEditingLabel(signal.label);
    setShowPeople(signal.person_ids.length > 0);
    setShowGroups(signal.board_ids.length > 0);
  }

  function turnOn() {
    if (draft.length === 0) return;
    const statuses = [...draft];
    const chosen = { ...audience };
    startTransition(async () => {
      const result = await activateSignals(statuses, chosen);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not turn your signals on.', result.code);
        return;
      }
      const labels = statuses.map((s) => s.label);
      setJustRemoved((current) => {
        const next = new Set(current);
        for (const label of labels) next.delete(label);
        return next;
      });
      toast.success(
        `${labels.join(', ')} ${labels.length === 1 ? 'is' : 'are'} on for ${describeAudience(chosen, names)}.`,
      );
      resetDraft();
    });
  }

  function turnOff(signal: ActiveSignal) {
    startTransition(async () => {
      setJustRemoved((current) => new Set(current).add(signal.label));
      const result = await removeSignal(signal.label);
      if (!result.ok) {
        setJustRemoved((current) => {
          const next = new Set(current);
          next.delete(signal.label);
          return next;
        });
        toast.error(result.error ?? 'Could not turn that signal off.', result.code);
        return;
      }
      if (editingLabel === signal.label) resetDraft();
    });
  }

  function turnAllOff() {
    startTransition(async () => {
      setJustRemoved(new Set(active.map((s) => s.label)));
      const result = await clearSignal();
      if (!result.ok) {
        setJustRemoved(new Set());
        toast.error(result.error ?? 'Could not turn your signals off.', result.code);
        return;
      }
      resetDraft();
      toast.success('Signals turned off.');
    });
  }

  // ————————————————————————— the people picker —————————————————————————
  const query = peopleQuery.trim().toLowerCase();
  const shownPeople = useMemo(() => {
    const chosen = new Set(audience.personIds);
    const matches = people.filter(
      (person) => chosen.has(person.id) || !query || person.name.toLowerCase().includes(query),
    );
    // Chosen people always stay visible so a selection can be undone.
    return matches
      .sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)) || a.name.localeCompare(b.name))
      .slice(0, PEOPLE_SHOWN_MAX);
  }, [people, query, audience.personIds]);

  const nextExpiry =
    live.length > 0
      ? live.reduce((soonest, s) => (s.expires_at < soonest ? s.expires_at : soonest), live[0].expires_at)
      : null;
  const audienceSummary = describeAudience(audience, names);
  /**
   * Reached by tapping Edit on a live signal whose audience has since gone: the
   * composer opened with no chip lit and a Save button that did nothing, however
   * many times it was pressed, because the only thing saying "you have picked
   * nobody" was a greyed-out button. The route out — tap a chip, right above —
   * was on screen the whole time and nothing pointed at it.
   */
  const audienceNoLongerExists = audienceIsUnreachable(audience, names);

  return (
    <div className="space-y-3" aria-busy={pending}>
      {/* ————————————————— what is live ————————————————— */}
      {live.length > 0 && (
        <Card tone="sage" className="animate-rise">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-sage-deep">Live now</p>
            <button
              type="button"
              onClick={turnAllOff}
              disabled={pending}
              className="shrink-0 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink-faint hover:text-ink disabled:opacity-40"
            >
              Turn all off
            </button>
          </div>
          <ul className="mt-2 space-y-2">
            {live.map((signal) => {
              const reach = describeAudience(
                {
                  circleIds: signal.circle_ids,
                  personIds: signal.person_ids,
                  boardIds: signal.board_ids,
                },
                names,
              );
              return (
                <li
                  key={signal.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-card bg-card/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">
                      <span aria-hidden>{signal.emoji}</span> {signal.label}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {reach} · off {formatRelative(signal.expires_at)}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => edit(signal)}
                      aria-label={`Change who sees ${signal.label}`}
                      className="text-xs font-bold text-ink-faint hover:text-ink disabled:opacity-40"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => turnOff(signal)}
                      aria-label={`Turn off ${signal.label}`}
                      className="text-xs font-bold text-ink-faint hover:text-rose-deep disabled:opacity-40"
                    >
                      Off
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">
            No broadcast, no notification - friends simply notice when they open
            Switchboard.{nextExpiry ? ` The first turns off ${formatRelative(nextExpiry)}.` : ''}
          </p>
        </Card>
      )}

      {/* ————————————————— the draft ————————————————— */}
      {editingLabel && (
        <p className="text-xs font-bold text-terracotta-deep">
          Changing who sees {editingLabel}. Tap Turn on to save, or{' '}
          <button type="button" onClick={resetDraft} className="underline underline-offset-2">
            cancel
          </button>
          .
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Statuses">
        {[...SIGNAL_PRESETS, ...customStatuses].map((signal) => (
          <Chip
            key={signal.label}
            emoji={signal.emoji}
            selected={draftLabels.has(signal.label)}
            onClick={() => toggleStatus(signal)}
            className="w-full justify-center whitespace-nowrap"
          >
            {signal.label}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          aria-label="Status emoji"
          value={customEmoji}
          onChange={(event) => setCustomEmoji(event.target.value)}
          maxLength={4}
          className="w-14 rounded-xl border border-line bg-card px-2 py-2 text-center"
        />
        <input
          aria-label="Custom status"
          value={customLabel}
          onChange={(event) => setCustomLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addCustom();
            }
          }}
          maxLength={40}
          placeholder="Add your own status…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-terracotta"
        />
        <button
          type="button"
          disabled={pending || !customLabel.trim()}
          onClick={addCustom}
          className="rounded-xl bg-ink px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {draft.length > 0 ? (
        <Card className="animate-rise space-y-3">
          <div>
            <p className="text-sm font-medium text-ink">
              Who can see {draft.length === 1 ? 'this' : 'these'}?{' '}
              <span className="font-normal text-ink-faint">Pick as many as you like.</span>
            </p>
            <MultiSelectChips
              ariaLabel="Circles who can see your signals"
              className="mt-2 flex flex-wrap gap-1.5"
              options={circles.map((circle) => ({
                value: circle.id,
                label: circle.name,
                emoji: circle.emoji,
              }))}
              selected={audience.circleIds}
              onChange={(circleIds) => setAudience((current) => ({ ...current, circleIds }))}
              allOption={{
                label: 'Everyone I know',
                // The whole audience, not just the circle row. Named people and
                // groups are part of this choice, so picking three of them and
                // no circle is an audience of three people — and turning the
                // last circle off has to be able to leave you there.
                selected: isEveryoneAudience(audience),
                onSelect: () => setAudience(EMPTY_AUDIENCE),
              }}
              chipClassName="!px-3 !py-1 text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {people.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPeople((v) => !v)}
                aria-expanded={showPeople}
                className="rounded-pill border border-dashed border-line bg-card px-3 py-1 text-xs font-bold text-ink-soft hover:border-terracotta hover:text-terracotta-deep"
              >
                {showPeople ? '− ' : '+ '}Specific people
                {audience.personIds.length > 0 ? ` (${audience.personIds.length})` : ''}
              </button>
            )}
            {groups.length > 0 && (
              <button
                type="button"
                onClick={() => setShowGroups((v) => !v)}
                aria-expanded={showGroups}
                className="rounded-pill border border-dashed border-line bg-card px-3 py-1 text-xs font-bold text-ink-soft hover:border-terracotta hover:text-terracotta-deep"
              >
                {showGroups ? '− ' : '+ '}A whole group
                {audience.boardIds.length > 0 ? ` (${audience.boardIds.length})` : ''}
              </button>
            )}
          </div>

          {showPeople && people.length > 0 && (
            <div>
              <p className="text-xs font-bold text-ink-soft">Specific people</p>
              {people.length > PEOPLE_SEARCH_THRESHOLD && (
                <input
                  type="search"
                  value={peopleQuery}
                  onChange={(event) => setPeopleQuery(event.target.value)}
                  placeholder="Search your people…"
                  aria-label="Search your people"
                  className="mt-1.5 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-terracotta"
                />
              )}
              <MultiSelectChips
                ariaLabel="People who can see your signals"
                className="mt-2 flex flex-wrap gap-1.5"
                options={shownPeople.map((person) => ({ value: person.id, label: person.name }))}
                selected={audience.personIds}
                onChange={(personIds) => setAudience((current) => ({ ...current, personIds }))}
                chipClassName="!px-3 !py-1 text-xs"
              />
              {shownPeople.length === 0 && (
                <p className="mt-1.5 text-xs text-ink-faint">Nobody by that name.</p>
              )}
            </div>
          )}

          {showGroups && groups.length > 0 && (
            <div>
              <p className="text-xs font-bold text-ink-soft">A whole group</p>
              <p className="text-xs text-ink-faint">
                Every member of the board sees it, whether or not you are connected to them.
              </p>
              <MultiSelectChips
                ariaLabel="Groups who can see your signals"
                className="mt-2 flex flex-wrap gap-1.5"
                options={groups.map((group) => ({ value: group.id, label: group.name, emoji: '🏘️' }))}
                selected={audience.boardIds}
                onChange={(boardIds) => setAudience((current) => ({ ...current, boardIds }))}
                chipClassName="!px-3 !py-1 text-xs"
              />
            </div>
          )}

          {audienceNoLongerExists && (
            <p role="alert" className="text-xs font-bold text-terracotta-deep">
              Whoever this went to is gone: a circle you deleted, a group you
              left, or someone you are no longer connected to. Pick who can see
              it now, above.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            {/* Turning off the last circle is now allowed to land you on an
                empty audience, so the empty audience has to say what to do
                about it rather than just greying the button out. */}
            <p className="text-xs text-ink-faint">
              <span className="font-bold text-ink-soft">{draft.map((s) => s.label).join(', ')}</span>
              {' → '}
              {audienceSummary}.{' '}
              {audienceIsEmptyChoice
                ? 'Pick a circle, add some people, or tap Everyone I know.'
                : 'Nothing is shared until you turn it on; it turns itself off in 3 hours.'}
            </p>
            <button
              type="button"
              onClick={turnOn}
              disabled={pending || audienceNoLongerExists}
              className="shrink-0 rounded-pill bg-brand-gradient px-5 py-2 text-sm font-bold text-white shadow-lift active:scale-[0.97] disabled:opacity-40"
            >
              {pending ? 'Turning on…' : editingLabel ? 'Save' : 'Turn on'}
            </button>
          </div>
        </Card>
      ) : (
        <p className="text-xs text-ink-faint">
          Tap any that fit, choose who sees them, then turn them on. Friends quietly notice
          when they open Switchboard. Each turns off by itself in 3 hours.
        </p>
      )}
    </div>
  );
}
