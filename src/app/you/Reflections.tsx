'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { requestReflection } from '@/lib/actions/identity';
import type { Reflection } from '@/lib/server/identity';
import type { DeckCard } from '@/lib/server/reflection-deck';
import { ReflectionDeck } from './ReflectionDeck';

const KINDS: { key: string; label: string; blurb: string }[] = [
  { key: 'general', label: 'Who I seem to be', blurb: 'An overall read' },
  { key: 'relationships', label: 'How I relate to people', blurb: 'Where you invest' },
  { key: 'desires', label: 'Moving toward what I want', blurb: 'Closing the gap' },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KINDS.map((k) => [k.key, k.label]),
);

export function Reflections({
  reflections,
  ready,
  deck,
  deckFailed,
}: {
  reflections: Reflection[];
  ready: boolean;
  deck: DeckCard[];
  deckFailed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  function ask(kind: string) {
    setBusyKind(kind);
    startTransition(async () => {
      const res = await requestReflection(kind);
      setBusyKind(null);
      if (res.ok) {
        toast.success('Reflection ready');
        router.refresh();
      } else if (res.reason === 'not_ready') {
        toast.info('A little more history first, then this unlocks');
      } else {
        toast.error(res.error ?? 'Could not write that reflection', res.code);
      }
    });
  }

  return (
    <section>
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
        Reflections
      </h3>
      <div className="mb-5">
        <h4 className="mb-1 text-sm font-bold text-ink">Look back</h4>
        <ReflectionDeck cards={deck} failed={deckFailed} />
      </div>
      <p className="mb-3 text-xs leading-relaxed text-ink-faint">
        {ready
          ? 'Ask for a deeper, written reflection over your reads - how you relate to people, and how to move toward what you say you want.'
          : 'Once you’ve gathered a bit more history, you can ask for a deeper written reflection here.'}
      </p>

      {ready ? (
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => ask(k.key)}
              disabled={pending}
              className="flex flex-col items-start gap-0.5 rounded-card border border-line bg-card px-3 py-2.5 text-left transition-colors hover:border-terracotta disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                {busyKind === k.key ? (
                  <Icon name="sparkle" size={14} className="animate-pulse text-terracotta-deep" />
                ) : (
                  <Icon name="sparkle" size={14} className="text-terracotta-deep" />
                )}
                {k.label}
              </span>
              <span className="text-[11px] text-ink-faint">{k.blurb}</span>
            </button>
          ))}
        </div>
      ) : null}

      {reflections.length > 0 ? (
        <div className="space-y-3">
          {reflections.map((r) => (
            <article key={r.id} className="rounded-card border border-line bg-cream/50 p-4">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                  {KIND_LABEL[r.kind] ?? 'Reflection'}
                </span>
                {r.source === 'fallback' ? (
                  <span className="rounded-pill bg-cream px-1.5 py-0.5 text-[10px] font-bold text-ink-faint">
                    From your reads
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                {r.body}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
