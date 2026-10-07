/* Deterministic initials avatar - no image dependency. */

import { Glyph } from '@/components/ui/Glyph';

const HUES = [340, 265, 220, 160, 45, 10, 300];

function hueFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return HUES[Math.abs(hash) % HUES.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-24 text-3xl',
} as const;

type AvatarSize = keyof typeof SIZES;

/**
 * What this person is up for right now, if the viewer is allowed to know.
 *
 * Always comes from `loadVisibleSignals`, which reads through the viewer's own
 * client so the audience rule stays in the RLS policy. A ring is only ever
 * drawn from a row the viewer could already have read.
 */
export interface AvatarSignal {
  emoji: string;
  label: string;
}

interface AvatarProps {
  name: string;
  seed?: string;
  src?: string | null;
  size?: AvatarSize;
  ring?: boolean;
  /** Draw a live-signal ring and badge. Omit or pass null for no signal. */
  signal?: AvatarSignal | null;
  className?: string;
}

export function Avatar({
  name,
  seed,
  src,
  size = 'md',
  ring = false,
  signal = null,
  className = '',
}: AvatarProps) {
  const hue = hueFor(seed ?? name);
  // A signal ring wins over the plain contrast ring: both are the same pixels,
  // and "this person is around right now" is the more useful thing to say with
  // them.
  const ringCls = signal
    ? 'ring-2 ring-sage ring-offset-1 ring-offset-paper'
    : ring
      ? 'ring-2 ring-white'
      : '';

  const face = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className={`${SIZES[size]} rounded-full object-cover ${ringCls} ${className}`}
    />
  ) : (
    <span
      aria-hidden
      className={`${SIZES[size]} rounded-full inline-flex items-center justify-center font-bold select-none ${ringCls} ${className}`}
      style={{
        background: `oklch(88% 0.09 ${hue})`,
        color: `oklch(42% 0.15 ${hue})`,
      }}
    >
      {initials(name) || '•'}
    </span>
  );

  if (!signal) return face;

  // The emoji is the signal's own, so the ring never depends on colour alone to
  // say what it means — and the label rides along as text for anyone who is not
  // looking at colour at all.
  return (
    <span className="relative inline-flex">
      {face}
      <span
        className="absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-paper text-ink-soft shadow-sm"
        aria-hidden
      >
        <Glyph emoji={signal.emoji} size={11} />
      </span>
      <span className="sr-only">{`${name} is up for ${signal.label} right now`}</span>
    </span>
  );
}

interface AvatarClusterProps {
  people: { name: string; src?: string | null }[];
  size?: AvatarSize;
  max?: number;
  /** Add a white ring so avatars read on colored backgrounds. */
  onColor?: boolean;
  className?: string;
}

/** Overlapping "who's going" avatar stack with a +N overflow bubble. */
export function AvatarCluster({
  people,
  size = 'sm',
  max = 4,
  onColor = false,
  className = '',
}: AvatarClusterProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className={`flex items-center ${className}`}>
      <div className="flex -space-x-2">
        {shown.map((p, i) => (
          <Avatar
            key={`${p.name}-${i}`}
            name={p.name}
            src={p.src}
            size={size}
            ring={onColor}
          />
        ))}
      </div>
      {extra > 0 ? (
        <span
          className={`ml-1.5 text-xs font-bold ${onColor ? 'text-white/85' : 'text-ink-faint'}`}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
