import type { ReactNode } from 'react';

export type FactTier = 'claimed' | 'email' | 'vouched';

export interface ProfileFact {
  id: string;
  kind: 'school' | 'employer';
  label: string;
  tier: FactTier;
}

const TIER: Record<FactTier, { text: string; tone: string }> = {
  email: { text: 'Confirmed by email', tone: 'bg-sage-soft text-sage-deep' },
  vouched: { text: 'Vouched by connections', tone: 'bg-gold-soft text-ink' },
  claimed: { text: 'Not verified', tone: 'bg-cream text-ink-faint' },
};

/** Always words, never colour alone, for how far a claim has been checked. */
export function TrustLabel({ tier }: { tier: FactTier }) {
  const info = TIER[tier];
  return (
    <span className={`rounded-pill px-2 py-0.5 text-[11px] font-bold ${info.tone}`}>
      {info.text}
    </span>
  );
}

const KIND_LABEL = { school: 'School', employer: 'Work' } as const;

/**
 * Where someone studied or works, each with how far it has been checked.
 * `action` renders beside a row (the vouch button on someone else's profile,
 * edit controls on your own).
 */
export function FactList({
  facts,
  action,
}: {
  facts: readonly ProfileFact[];
  action?: (fact: ProfileFact) => ReactNode;
}) {
  if (facts.length === 0) return null;
  return (
    <ul className="space-y-2">
      {facts.map((fact) => (
        <li key={fact.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            {KIND_LABEL[fact.kind]}
          </span>
          <span className="min-w-0 text-sm font-semibold text-ink">{fact.label}</span>
          <TrustLabel tier={fact.tier} />
          {action ? <span className="ml-auto">{action(fact)}</span> : null}
        </li>
      ))}
    </ul>
  );
}
