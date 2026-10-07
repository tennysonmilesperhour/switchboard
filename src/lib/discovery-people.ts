import { isFit, type Fit } from '@/lib/discovery-lanes';
import type { FactTier } from '@/components/profile/FactList';

export interface SharedFact {
  kind: 'school' | 'employer';
  label: string;
  tier: FactTier;
}

/** What `list_discovery_candidates` returns, with the JSON column made safe to read. */
export interface DiscoveryCandidateRow {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  tagline: string | null;
  blurb: string | null;
  location: string | null;
  pronouns: string | null;
  categories: string[] | null;
  contexts: string[] | null;
  shared_interests: string[] | null;
  shared_down_to: string[] | null;
  shared_facts: unknown;
  mutual_friend_count: number | null;
  fit: string | null;
}

export interface DiscoveryPerson {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  tagline: string | null;
  blurb: string | null;
  location: string | null;
  pronouns: string | null;
  categories: string[];
  contexts: string[];
  shared_interests: string[];
  shared_down_to: string[];
  shared_facts: SharedFact[];
  mutual_friend_count: number;
  fit: Fit;
}

export function parseSharedFacts(value: unknown): SharedFact[] {
  if (!Array.isArray(value)) return [];
  const facts: SharedFact[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { kind, label, tier } = entry as Record<string, unknown>;
    if ((kind !== 'school' && kind !== 'employer') || typeof label !== 'string') continue;
    facts.push({
      kind,
      label,
      tier: tier === 'email' || tier === 'vouched' ? tier : 'claimed',
    });
  }
  return facts;
}

export function toDiscoveryPerson(row: DiscoveryCandidateRow): DiscoveryPerson {
  return {
    id: row.id,
    display_name: row.display_name,
    handle: row.handle,
    avatar_url: row.avatar_url,
    tagline: row.tagline,
    blurb: row.blurb?.trim() ? row.blurb : null,
    location: row.location,
    pronouns: row.pronouns,
    categories: row.categories ?? [],
    contexts: row.contexts ?? [],
    shared_interests: row.shared_interests ?? [],
    shared_down_to: row.shared_down_to ?? [],
    shared_facts: parseSharedFacts(row.shared_facts),
    mutual_friend_count: row.mutual_friend_count ?? 0,
    fit: isFit(row.fit) ? row.fit : 'light',
  };
}
