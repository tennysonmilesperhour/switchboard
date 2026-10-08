'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Face } from '../scene-kit';

/** The made-up cast and the small screen parts every scene shares. */

export const PEOPLE = {
  maya: { name: 'Maya Chen', hue: 340 },
  jordan: { name: 'Jordan Ruiz', hue: 220 },
  priya: { name: 'Priya Nair', hue: 160 },
  sam: { name: 'Sam Okafor', hue: 45 },
  theo: { name: 'Theo Park', hue: 265 },
  lena: { name: 'Lena Novak', hue: 10 },
} as const;

export type PersonKey = keyof typeof PEOPLE;

export function Person({ who, size }: { who: PersonKey; size?: 'sm' | 'md' }) {
  const person = PEOPLE[who];
  return <Face name={person.name} hue={person.hue} size={size} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card px-2.5 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="min-h-4 text-[12px] font-semibold text-ink">{children}</p>
    </div>
  );
}

export function GradientButton({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-gradient px-3 py-2 text-[12px] font-bold text-white shadow-lift">
      {children}
    </div>
  );
}

export function Bubble({
  mine = false,
  who,
  children,
}: {
  mine?: boolean;
  who?: PersonKey;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-end gap-1.5 ${mine ? 'justify-end' : ''}`}>
      {!mine && who ? <Person who={who} size="sm" /> : null}
      <p
        className={`max-w-[78%] rounded-2xl px-2.5 py-1.5 text-[11px] leading-snug ${
          mine ? 'rounded-br-md bg-terracotta text-white' : 'rounded-bl-md bg-card text-ink shadow-lift'
        }`}
      >
        {children}
      </p>
    </div>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-300 ${
        on ? 'bg-sage' : 'bg-line'
      }`}
    >
      <span
        className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-all duration-300 ${
          on ? 'left-3.5' : 'left-0.5'
        }`}
      />
    </span>
  );
}

export function TabBar({ active }: { active?: 'home' | 'explore' | 'plans' }) {
  const tab = (name: 'home' | 'search' | 'calendar', key: typeof active) => (
    <span className={active === key ? 'text-terracotta' : 'text-ink-faint'}>
      <Icon name={name} size={16} />
    </span>
  );
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-around border-t border-line bg-card/95 px-2 py-2">
      {tab('home', 'home')}
      {tab('search', 'explore')}
      <span className="flex size-8 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lift">
        <Icon name="add" size={16} />
      </span>
      {tab('calendar', 'plans')}
      <span className="text-ink-faint">
        <Icon name="grid" size={16} />
      </span>
    </div>
  );
}

