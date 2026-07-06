/* Deterministic initials avatar - no image dependency. */

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

interface AvatarProps {
  name: string;
  seed?: string;
  src?: string | null;
  size?: AvatarSize;
  ring?: boolean;
  className?: string;
}

export function Avatar({
  name,
  seed,
  src,
  size = 'md',
  ring = false,
  className = '',
}: AvatarProps) {
  const hue = hueFor(seed ?? name);
  const ringCls = ring ? 'ring-2 ring-white' : '';
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${SIZES[size]} rounded-full object-cover ${ringCls} ${className}`}
      />
    );
  }
  return (
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
