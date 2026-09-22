'use client';

import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ImageInput } from '@/components/ui/ImageInput';
import {
  addSuggestion,
  castVote,
  closeVoting,
  deleteSuggestion,
  openVoting,
  pickWinner,
  updateSuggestion,
  type SuggestionInput,
} from '@/lib/actions/polls';
import { linkHostname, OPTION_DETAIL_MAX } from '@/lib/poll-option-input';
import { nextWeight, type Weight } from '@/lib/engine/scoring';
import { errorFor, errorRef, type ErrorCode } from '@/lib/errors';
import type { Poll, PollOption } from '@/lib/types';

export interface OptionResult {
  option_id: string;
  score: number;
  loves: number;
  objections: number;
  voters: number;
}

interface PollSectionProps {
  poll: Poll;
  options: PollOption[];
  results: OptionResult[];
  myVotes: Record<string, Weight>;
  isHost: boolean;
  eventId: string;
  /** Whose ideas the Edit and Remove controls belong to. */
  currentUserId: string;
}

/** The optional parts of an idea, shared by the suggestion box and the editor. */
interface IdeaExtras {
  detail: string;
  linkUrl: string;
  imageUrl: string;
}

const EMPTY_EXTRAS: IdeaExtras = { detail: '', linkUrl: '', imageUrl: '' };

function extrasOf(option: PollOption): IdeaExtras {
  return {
    detail: option.detail ?? '',
    linkUrl: option.link_url ?? '',
    imageUrl: option.image_url ?? '',
  };
}

/**
 * Description, link, and photo for an idea.
 *
 * Client feedback: a link had to be pasted into the idea's name, and a photo
 * could not be attached at all. These live behind one "Add details" toggle so
 * the fast path (type an idea, tap Add) stays one field.
 */
