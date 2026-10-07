'use client';

import type { ButtonHTMLAttributes } from 'react';
import { Glyph } from '@/components/ui/Glyph';

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
      className={`inline-flex items-center gap-1.5 rounded-pill border px-4 py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
        selected
          ? 'bg-terracotta text-white border-terracotta shadow-lift'
          : 'bg-card text-ink-soft border-line hover:border-terracotta hover:text-terracotta-deep'
      } ${className}`}
      {...props}
    >
      {emoji ? <Glyph emoji={emoji} size={16} /> : null}
      {children}
    </button>
  );
}
