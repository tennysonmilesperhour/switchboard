'use client';

import type { ButtonHTMLAttributes } from 'react';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  emoji?: string;
}

/** Tappable pill used for activities, experiences, and signals. */
export function Chip({
  selected = false,
  emoji,
  children,
  className = '',
  ...props
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
        selected
          ? 'bg-ink text-paper border-ink shadow-lift'
          : 'bg-card text-ink-soft border-line hover:border-ink-faint'
      } ${className}`}
      {...props}
    >
      {emoji ? <span aria-hidden>{emoji}</span> : null}
      {children}
    </button>
  );
}
