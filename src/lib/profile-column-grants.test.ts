import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every `public.profiles` column the app reads has to be SELECT-grantable.
 *
 * `20260710120000_lock_sensitive_profile_columns.sql` (SB-01) dropped the
 * table-level SELECT grant on profiles and replaced it with an explicit column
 * allowlist, which makes the table fail-closed: a column added later is
 * unreadable by `anon`/`authenticated` until a migration names it. That is the
 * right default and it has now cost us twice, both times invisibly, because a
 * denied column fails the WHOLE query — so the call site sees "no profile row",
 * not "you may not read that":
 *
 *   - `appearance_theme` (20260812140000). Settings appeared to accept a theme
 *     and then revert to Switchboard a second later; the app never changed
 *     color. The UPDATE was always fine. Reading it back was denied, so the
 *     settings page rendered `profile` as null and the root layout fell into
 *     its `catch` and served the default palette.
 *   - `legal_terms_version` and friends (20260710130000, ten minutes after the
 *     allowlist). The proxy's `select('onboarded, legal_terms_version')` has
 *     been failing on every protected route, which quietly disabled both the
 *     onboarding funnel and the terms-update bounce.
 *
 * A migration reviewer cannot be expected to remember an allowlist written in a
 * different file two months earlier, so this test remembers instead. It reads
 * the migrations, works out which columns exist and which are granted, and
 * fails on anything that is neither granted nor listed below as deliberately
 * withheld — with the reason it is withheld written down next to it.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');

/**
 * Columns intentionally kept off the API surface, and how their owner reads
 * them instead. Adding a name here is a security decision, not a formality.
 */
const WITHHELD: Record<string, string> = {
  calendar_token:
    'SB-01: the bearer credential for the private calendar feed. Owners read it through my_private_profile().',
  contact_email:
    'SB-01: contact detail behind the contact_public opt-out. Owners read it through my_private_profile().',
  contact_phone:
    'SB-01: contact detail behind the contact_public opt-out. Owners read it through my_private_profile().',
  contact_phone_normalized:
    'SB-01: the match key for phone-based contact import; only security-definer functions compare against it.',
  digest_sent_at:
    'Send bookkeeping for the daily digest: written and read only by sweepDigests through the service-role client, which bypasses the allowlist. Nothing renders it.',
  home_latitude:
    'The exact point behind the city-density gate. Its owner reads it only through my_home_point(); Home receives one boolean.',
  home_longitude:
    'The exact point behind the city-density gate. Its owner reads it only through my_home_point(); Home receives one boolean.',
  last_signal_circle_id:
    'Private availability preference. Its owner reads it only through my_signal_default_circle().',
};

function migrationSources(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
    // Comments in this repo are long and quote SQL; strip them before parsing.
    .map((sql) => sql.replace(/--[^\n]*/g, ''));
}

/** Every column `public.profiles` has, whether created with the table or added later. */
function profileColumns(sources: string[]): Set<string> {
  const columns = new Set<string>();
  for (const sql of sources) {
    const created = sql.match(/create\s+table\s+public\.profiles\s*\(([\s\S]*?)\n\);/i);
    if (created) {
      for (const line of created[1].split('\n')) {
        const name = line.trim().split(/\s+/)[0];
        if (/^[a-z_][a-z0-9_]*$/.test(name)) columns.add(name);
      }
    }
    for (const alter of sql.matchAll(
      /alter\s+table\s+(?:only\s+)?public\.profiles\b([\s\S]*?);/gi,
    )) {
      for (const added of alter[1].matchAll(
        /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi,
      )) {
        columns.add(added[1]);
      }
    }
  }
  return columns;
}

/** Every column named in a `grant select (…) on public.profiles` statement. */
function grantedColumns(sources: string[]): Set<string> {
  const granted = new Set<string>();
  for (const sql of sources) {
    for (const grant of sql.matchAll(
      /grant\s+select\s*\(([^)]*)\)\s*on\s+public\.profiles\b/gi,
    )) {
      for (const name of grant[1].split(',')) granted.add(name.trim());
    }
  }
  return granted;
}

describe('profiles column SELECT grants', () => {
  const sources = migrationSources();
  const columns = profileColumns(sources);
  const granted = grantedColumns(sources);

  it('reads the migrations it is asserting about', () => {
    // A parser that silently matches nothing would pass every assertion below.
    expect(columns.size).toBeGreaterThan(20);
    expect(granted.size).toBeGreaterThan(20);
    expect(columns.has('appearance_theme')).toBe(true);
  });

  it('grants SELECT on every column that is not deliberately withheld', () => {
    const ungranted = [...columns]
      .filter((column) => !granted.has(column) && !(column in WITHHELD))
      .sort();
    expect(
      ungranted,
      `These public.profiles columns are unreadable by authenticated clients. ` +
        `SB-01 replaced the table-level SELECT grant with an allowlist, so a new ` +
        `column needs "grant select (<column>) on public.profiles to authenticated;" ` +
        `in its migration — or an entry in WITHHELD here saying how its owner reads ` +
        `it instead. Until then, any query naming the column fails whole and the ` +
        `caller sees an empty profile.`,
    ).toEqual([]);
  });

  it('does not grant a column that is documented as withheld', () => {
    const leaked = Object.keys(WITHHELD)
      .filter((column) => granted.has(column))
      .sort();
    expect(
      leaked,
      'A column listed as withheld is now granted. Either the grant is a ' +
        'mistake, or the reason in WITHHELD no longer holds and should go.',
    ).toEqual([]);
  });

  it('keeps WITHHELD honest about columns that still exist', () => {
    const gone = Object.keys(WITHHELD)
      .filter((column) => !columns.has(column))
      .sort();
    expect(gone, 'WITHHELD names a column public.profiles no longer has.').toEqual([]);
  });
});
