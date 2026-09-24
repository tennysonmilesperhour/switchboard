/**
 * The address part of a zone's URL, from its name.
 *
 * The slug was the name, lower-cased with everything but a-z, 0-9 and spaces
 * thrown away, and it had to be unique. So a zone name was a global namespace:
 * a second "Book club" anywhere was refused as "That zone name is taken", and a
 * name with no Latin letters in it - "東京", "Кафе" - slugged down to nothing
 * and was refused as shorter than three letters. The name is what people see;
 * the slug only has to be a working address, so it falls back and it varies.
 */

/** `zones.slug` is CHECKed against `^[a-z0-9-]{3,40}$`. */
const MAX_SLUG = 40;
const MAX_BASE = MAX_SLUG;
const SUFFIX = 5; // "-" + four characters

/** The readable part of the slug, or `zone` when the name offers none. */
export function zoneSlugBase(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : 'zone';
}

/** The slug to try on `attempt` (0 = the bare base, then with a short suffix). */
export function zoneSlugCandidate(base: string, attempt: number, random = Math.random): string {
  if (attempt === 0 && base !== 'zone') return base;
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  const room = base.slice(0, MAX_SLUG - SUFFIX).replace(/-+$/g, '');
  return `${room}-${suffix}`;
}
