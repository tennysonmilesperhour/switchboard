/** The database check shared by zone and board slugs: `^[a-z0-9-]{3,40}$`. */
export const MAX_SLUG = 40;
const SUFFIX_LENGTH = 5; // "-" plus four base-36 characters

/**
 * A URL slug from a display name. Accents are folded to their base letter
 * ("Café" is "cafe"), and a name with nothing left after that, such as one
 * written entirely in a non-Latin script, falls back to `fallback` so it can
 * still be created.
 */
export function slugBase(name: string, fallback: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '');
  return slug.length >= 3 ? slug : fallback;
}

/**
 * The slug to try on a given attempt. Attempt 0 is the plain base, unless the
 * base is only the fallback word; later attempts add a short random suffix, so
 * two groups with the same name in different towns both get created.
 */
export function slugCandidate(
  base: string,
  attempt: number,
  fallback: string,
  random: () => number = Math.random,
): string {
  if (attempt === 0 && base !== fallback) return base;
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  const head = base.slice(0, MAX_SLUG - SUFFIX_LENGTH).replace(/-+$/g, '');
  return `${head}-${suffix}`;
}
