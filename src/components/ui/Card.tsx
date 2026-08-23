import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'cream' | 'sage' | 'terracotta' | 'gold';
  lifted?: boolean;
}

const TONES = {
  default: 'bg-card border-line',
  cream: 'bg-cream border-transparent',
  sage: 'bg-sage-soft border-transparent',
  terracotta: 'bg-terracotta-soft border-transparent',
  gold: 'bg-gold-soft border-transparent',
} as const;

export function Card({
  tone = 'default',
  lifted = false,
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-card border p-4 ${TONES[tone]} ${lifted ? 'shadow-lift' : ''} ${className}`}
      {...props}
    />
  );
}

export function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    // `text-plate` is inert on every ordinary theme; under a wallpaper it puts
    // this heading on a plate rather than on the raw photograph. Section headers
    // are the largest body of text in the app with no surface of its own.
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="text-plate text-plate-inset">
        <h2 className="font-display text-xl text-ink">{title}</h2>
        {hint ? <p className="text-sm text-ink-faint mt-0.5">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}