function IdeaFields({
  value,
  onChange,
  idPrefix,
  disabled,
  userId,
}: {
  value: IdeaExtras;
  onChange: (next: IdeaExtras) => void;
  idPrefix: string;
  disabled: boolean;
  userId: string;
}) {
  const fieldClass =
    'w-full rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta';
  return (
    <div className="space-y-2.5">
      <div>
        <label htmlFor={`${idPrefix}-detail`} className="text-xs font-bold text-ink-soft">
          Description
        </label>
        <textarea
          id={`${idPrefix}-detail`}
          value={value.detail}
          rows={2}
          maxLength={OPTION_DETAIL_MAX}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, detail: e.target.value })}
          placeholder="What is it, when, how much…"
          className={`${fieldClass} mt-1 resize-none`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-link`} className="text-xs font-bold text-ink-soft">
          Link
        </label>
        <input
          id={`${idPrefix}-link`}
          type="url"
          inputMode="url"
          value={value.linkUrl}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, linkUrl: e.target.value })}
          placeholder="https://…"
          className={`${fieldClass} mt-1`}
        />
      </div>
      <div>
        <p className="text-xs font-bold text-ink-soft mb-1">Photo</p>
        <ImageInput
          value={value.imageUrl}
          onChange={(url) => onChange({ ...value, imageUrl: url })}
          userId={userId}
          pathPrefix="poll-idea"
          bucket="media"
          aspect="video"
          label="idea photo"
          allowLink={false}
        />
      </div>
    </div>
  );
}

/** The link and photo an idea carries, as the group sees them. */
function IdeaMedia({ option }: { option: PollOption }) {
  return (
    <>
      {option.link_url && (
        <a
          href={option.link_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-1.5 inline-flex max-w-full items-center gap-1 text-xs font-bold text-terracotta-deep underline decoration-terracotta/40 underline-offset-2"
        >
          <span aria-hidden>🔗</span>
          <span className="truncate">{linkHostname(option.link_url)}</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
      {option.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={option.image_url}
          alt=""
          loading="lazy"
          className="mt-2 w-full max-h-56 rounded-card object-cover border border-line"
        />
      )}
    </>
  );
}

const WEIGHT_BUTTONS: Array<{ weight: Weight; emoji: string; label: string }> = [
  { weight: 2, emoji: '😍', label: 'Absolutely love this' },
  { weight: 1, emoji: '🙂', label: 'Sounds good' },
  { weight: -1, emoji: '🙅', label: "I'd rather not" },
];

function consensusOf(result: OptionResult | undefined): number {
  if (!result || result.voters === 0) return 0;
  return Math.round(((result.score / result.voters + 1) / 3) * 100);
}

/**
 * How long to sit on a tally bump before re-fetching aggregates.
 *
 * The bump trigger fires for every vote on the poll, including the ones this
 * device just cast, and a group ranking a list together produces them in
 * bursts. Coalescing turns a burst into one re-render.
 */
const TALLY_REFRESH_MS = 600;

export function PollSection({
  poll,
  options,
  results,
  myVotes,
  isHost,
  eventId,
  currentUserId,
}: PollSectionProps) {
  const [suggestion, setSuggestion] = useState('');
  const [extras, setExtras] = useState<IdeaExtras>(EMPTY_EXTRAS);
  const [showExtras, setShowExtras] = useState(false);
  // The idea being edited in place, with its working copy of every field.
  const [editing, setEditing] = useState<{
    id: string;
    label: string;
    extras: IdeaExtras;
  } | null>(null);
  // Ideas this device removed, hidden until the server's list agrees. Same
  // reason as `justAdded`: the re-render is not reliably prompt.
  const [justRemoved, setJustRemoved] = useState<Set<string>>(() => new Set());
  // Options this device added, kept until a server render includes them.
  //
  // Not an optimistic overlay: these are rows the server has already saved and
  // handed back, with real ids, so they can be ranked immediately. They exist
  // because the re-render that should have shown them does not reliably arrive
  // — see submitSuggestion.
  const [justAdded, setJustAdded] = useState<PollOption[]>([]);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // What the rating buttons show.
  //
  // `myVotes` is server state: it only changes when an RSC render delivers new
  // props. Reading the buttons straight off it meant a tap showed nothing at
  // all until the round trip landed, so a press read as ignored — and pressing
  // again made it worse, because the toggle below recomputed from the same
  // stale prop. The optimistic overlay holds the tapped weight until the
  // action's own re-render replaces it, and drops automatically if the write
  // fails.
  const [shownVotes, showVote] = useOptimistic(
    myVotes,
    (current, cast: { optionId: string; weight: Weight }) => ({
      ...current,
      [cast.optionId]: cast.weight,
    }),
  );

  // Live poll: DB triggers bump polls.tally_version on every vote change and
  // on every change to the ideas themselves (20260921180000). Subscribe to this
  // poll's row and re-fetch so the meter moves as others vote and the list
  // grows as others suggest — without ever exposing an individual vote, or
  // putting an idea's text and author on a channel of their own.
  //
  // Coalesced, because that trigger is noisier than it looks: it fires for this
  // device's own votes too, each of which already brought a freshly rendered
  // page back with the action's response. Refreshing on every bump meant a
  // second full re-render per vote and a pile-up of them whenever a group
  // ranked a list at the same time — the page busy re-rendering is what made
  // the buttons feel unresponsive.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`poll-${poll.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'polls',
          filter: `id=eq.${poll.id}`,
        },
        () => {
          clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), TALLY_REFRESH_MS);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [poll.id, router]);

  const resultFor = (optionId: string) =>
    results.find((r) => r.option_id === optionId);

  // The server's list wins on every id it knows about; anything this device
  // added that has not come back yet is appended. Once a render includes it,
  // the `seen` check drops the local copy rather than showing it twice.
  const seen = new Set(options.map((option) => option.id));
  const shownOptions = [...options, ...justAdded.filter((option) => !seen.has(option.id))]
    // An edit's saved row replaces the server's copy until a render carries
    // it — and only while it is the newer of the two.
    .map((option) => {
      const local = justAdded.find((added) => added.id === option.id);
      const localIsNewer =
        local?.updated_at && (!option.updated_at || local.updated_at > option.updated_at);
      return localIsNewer ? local : option;
    })
    .filter((option) => !justRemoved.has(option.id));

  const ranked = [...shownOptions].sort((a, b) => {
    const ra = resultFor(a.id);
    const rb = resultFor(b.id);
    return (
      (rb?.score ?? 0) - (ra?.score ?? 0) ||
      (ra?.objections ?? 0) - (rb?.objections ?? 0) ||
      (rb?.loves ?? 0) - (ra?.loves ?? 0)
    );
  });

  const leader = ranked[0] ? resultFor(ranked[0].id) : undefined;
  const groupConsensus = consensusOf(leader);
  const winner = poll.winning_option_id
    ? options.find((o) => o.id === poll.winning_option_id)
    : null;
  const votingOpen = poll.phase === 'suggesting' || poll.phase === 'voting' || poll.phase === 'runoff';

  // Every action below revalidates this path, and Next.js ships the re-rendered
  // page in the same response as the action's return value. A router.refresh()
  // afterwards is therefore a second round trip fetching data we were already
  // handed — it used to sit between a tap and the button changing colour. Only
  // the realtime subscription above refreshes, because someone else's vote is
  // the one case where nothing has been handed to us.

  /**
   * Add an idea to the list.
   *
   * The `catch` is not defensive padding. `addSuggestion` can *reject* rather
   * than return `{ ok: false }` — a server action whose POST is answered with a
   * redirect instead of a result, which is what happens when the cookies the
   * browser sends carry an access token the server has already rotated (see the
   * same hazard called out in e2e/authed.spec.ts). A rejection inside
   * `startTransition` never reaches `setError`, so the screen showed nothing at
   * all: the box had already cleared, the list was unchanged, and the app had
   * no comment. That is indistinguishable from being ignored, and it is how
   * this failure went unexplained across several CI runs and an unknown number
   * of real ones.
   *
   * The typed text goes back in the box on any failure. Clearing optimistically
   * is right when the write lands; keeping the words when it doesn't is the
   * difference between "try again" and "type it again".
   *
   * On success the saved row is kept locally rather than waited for. Both
   * `revalidatePath` and `router.refresh()` were already firing, and CI caught
   * them returning **200 without the new option** — three refetches in a row —
   * while a full page load showed it at once. So an idea could be saved and
   * stay invisible until something unrelated reloaded the page, which reads as
   * the app having dropped it. The row the server hands back carries its real
   * id, so it can be ranked immediately and is replaced by the server's copy on
   * the first render that includes it.
   */
  function submitSuggestion(e: React.FormEvent) {
    e.preventDefault();
    const label = suggestion;
    const input: SuggestionInput = {
      label,
      detail: extras.detail,
      linkUrl: extras.linkUrl,
      imageUrl: extras.imageUrl,
    };
    setSuggestion('');
    setError('');
    setErrorCode(null);
    startTransition(async () => {
      try {
        const result = await addSuggestion(poll.id, eventId, input);
        if (result.ok) {
          if (result.option) setJustAdded((current) => [...current, result.option!]);
          setExtras(EMPTY_EXTRAS);
          setShowExtras(false);
          router.refresh();
          return;
        }
        setSuggestion(label);
        setError(result.error ?? 'Could not add that');
        setErrorCode(result.code ?? null);
      } catch {
        setSuggestion(label);
        const failed = errorFor('SB-POLL-SUGGEST');
        setError(failed.message);
        setErrorCode('SB-POLL-SUGGEST');
      }
    });
  }

  function canEdit(option: PollOption): boolean {
    return votingOpen && (isHost || option.author_id === currentUserId);
  }

  function beginEdit(option: PollOption) {
    setError('');
    setErrorCode(null);
    setEditing({ id: option.id, label: option.label, extras: extrasOf(option) });
  }

  /**
   * Save an edit. The row the server hands back is kept locally for the same
   * reason `justAdded` exists: the re-render that should show the change does
   * not reliably arrive, and an edit that appears to revert reads as "it did
   * not take", which is exactly what the client reported about typos.
   */
  function saveEdit() {
    if (!editing) return;
    const draft = editing;
    setError('');
    setErrorCode(null);
    startTransition(async () => {
      try {
        const result = await updateSuggestion(poll.id, eventId, draft.id, {
          label: draft.label,
          detail: draft.extras.detail,
          linkUrl: draft.extras.linkUrl,
          imageUrl: draft.extras.imageUrl,
        });
        if (result.ok) {
          if (result.option) {
            const saved = result.option;
            setJustAdded((current) => [...current.filter((o) => o.id !== saved.id), saved]);
          }
          setEditing(null);
          router.refresh();
          return;
        }
        setError(result.error ?? 'Could not save that');
        setErrorCode(result.code ?? null);
      } catch {
        const failed = errorFor('SB-POLL-EDIT');
        setError(failed.message);
        setErrorCode('SB-POLL-EDIT');
      }
    });
  }

  function removeIdea(option: PollOption) {
    const votes = resultFor(option.id)?.voters ?? 0;
    const warning =
      votes > 0
        ? `Remove “${option.label}”? ${votes} ${votes === 1 ? 'person has' : 'people have'} already rated it.`
        : `Remove “${option.label}”?`;
    if (!window.confirm(warning)) return;
    setError('');
    setErrorCode(null);
    startTransition(async () => {
      try {
        const result = await deleteSuggestion(poll.id, eventId, option.id);
        if (result.ok) {
          setJustRemoved((current) => new Set(current).add(option.id));
          if (editing?.id === option.id) setEditing(null);
          router.refresh();
          return;
        }
        setError(result.error ?? 'Could not remove that');
        setErrorCode(result.code ?? null);
      } catch {
        const failed = errorFor('SB-POLL-EDIT');
        setError(failed.message);
        setErrorCode('SB-POLL-EDIT');
      }
    });
  }

  function vote(optionId: string, weight: Weight) {
    // From the optimistic view, never `myVotes` — see nextWeight's note on why
    // the starting point has to be the weight the voter can actually see.
    const next = nextWeight(shownVotes[optionId] ?? 0, weight);
    setError('');
    startTransition(async () => {
      showVote({ optionId, weight: next });
      const result = await castVote(poll.id, eventId, optionId, next);
      if (!result.ok) setError(result.error ?? 'Vote failed');
    });
  }

  return (
    <section aria-labelledby="poll-heading">
      <SectionHeader
        title="What should we do?"
        hint={
          poll.phase === 'decided'
            ? 'The group has decided.'
            : poll.phase === 'runoff'
              ? 'Final runoff - pick between the finalists.'
              : 'Rank ideas privately. Nobody sees your individual votes.'
        }
      />

      {/* Consensus meter - aggregate only, never individual votes */}
      {votingOpen && results.some((r) => r.voters > 0) && (
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-bold text-ink-soft uppercase tracking-wide">Group consensus</span>
            <span className="font-extrabold text-sage-deep">{groupConsensus}%</span>
          </div>
          <div className="h-2.5 rounded-pill bg-cream overflow-hidden">
            <div
              className="h-full rounded-pill bg-sage transition-all duration-500"
              style={{ width: `${groupConsensus}%` }}
            />
          </div>
        </div>
      )}

      {winner && (
        <Card tone="sage" lifted className="mb-4 animate-rise">
          <p className="text-xs uppercase tracking-wide text-sage-deep font-extrabold">
            The plan
          </p>
          <p className="font-extrabold text-3xl tracking-tight mt-1">{winner.label}</p>
          {winner.detail && (
            <p className="text-sm text-ink-soft mt-1">{winner.detail}</p>
          )}
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose-deep mb-3">
          {error}
          {errorCode && (
            <span className="ml-2 text-xs text-ink-faint font-mono">
              {errorRef(errorCode)}
            </span>
          )}
        </p>
      )}

      <ul className="space-y-2.5">
        {ranked.map((option) => {
          const result = resultFor(option.id);
          const mine = shownVotes[option.id] ?? 0;
          const consensus = consensusOf(result);
          const isWinner = poll.winning_option_id === option.id;
          if (editing?.id === option.id) {
            const draft = editing;
            return (
              <li key={option.id}>
                <Card className="border-terracotta border-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit();
                    }}
                    className="space-y-2.5"
                    aria-label={`Edit ${option.label}`}
                  >
                    <div>
                      <label htmlFor={`edit-${option.id}-label`} className="text-xs font-bold text-ink-soft">
                        Idea
                      </label>
                      <input
                        id={`edit-${option.id}-label`}
                        value={draft.label}
                        maxLength={120}
                        disabled={pending}
                        onChange={(e) => setEditing({ ...draft, label: e.target.value })}
                        className="mt-1 w-full rounded-card border border-line bg-card px-3.5 py-2.5 text-sm font-bold outline-none focus:border-terracotta"
                      />
                    </div>
                    <IdeaFields
                      value={draft.extras}
                      onChange={(next) => setEditing({ ...draft, extras: next })}
                      idPrefix={`edit-${option.id}`}
                      disabled={pending}
                      userId={currentUserId}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={pending || !draft.label.trim()}>
                        {pending ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </form>
                </Card>
              </li>
            );
          }
          return (
            <li key={option.id}>
              <Card className={isWinner ? 'border-sage border-2' : ''}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold break-words">{option.label}</p>
                    {option.detail && (
                      <p className="text-xs text-ink-faint mt-0.5 whitespace-pre-wrap">{option.detail}</p>
                    )}
                    {option.source === 'ai' && (
                      <span className="text-[10px] uppercase tracking-wide text-terracotta-deep">
                        ✨ suggested by Switchboard
                      </span>
                    )}
                    <IdeaMedia option={option} />
                  </div>
                  {(result?.voters ?? 0) > 0 && (
                    <span
                      className="text-xs text-ink-faint whitespace-nowrap"
                      title={`${result?.voters} voted`}
                    >
                      {consensus}% · {result?.voters}
                      <span aria-hidden> 🗳</span>
                    </span>
                  )}
                </div>

                {votingOpen && (
                  <div className="flex gap-2 mt-3" role="group" aria-label={`Rate ${option.label}`}>
                    {WEIGHT_BUTTONS.map((button) => (
                      <button
                        // Deliberately never disabled. `pending` is one flag for
                        // the whole section, so disabling on it took every
                        // rating button on every option out of service while any
                        // single vote was in flight — the taps people described
                        // as doing nothing were landing on dead buttons. Nothing
                        // is lost by leaving them live: Next.js dispatches server
                        // actions one at a time per client, so a flurry of taps
                        // queues in order and the last one wins, while the
                        // optimistic overlay keeps the screen honest throughout.
                        key={button.weight}
                        type="button"
                        aria-pressed={mine === button.weight}
                        aria-label={button.label}
                        title={button.label}
                        onClick={() => vote(option.id, button.weight)}
                        className={`flex-1 rounded-pill border py-2 text-lg leading-none transition-all active:scale-95 ${
                          mine === button.weight
                            ? button.weight === -1
                              ? 'bg-rose-soft border-rose-deep'
                              : 'bg-sage-soft border-sage'
                            : 'bg-paper border-line hover:border-ink-faint opacity-70'
                        }`}
                      >
                        {button.emoji}
                      </button>
                    ))}
                  </div>
                )}

                {canEdit(option) && (
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => beginEdit(option)}
                      className="text-xs text-ink-faint hover:text-ink disabled:opacity-40"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => removeIdea(option)}
                      className="text-xs text-ink-faint hover:text-rose-deep disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                )}

                {isHost && poll.phase === 'decided' && !poll.winning_option_id && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await pickWinner(poll.id, eventId, option.id);
                      })
                    }
                  >
                    Choose this
                  </Button>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {votingOpen && (poll.allow_suggestions || isHost) && poll.phase !== 'runoff' && (
        <form onSubmit={submitSuggestion} className="mt-4">
          <div className="flex gap-2">
            <input
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder="Suggest an idea…"
              aria-label="Suggest an idea"
              className="flex-1 min-w-0 rounded-pill border border-line bg-card px-4 py-2.5 text-sm outline-none focus:border-terracotta"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={pending || !suggestion.trim()}>
              Add
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setShowExtras((v) => !v)}
            aria-expanded={showExtras}
            className="mt-2 text-xs font-medium text-ink-faint underline decoration-line underline-offset-2 hover:text-ink"
          >
            {showExtras ? 'Hide details' : 'Add details: description, link, or photo'}
          </button>
          {showExtras && (
            <div className="mt-2 rounded-card border border-line bg-cream/60 p-3">
              <IdeaFields
                value={extras}
                onChange={setExtras}
                idPrefix="suggest"
                disabled={pending}
                userId={currentUserId}
              />
            </div>
          )}
        </form>
      )}

      {isHost && votingOpen && (
        <div className="mt-5 flex gap-2">
          {poll.phase === 'suggesting' && (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await openVoting(poll.id, eventId);
                })
              }
            >
              Lock suggestions
            </Button>
          )}
          <Button
            size="sm"
            disabled={pending || options.length === 0}
            onClick={() =>
              startTransition(async () => {
                await closeVoting(poll.id, eventId);
              })
            }
          >
            {poll.resolution === 'auto'
              ? 'Close voting & pick winner'
              : poll.resolution === 'runoff' && poll.phase !== 'runoff'
                ? 'Close voting → runoff'
                : 'Close voting'}
          </Button>
        </div>
      )}
    </section>
  );
}
