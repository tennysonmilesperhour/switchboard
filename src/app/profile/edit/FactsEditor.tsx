'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import type { ErrorCode } from '@/lib/errors';
import { FactList, TrustLabel, type ProfileFact } from '@/components/profile/FactList';
import {
  addFact,
  removeFact,
  requestFactVerification,
  setFactShown,
} from '@/lib/actions/facts';

export interface EditableFact extends ProfileFact {
  shown: boolean;
}

const inputCls =
  'w-full rounded-card border border-line bg-card px-4 py-3 text-sm outline-none focus:border-terracotta transition-colors';

const NOTICE: Record<string, { tone: 'sage' | 'terracotta'; text: string }> = {
  verified: { tone: 'sage', text: 'Confirmed. That entry now shows as confirmed by email.' },
  expired: { tone: 'terracotta', text: 'That link expired. Request a new one below; links work for 30 minutes.' },
  mismatch: { tone: 'terracotta', text: 'That address no longer matches the entry. Request a new link.' },
  duplicate: { tone: 'terracotta', text: 'You already have an entry for that place. Remove one of them and try again.' },
  error: { tone: 'terracotta', text: 'Something went wrong confirming that link. Request a new one below.' },
};

export function FactsEditor({
  facts,
  notice,
}: {
  facts: EditableFact[];
  /** `?fact=` from the verification redirect. */
  notice?: string | null;
}) {
  const [kind, setKind] = useState<'school' | 'employer'>('school');
  const [label, setLabel] = useState('');
  const [verifying, setVerifying] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const banner = notice ? NOTICE[notice] : undefined;

  function run(work: () => Promise<{ ok: boolean; error?: string; code?: ErrorCode; message?: string }>, success?: string) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save that.', result.code);
        return;
      }
      if (success || result.message) toast.success(result.message ?? success ?? 'Saved.');
      router.refresh();
    });
  }

  function add(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    run(async () => {
      const result = await addFact(kind, label);
      if (result.ok) setLabel('');
      return result;
    }, 'Added. Verify it so people can trust it.');
  }

  function sendLink(fact: EditableFact) {
    run(async () => {
      const result = await requestFactVerification(fact.id, email);
      if (result.ok) {
        setVerifying(null);
        setEmail('');
      }
      return result;
    });
  }

  return (
    <section className="mt-8 space-y-3">
      <SectionHeader
        title="School and work"
        hint="Shown on your profile and used to find people you share a place with."
      />

      {banner ? (
        <Card tone={banner.tone} role="status">
          <p className="text-sm font-semibold">{banner.text}</p>
        </Card>
      ) : null}

      <Card className="space-y-4">
        {facts.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Add where you went to school or where you work. An entry starts as a claim. Confirm
            it with a school or work email and it shows as confirmed; two connections who are
            confirmed there can also vouch for it.
          </p>
        ) : (
          <FactList
            facts={facts}
            action={(fact) => {
              const editable = facts.find((f) => f.id === fact.id)!;
              return (
                <span className="flex flex-wrap items-center justify-end gap-1">
                  {editable.tier !== 'email' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        setVerifying(verifying === fact.id ? null : fact.id);
                        setEmail('');
                      }}
                    >
                      Verify
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => setFactShown(fact.id, !editable.shown), editable.shown ? 'Hidden.' : 'Showing.')}
                  >
                    {editable.shown ? 'Hide' : 'Show'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => removeFact(fact.id), 'Removed.')}
                  >
                    Remove
                  </Button>
                </span>
              );
            }}
          />
        )}

        {verifying ? (
          <form
            className="space-y-2 rounded-card bg-cream p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const fact = facts.find((f) => f.id === verifying);
              if (fact) sendLink(fact);
            }}
          >
            <label className="block text-sm font-medium" htmlFor="fact-email">
              Your school or work email
            </label>
            <input
              id="fact-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@school.edu"
              className={inputCls}
            />
            <p className="text-xs text-ink-faint">
              We email a link that works for 30 minutes. We keep only the domain, never the
              address.
            </p>
            <Button type="submit" size="sm" disabled={pending || !email.trim()}>
              {pending ? 'Sending' : 'Send link'}
            </Button>
          </form>
        ) : null}

        {facts.some((fact) => !fact.shown) ? (
          <p className="text-xs text-ink-faint">
            Hidden entries are visible only to you and aren’t used to find people you share a
            place with.
          </p>
        ) : null}

        <form onSubmit={add} className="space-y-2 border-t border-line pt-4">
          <p className="text-sm font-medium">Add a place</p>
          <div className="flex gap-2">
            {(['school', 'employer'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
                className={`rounded-pill border px-4 py-2 text-sm font-semibold ${
                  kind === option
                    ? 'border-terracotta bg-terracotta text-white'
                    : 'border-line bg-card text-ink-soft'
                }`}
              >
                {option === 'school' ? 'School' : 'Work'}
              </button>
            ))}
          </div>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={80}
            aria-label={kind === 'school' ? 'School name' : 'Employer name'}
            placeholder={kind === 'school' ? 'Utah Valley University' : 'Where you work'}
            className={inputCls}
          />
          <Button type="submit" size="sm" disabled={pending || !label.trim()}>
            Add
          </Button>
        </form>

        <p className="text-xs text-ink-faint">
          <TrustLabel tier="claimed" /> means you typed it. Nothing stops someone from typing a
          place they didn’t go, which is why confirmed entries are labelled differently.
        </p>
      </Card>
    </section>
  );
}
