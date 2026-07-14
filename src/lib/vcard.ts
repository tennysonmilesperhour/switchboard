/**
 * vCard (3.0) construction + QR encoding for the shareable contact card.
 *
 * A profile's QR encodes a vCard so that scanning it with a phone camera
 * offers "Add to Contacts" directly — no app or public web page required.
 */

import QRCode from 'qrcode';
import { hrefFor } from '@/lib/socials';
import type { ProfileLink, ProfileSocial } from '@/lib/types';

export interface VCardInput {
  displayName: string;
  handle: string;
  tagline?: string | null;
  bio?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  links?: ProfileLink[];
  socials?: ProfileSocial[];
}

/** Escape a value per RFC 6350 §3.4 (commas, semicolons, backslashes, newlines). */
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function buildVCard(input: VCardInput): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];

  lines.push(`FN:${esc(input.displayName || input.handle)}`);
  // N: last;first;middle;prefix;suffix — split display name best-effort.
  const parts = (input.displayName || '').trim().split(/\s+/);
  const first = parts.shift() ?? '';
  const last = parts.join(' ');
  lines.push(`N:${esc(last)};${esc(first)};;;`);

  if (input.tagline) lines.push(`TITLE:${esc(input.tagline)}`);
  if (input.handle) lines.push(`NICKNAME:${esc(input.handle)}`);
  if (input.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(input.email)}`);
  if (input.phone) lines.push(`TEL;TYPE=CELL:${esc(input.phone)}`);
  if (input.location) lines.push(`ADR;TYPE=HOME:;;${esc(input.location)};;;;`);

  const noteBits: string[] = [];
  if (input.bio) noteBits.push(input.bio);
  if (noteBits.length) lines.push(`NOTE:${esc(noteBits.join(' - '))}`);

  for (const link of input.links ?? []) {
    if (link.url) lines.push(`URL:${esc(link.url)}`);
  }
  for (const social of input.socials ?? []) {
    const href = hrefFor(social.platform, social.value);
    if (href) lines.push(`URL:${esc(href)}`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

/** Render a QR code for arbitrary text as an inline SVG string. */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#191d22', light: '#ffffff' },
  });
}
