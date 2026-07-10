/**
 * Profile-completion scoring for the "profile strength" nudge.
 *
 * Pure and deterministic so it can be unit-tested and shared between the
 * server-rendered profile page and any future client surface. The checklist is
 * ordered by canonical section; the component decides what to surface.
 *
 * Why this exists: a person can only be invited to a plan by phone or email if
 * they've actually saved those fields on their profile. Someone who signed up
 * with a username (or an email but no phone) is invisible to phone/email
 * invites until they fill their contact info in. Nudging profile completion —
 * especially the contact fields and a photo — is what makes invites reliably
 * find the right account.
 */

import type { IconName } from '@/components/ui/Icon';

export interface ProfileStrengthInput {
  avatarUrl?: string | null;
  coverUrl?: string | null;
  bio?: string | null;
  tagline?: string | null;
  pronouns?: string | null;
  location?: string | null;
  interests?: string[] | null;
  downTo?: string[] | null;
  links?: unknown[] | null;
  socials?: unknown[] | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export interface ProfileStrengthItem {
  key: string;
  /** Imperative label shown when the item is still to do. */
  label: string;
  /** One line on why it's worth doing — invitability where relevant. */
  hint: string;
  done: boolean;
  weight: number;
  icon: IconName;
  /**
   * Items that unlock being found/invited (photo + contact) are surfaced
   * first when incomplete, since they're what the user's friends need.
   */
  priority: boolean;
}

export interface ProfileStrength {
  /** 0–100, rounded. */
  percent: number;
  items: ProfileStrengthItem[];
  /** Count of completed items. */
  doneCount: number;
  /** Total number of items. */
  total: number;
  complete: boolean;
}

function filled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmpty(value: unknown[] | null | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Score a profile against the checklist. Weights lean toward the fields that
 * make someone recognizable and reachable: a photo and the contact details
 * friends use to invite them.
 */
export function computeProfileStrength(input: ProfileStrengthInput): ProfileStrength {
  const items: ProfileStrengthItem[] = [
    {
      key: 'avatar',
      label: 'Add a profile photo',
      hint: 'Friends recognize you at a glance.',
      done: filled(input.avatarUrl),
      weight: 3,
      icon: 'camera',
      priority: true,
    },
    {
      key: 'phone',
      label: 'Add your phone number',
      hint: 'Lets friends invite you by phone number.',
      done: filled(input.contactPhone),
      weight: 3,
      icon: 'phone',
      priority: true,
    },
    {
      key: 'email',
      label: 'Add your email',
      hint: 'Lets friends invite you by email.',
      done: filled(input.contactEmail),
      weight: 2,
      icon: 'mail',
      priority: true,
    },
    {
      key: 'bio',
      label: 'Write a short bio',
      hint: 'A sentence or two about you.',
      done: filled(input.bio),
      weight: 2,
      icon: 'chat',
      priority: false,
    },
    {
      key: 'interests',
      label: 'Pick a few interests',
      hint: 'Powers mutual-interest matching.',
      done: nonEmpty(input.interests) || nonEmpty(input.downTo),
      weight: 2,
      icon: 'sparkle',
      priority: false,
    },
    {
      key: 'tagline',
      label: 'Add a tagline',
      hint: 'A one-liner that sounds like you.',
      done: filled(input.tagline),
      weight: 1,
      icon: 'edit',
      priority: false,
    },
    {
      key: 'location',
      label: 'Add your location',
      hint: 'Helps friends plan around you.',
      done: filled(input.location),
      weight: 1,
      icon: 'mapPin',
      priority: false,
    },
    {
      key: 'pronouns',
      label: 'Add your pronouns',
      hint: 'So people address you right.',
      done: filled(input.pronouns),
      weight: 1,
      icon: 'account',
      priority: false,
    },
    {
      key: 'socials',
      label: 'Link a social account',
      hint: 'Give people another way to connect.',
      done: nonEmpty(input.socials),
      weight: 1,
      icon: 'share',
      priority: false,
    },
    {
      key: 'links',
      label: 'Add a link',
      hint: 'Website, portfolio, anything.',
      done: nonEmpty(input.links),
      weight: 1,
      icon: 'link',
      priority: false,
    },
    {
      key: 'cover',
      label: 'Add a cover photo',
      hint: 'Give your profile some personality.',
      done: filled(input.coverUrl),
      weight: 1,
      icon: 'image',
      priority: false,
    },
  ];

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const doneWeight = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0);
  const percent = totalWeight === 0 ? 100 : Math.round((doneWeight / totalWeight) * 100);
  const doneCount = items.filter((item) => item.done).length;

  return {
    percent,
    items,
    doneCount,
    total: items.length,
    complete: doneCount === items.length,
  };
}

/**
 * The next handful of things worth doing, priority items first, then by weight.
 * Used to show a short, actionable checklist instead of the full list.
 */
export function nextProfileSteps(
  strength: ProfileStrength,
  limit = 3,
): ProfileStrengthItem[] {
  return strength.items
    .filter((item) => !item.done)
    .sort((a, b) => Number(b.priority) - Number(a.priority) || b.weight - a.weight)
    .slice(0, limit);
}
