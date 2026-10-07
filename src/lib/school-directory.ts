/**
 * Where someone went to school or works, and how much we believe it.
 *
 * A fact carries a trust tier the owner cannot write:
 *   claimed  they typed it
 *   email    they opened a link mailed to an address on that org's domain
 *   vouched  two email-verified connections for the same org confirmed it
 *
 * This module is the pure half of the email tier: given an address, which org
 * does its domain prove, and does that agree with what the person claimed? It
 * exists so "I went to UVU" cannot be verified with a BYU address. It does not
 * promise anything a determined liar can't get around (someone can keep a
 * `.edu` address, or borrow one), which is why the tier is shown as a label,
 * not a guarantee, and why the address itself is never kept: only the domain.
 */

export type FactKind = 'school' | 'employer';

export const FACT_KINDS: readonly FactKind[] = ['school', 'employer'];

export interface Org {
  kind: FactKind;
  /** Stable key two people share when they mean the same place. */
  key: string;
  /** What we call it. */
  label: string;
  /** True when the directory knows it; false when derived from the domain. */
  known: boolean;
}

interface DirectoryEntry {
  key: string;
  label: string;
  domains: string[];
  aliases: string[];
}

/**
 * Schools the directory can name. Anything else ending in `.edu` still
 * verifies, as itself, under its domain. Aliases are matched exactly after
 * normalising, so "byu" and "byuh" stay different places.
 */
const SCHOOLS: readonly DirectoryEntry[] = [
  { key: 'byu', label: 'Brigham Young University', domains: ['byu.edu'], aliases: ['byu', 'brigham young university', 'brigham young'] },
  { key: 'byuh', label: 'BYU-Hawaii', domains: ['byuh.edu'], aliases: ['byuh', 'byu hawaii', 'byu-hawaii', 'brigham young university hawaii'] },
  { key: 'byui', label: 'BYU-Idaho', domains: ['byui.edu'], aliases: ['byui', 'byu idaho', 'byu-idaho', 'brigham young university idaho'] },
  { key: 'uvu', label: 'Utah Valley University', domains: ['uvu.edu'], aliases: ['uvu', 'utah valley university', 'utah valley'] },
  { key: 'utah', label: 'University of Utah', domains: ['utah.edu'], aliases: ['university of utah', 'u of u', 'uofu', 'the u', 'utah', 'univ of utah'] },
  { key: 'usu', label: 'Utah State University', domains: ['usu.edu'], aliases: ['usu', 'utah state university', 'utah state'] },
  { key: 'weber', label: 'Weber State University', domains: ['weber.edu'], aliases: ['weber state university', 'weber state', 'weber'] },
  { key: 'suu', label: 'Southern Utah University', domains: ['suu.edu'], aliases: ['suu', 'southern utah university', 'southern utah'] },
  { key: 'utahtech', label: 'Utah Tech University', domains: ['utahtech.edu'], aliases: ['utah tech university', 'utah tech', 'dixie state', 'dixie state university'] },
  { key: 'westminster', label: 'Westminster University', domains: ['westminsteru.edu'], aliases: ['westminster university', 'westminster college', 'westminster'] },
  { key: 'slcc', label: 'Salt Lake Community College', domains: ['slcc.edu'], aliases: ['slcc', 'salt lake community college'] },
  { key: 'snow', label: 'Snow College', domains: ['snow.edu'], aliases: ['snow college', 'snow'] },
  { key: 'harvard', label: 'Harvard University', domains: ['harvard.edu'], aliases: ['harvard', 'harvard university'] },
  { key: 'stanford', label: 'Stanford University', domains: ['stanford.edu'], aliases: ['stanford', 'stanford university'] },
  { key: 'mit', label: 'MIT', domains: ['mit.edu'], aliases: ['mit', 'massachusetts institute of technology'] },
  { key: 'yale', label: 'Yale University', domains: ['yale.edu'], aliases: ['yale', 'yale university'] },
  { key: 'princeton', label: 'Princeton University', domains: ['princeton.edu'], aliases: ['princeton', 'princeton university'] },
  { key: 'columbia', label: 'Columbia University', domains: ['columbia.edu'], aliases: ['columbia', 'columbia university'] },
  { key: 'cornell', label: 'Cornell University', domains: ['cornell.edu'], aliases: ['cornell', 'cornell university'] },
  { key: 'nyu', label: 'New York University', domains: ['nyu.edu'], aliases: ['nyu', 'new york university'] },
  { key: 'berkeley', label: 'UC Berkeley', domains: ['berkeley.edu'], aliases: ['berkeley', 'uc berkeley', 'university of california berkeley'] },
  { key: 'ucla', label: 'UCLA', domains: ['ucla.edu'], aliases: ['ucla', 'university of california los angeles'] },
  { key: 'asu', label: 'Arizona State University', domains: ['asu.edu'], aliases: ['asu', 'arizona state university', 'arizona state'] },
  { key: 'cu', label: 'University of Colorado Boulder', domains: ['colorado.edu'], aliases: ['cu boulder', 'university of colorado boulder', 'university of colorado', 'colorado boulder'] },
];

/** Mail providers: an address there proves nothing about an employer. */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com',
  'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'mail.com',
  'yandex.com', 'zoho.com', 'fastmail.com', 'hey.com', 'comcast.net',
  'verizon.net', 'att.net', 'sbcglobal.net', 'duck.com',
]);

/** Public suffixes with two labels, where the registrable domain has three. */
const TWO_LABEL_SUFFIXES = new Set([
  'co.uk', 'ac.uk', 'org.uk', 'com.au', 'edu.au', 'co.nz', 'ac.nz', 'co.jp',
  'ac.jp', 'co.in', 'ac.in', 'com.br', 'edu.br', 'co.za', 'ac.za',
]);

