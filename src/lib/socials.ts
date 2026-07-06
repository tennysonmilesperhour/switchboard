/**
 * Catalog of social platforms a profile can link to.
 *
 * A profile stores socials as `{ platform, value }` where `platform` is one of
 * the ids below and `value` is either a bare handle (e.g. `alexr`) or a full
 * URL the user pasted. `hrefFor` normalises both into a canonical link.
 */

import type { IconName } from '@/components/ui/Icon';

export interface SocialPlatform {
  id: string;
  label: string;
  icon: IconName;
  /** Brand colour, used to tint the icon. */
  color: string;
  /** Hint shown in the edit field. */
  placeholder: string;
  /** Build a link from a bare handle (value already stripped of `@`/url). */
  toUrl: (handle: string) => string;
}

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'instagram',
    color: '#E4405F',
    placeholder: 'username',
    toUrl: (h) => `https://instagram.com/${h}`,
  },
  {
    id: 'x',
    label: 'X',
    icon: 'x',
    color: '#0F1419',
    placeholder: 'username',
    toUrl: (h) => `https://x.com/${h}`,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: 'tiktok',
    color: '#111111',
    placeholder: 'username',
    toUrl: (h) => `https://tiktok.com/@${h}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: 'linkedin',
    color: '#0A66C2',
    placeholder: 'in/username',
    toUrl: (h) => `https://linkedin.com/${h.startsWith('in/') || h.startsWith('company/') ? h : `in/${h}`}`,
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: 'github',
    color: '#1A1E22',
    placeholder: 'username',
    toUrl: (h) => `https://github.com/${h}`,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: 'youtube',
    color: '#FF0000',
    placeholder: '@channel',
    toUrl: (h) => `https://youtube.com/${h.startsWith('@') ? h : `@${h}`}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: 'facebook',
    color: '#1877F2',
    placeholder: 'username',
    toUrl: (h) => `https://facebook.com/${h}`,
  },
  {
    id: 'threads',
    label: 'Threads',
    icon: 'threads',
    color: '#111111',
    placeholder: 'username',
    toUrl: (h) => `https://threads.net/@${h}`,
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    icon: 'bluesky',
    color: '#0285FF',
    placeholder: 'username.bsky.social',
    toUrl: (h) => `https://bsky.app/profile/${h}`,
  },
  {
    id: 'spotify',
    label: 'Spotify',
    icon: 'spotify',
    color: '#1DB954',
    placeholder: 'user id',
    toUrl: (h) => `https://open.spotify.com/user/${h}`,
  },
  {
    id: 'twitch',
    label: 'Twitch',
    icon: 'twitch',
    color: '#9146FF',
    placeholder: 'username',
    toUrl: (h) => `https://twitch.tv/${h}`,
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    icon: 'snapchat',
    color: '#F7B500',
    placeholder: 'username',
    toUrl: (h) => `https://snapchat.com/add/${h}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: 'telegram',
    color: '#26A5E4',
    placeholder: 'username',
    toUrl: (h) => `https://t.me/${h}`,
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: 'discord',
    color: '#5865F2',
    placeholder: 'username',
    // Discord has no canonical public profile URL; keep the value as text.
    toUrl: (h) => (/^https?:\/\//i.test(h) ? h : ''),
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'whatsapp',
    color: '#25D366',
    placeholder: '+15551234567',
    toUrl: (h) => `https://wa.me/${h.replace(/[^\d]/g, '')}`,
  },
];

export const SOCIAL_BY_ID: Record<string, SocialPlatform> = Object.fromEntries(
  SOCIAL_PLATFORMS.map((p) => [p.id, p]),
);

/** Strip a leading `@`, surrounding whitespace, and any known host prefix. */
export function normalizeHandle(platform: SocialPlatform, raw: string): string {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) {
    // Pull the last meaningful path segment out of a pasted profile URL.
    try {
      const url = new URL(value);
      const segments = url.pathname.split('/').filter(Boolean);
      return (segments[segments.length - 1] ?? '').replace(/^@/, '') || value;
    } catch {
      return value.replace(/^@/, '');
    }
  }
  return value.replace(/^@/, '');
}

/** Canonical outbound link for a stored social value (or '' if none). */
export function hrefFor(platformId: string, value: string): string {
  const platform = SOCIAL_BY_ID[platformId];
  const trimmed = value.trim();
  if (!platform) return /^https?:\/\//i.test(trimmed) ? trimmed : '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return platform.toUrl(normalizeHandle(platform, trimmed));
}

/** Human-facing short label for a stored social value. */
export function displayHandle(platformId: string, value: string): string {
  const platform = SOCIAL_BY_ID[platformId];
  if (!platform) return value;
  const handle = normalizeHandle(platform, value);
  if (platformId === 'whatsapp') return handle;
  return `@${handle.replace(/^@/, '')}`;
}
