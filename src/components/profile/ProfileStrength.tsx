'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import {
  computeProfileStrength,
  nextProfileSteps,
  type ProfileStrengthInput,
} from '@/lib/profile-strength';

const EDIT_HREF = '/profile/edit';

/**
 * Gamified profile-completion nudge shown on the owner's profile. A ring meter
 * plus a short, tappable checklist of the next best steps — leading with the
 * photo and contact fields, because those are what let friends recognize and
 * invite you by phone or email. Collapses to a quiet "all set" chip at 100%.
 */
export function ProfileStrength({ input }: { input: ProfileStrengthInput }) {
  const strength = computeProfileStrength(input);
  const [expanded, setExpanded] = useState(false);

  if (strength.complete) {
    return (
      <section aria-label="Profile strength">
        <div className="flex items-center gap-3 rounded-card border border-transparent bg-sage-soft px-4 py-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-sage text-white">
            <Icon name="check" size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-sage-deep">Your profile is all set</p>
            <p className="text-xs text-sage-deep/80">
              Friends can find and invite you by handle, email, or phone.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const topSteps = nextProfileSteps(strength, 3);
  const remaining = strength.items.filter((item) => !item.done);
  const shown = expanded ? remaining : topSteps;
  const percent = strength.percent;

  // SVG ring geometry.
  const size = 56;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;

  return (
    <section aria-label="Profile strength">
      <div className="rounded-card border border-line bg-card p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="var(--color-line)"
                strokeWidth={stroke}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="var(--color-terracotta)"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
                className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-ink">
              {percent}%
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg text-ink">Finish your profile</h3>
            <p className="text-sm text-ink-faint">
              {percent < 50
                ? 'Add a photo and your contact info so friends can invite you.'
                : 'A few more details and friends can find you anywhere.'}
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5">
          {shown.map((item) => (
            <li key={item.key}>
              <Link
                href={EDIT_HREF}
                className="group flex items-center gap-3 rounded-card border border-line bg-paper px-3 py-2.5 transition-colors hover:border-terracotta hover:bg-cream"
              >
                <span
                  className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${
                    item.priority
                      ? 'bg-terracotta-soft text-terracotta-deep'
                      : 'bg-cream text-ink-soft'
                  }`}
                >
                  <Icon name={item.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{item.label}</span>
                  <span className="block truncate text-xs text-ink-faint">{item.hint}</span>
                </span>
                <span className="text-ink-faint transition-transform group-hover:translate-x-0.5">
                  <Icon name="add" size={16} />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {remaining.length > topSteps.length ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-xs font-bold text-terracotta-deep hover:text-terracotta-deep"
          >
            {expanded
              ? 'Show fewer'
              : `Show ${remaining.length - topSteps.length} more`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