/** Lowercase letters and digits only, so "U of U" and "u-of-u" compare equal. */
export function normalizeKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeAlias(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const SCHOOL_BY_ALIAS = new Map<string, DirectoryEntry>();
const SCHOOL_BY_DOMAIN = new Map<string, DirectoryEntry>();
for (const entry of SCHOOLS) {
  SCHOOL_BY_ALIAS.set(normalizeAlias(entry.label), entry);
  for (const alias of entry.aliases) SCHOOL_BY_ALIAS.set(normalizeAlias(alias), entry);
  for (const domain of entry.domains) SCHOOL_BY_DOMAIN.set(domain, entry);
}

/** Tidy what someone typed into a fact: one line, single spaces, 80 characters. */
export function cleanFactLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().slice(0, 80);
}

/**
 * The org a typed claim names. Schools the directory knows share one key
 * however they were spelled, so a claimed "BYU" and a verified "Brigham Young
 * University" are the same place; everything else keys on the letters typed.
 */
export function orgFromClaim(kind: FactKind, label: string): Org | null {
  const cleaned = cleanFactLabel(label);
  const key = normalizeKey(cleaned);
  if (cleaned.length < 2 || key.length < 2) return null;
  if (kind === 'school') {
    const known = SCHOOL_BY_ALIAS.get(normalizeAlias(cleaned));
    if (known) return { kind, key: known.key, label: known.label, known: true };
  }
  return { kind, key: key.slice(0, 80), label: cleaned, known: false };
}

/** The part of an address after the last `@`, lowercased, or null if unusable. */
export function emailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254) return null;
  const match = /^[^\s@]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/.exec(trimmed);
  return match ? match[1] : null;
}

/** `student.uvu.edu` -> `uvu.edu`, `mail.acme.co.uk` -> `acme.co.uk`. */
export function registrableDomain(domain: string): string {
  const labels = domain.split('.');
  if (labels.length <= 2) return domain;
  const lastTwo = labels.slice(-2).join('.');
  return labels.slice(TWO_LABEL_SUFFIXES.has(lastTwo) ? -3 : -2).join('.');
}

function isSchoolDomain(domain: string): boolean {
  return (
    domain.endsWith('.edu') ||
    domain.endsWith('.ac.uk') ||
    domain.endsWith('.edu.au') ||
    domain.endsWith('.ac.nz') ||
    domain.endsWith('.ac.jp') ||
    domain.endsWith('.ac.in')
  );
}

export type DomainOrg =
  | { ok: true; school: Org | null; employer: Org | null; domain: string }
  | { ok: false; reason: 'invalid' | 'free_mail' };

/**
 * What an address proves. A school domain proves a school; any non-free domain
 * can prove an employer (a university staff address proves both). A free-mail
 * address proves neither.
 */
export function orgsFromEmail(email: string): DomainOrg {
  const raw = emailDomain(email);
  if (!raw) return { ok: false, reason: 'invalid' };
  const domain = registrableDomain(raw);
  if (FREE_MAIL.has(domain)) return { ok: false, reason: 'free_mail' };

  const stem = domain.split('.')[0];
  const entry = SCHOOL_BY_DOMAIN.get(domain);
  const school: Org | null = entry
    ? { kind: 'school', key: entry.key, label: entry.label, known: true }
    : isSchoolDomain(domain)
      ? { kind: 'school', key: stem, label: domain, known: false }
      : null;
  const employer: Org = entry
    ? { kind: 'employer', key: entry.key, label: entry.label, known: true }
    : { kind: 'employer', key: stem, label: domain, known: false };
  return { ok: true, school, employer, domain };
}

export type FactEmailCheck =
  | { ok: true; org: Org; domain: string }
  | {
      ok: false;
      reason: 'invalid' | 'free_mail' | 'not_a_school' | 'different_org';
      /** For `different_org`: the place the address actually belongs to. */
      actual?: string;
    };

/**
 * May this address verify this fact? The address decides the org; the claim only
 * has to not contradict it. A typed "BYU" with a UVU address is refused by name,
 * so the person is told the truth rather than silently verified as somewhere
 * else. A claim the directory does not know is replaced by what the domain
 * proves, since the domain is the only thing that was verified.
 */
export function checkFactEmail(
  fact: { kind: FactKind; label: string },
  email: string,
): FactEmailCheck {
  const orgs = orgsFromEmail(email);
  if (!orgs.ok) return { ok: false, reason: orgs.reason };

  const org = fact.kind === 'school' ? orgs.school : orgs.employer;
  if (!org) return { ok: false, reason: 'not_a_school' };

  const claimed = orgFromClaim(fact.kind, fact.label);
  if (claimed?.known && claimed.key !== org.key) {
    return { ok: false, reason: 'different_org', actual: org.label };
  }
  return { ok: true, org, domain: orgs.domain };
}

/** Plain-language account of a refusal, for the person who tried. */
export function describeFactEmailRefusal(check: Extract<FactEmailCheck, { ok: false }>): string {
  switch (check.reason) {
    case 'invalid':
      return 'That doesn’t look like an email address.';
    case 'free_mail':
      return 'That’s a personal email provider, so it can’t show where you studied or work. Use your school or work address.';
    case 'not_a_school':
      return 'That address doesn’t look like a school address. School addresses usually end in .edu.';
    case 'different_org':
      return `That address belongs to ${check.actual ?? 'a different place'}, not the one you listed. Change the entry or use a matching address.`;
  }
}
