import Link from 'next/link';
import { AvatarCluster } from './Avatar';

export const PLAN_COLORS = [
  'pink',
  'purple',
  'blue',
  'jade',
  'orange',
  'magenta',
] as const;

export type PlanColor = (typeof PLAN_COLORS)[number];

/**
 * The geometry a plan card occupies, exported so the loading placeholders in
 * `Skeleton.tsx` reserve exactly what the real card will take.
 *
 * These were duplicated as literals, and drifted: the feed skeleton stood 116px
 * tall where the card it stood in for is 416px, so the moment real content
 * arrived the page grew by over a thousand pixels. On iOS that flips the
 * document from "fits one screen" to "scrollable" in a single frame, which
 * starts Safari's URL-bar collapse — and everything on screen moves while it
 * animates. Shared constants are what stop the two drifting apart again.
 */
export const PLAN_CARD_FULL_MIN_H = 'min-h-[26rem]';
export const PLAN_CARD_TILE_ASPECT = 'aspect-[4/5]';

const GRADIENT: Record<PlanColor, string> = {
  pink: 'plan-pink',
  purple: 'plan-purple',
  blue: 'plan-blue',
  jade: 'plan-jade',
  orange: 'plan-orange',
  magenta: 'plan-magenta',
};

/** Stable color for a plan given its position or a hashed key. */
export function planColor(i: number): PlanColor {
  const len = PLAN_COLORS.length;
  return PLAN_COLORS[((i % len) + len) % len];
}

interface Attendee {
  name: string;
  src?: string | null;
}

interface PlanCardProps {
  title: string;
  color?: PlanColor;
  imageUrl?: string | null;
  attendees?: Attendee[];
  attendeesLabel?: string;
  when?: string;
  dateLabel?: string;
  where?: string;
  distance?: string;
  status?: string;
  href?: string;
  actions?: React.ReactNode;
  variant?: 'full' | 'compact' | 'tile';
  className?: string;
}

/**
 * Signature Switchboard plan card: full-bleed color + faint photo,
 * big display title, "who's going" cluster and time/place meta.
 */
export function PlanCard({
  title,
  color = 'pink',
  imageUrl,
  attendees = [],
  attendeesLabel,
  when,
  dateLabel,
  where,
  distance,
  status,
  href,
  actions,
  variant = 'full',
  className = '',
}: PlanCardProps) {
  const grad = GRADIENT[color];

  const surface = (
    <div
      className={`group relative overflow-hidden rounded-card text-white shadow-card ${
        variant === 'full'
          ? `${PLAN_CARD_FULL_MIN_H} p-6`
          : variant === 'tile'
            ? `${PLAN_CARD_TILE_ASPECT} p-3.5`
            : 'p-4'
      } ${className}`}
    >
      {/* Color base */}
      <div className={`absolute inset-0 ${grad}`} aria-hidden />
      {/* Cover photo — a full, front-and-center image on tiles; a faint texture
          on the signature full/compact cards. */}
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
            variant === 'tile' ? 'opacity-90' : 'opacity-30 mix-blend-luminosity'
          }`}
        />
      ) : null}
      {/* Legibility scrim — heavier at the bottom on tiles so text reads over
          a full photo. */}
      <div
        className={`absolute inset-0 ${
          variant === 'tile'
            ? 'bg-gradient-to-t from-black/70 via-black/20 to-black/5'
            : 'bg-gradient-to-t from-black/25 via-transparent to-black/10'
        }`}
        aria-hidden
      />

      {variant === 'full' ? (
        <div className="relative flex min-h-[inherit] flex-col">
          {status ? (
            <span className="self-start rounded-pill bg-white/25 px-3 py-1 text-xs font-bold uppercase tracking-wide backdrop-blur-sm">
              {status}
            </span>
          ) : null}

          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
            <h3 className="text-4xl font-extrabold leading-[1.05] tracking-tight drop-shadow-sm">
              {title}
            </h3>
            {attendees.length > 0 ? (
              <AvatarCluster people={attendees} size="sm" onColor />
            ) : null}
            {attendeesLabel ? (
              <p className="text-sm font-semibold text-white/85">{attendeesLabel}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            {when ? (
              <MetaRow left={when} right={dateLabel} />
            ) : null}
            {where ? (
              <MetaRow left={where} right={distance} muted />
            ) : null}
          </div>

          {actions ? <div className="mt-5 flex gap-3">{actions}</div> : null}
        </div>
      ) : variant === 'tile' ? (
        <div className="relative flex h-full flex-col justify-end">
          {status ? (
            <span className="absolute top-0 left-0 rounded-pill bg-white/25 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide backdrop-blur-sm">
              {status}
            </span>
          ) : null}
          <div className="space-y-1">
            <h3 className="text-lg font-extrabold leading-tight tracking-tight line-clamp-2 drop-shadow-sm">
              {title}
            </h3>
            {(when || dateLabel) && (
              <p className="text-xs font-semibold text-white/85">
                {[when, dateLabel].filter(Boolean).join(' · ')}
              </p>
            )}
            {where ? (
              <p className="truncate text-xs font-medium text-white/70">{where}</p>
            ) : null}
            {attendees.length > 0 ? (
              <div className="pt-1">
                <AvatarCluster people={attendees} size="xs" max={4} onColor />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="relative flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xl font-extrabold tracking-tight">
              {title}
            </h3>
            <div className="mt-1 flex items-center gap-2 text-sm text-white/85">
              {attendees.length > 0 ? (
                <AvatarCluster people={attendees} size="xs" max={3} onColor />
              ) : null}
              {when ? <span className="font-semibold">{when}</span> : null}
            </div>
            {where ? (
              <p className="mt-0.5 text-xs font-medium text-white/70">{where}</p>
            ) : null}
          </div>
          {(dateLabel || distance) && (
            <div className="shrink-0 text-right text-xs font-semibold text-white/80">
              {dateLabel ? <div>{dateLabel}</div> : null}
              {distance ? <div className="text-white/60">{distance}</div> : null}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block active:scale-[0.99] transition-transform">
        {surface}
      </Link>
    );
  }
  return surface;
}

function MetaRow({
  left,
  right,
  muted = false,
}: {
  left: string;
  right?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`font-bold ${muted ? 'text-white/80' : 'text-white'}`}>
        {left}
      </span>
      {right ? (
        <span className="shrink-0 text-sm font-semibold text-white/70">
          {right}
        </span>
      ) : null}
    </div>
  );
}
