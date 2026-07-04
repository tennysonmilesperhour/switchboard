/* Warm, deterministic initials avatar - no image dependency. */

const HUES = [25, 45, 85, 150, 200, 260, 320];

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
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
} as const;

interface AvatarProps {
  name: string;
  seed?: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({ name, seed, src, size = 'md', className = '' }: AvatarProps) {
  const hue = hueFor(seed ?? name);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${SIZES[size]} rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${SIZES[size]} rounded-full inline-flex items-center justify-center font-semibold select-none ${className}`}
      style={{
        background: `oklch(90% 0.05 ${hue})`,
        color: `oklch(40% 0.09 ${hue})`,
      }}
    >
      {initials(name) || '•'}
    </span>
  );
}
