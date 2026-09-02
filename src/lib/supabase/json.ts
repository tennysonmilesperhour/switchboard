import type { Json } from './database.types';
import type { ProfileLink, ProfileSocial } from '@/lib/types';

/**
 * Convert a value at a JSON column/RPC boundary using the same semantics as
 * PostgreSQL's JSON transport. Callers retain useful domain types internally;
 * only the serialized value crosses into Supabase.
 */
export function toJson(value: unknown): Json {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('Value is not JSON serializable');
  }
  return JSON.parse(serialized) as Json;
}

export function isJsonObject(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseProfileLinks(value: Json): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isJsonObject(entry) || typeof entry.label !== 'string' || typeof entry.url !== 'string') {
      return [];
    }
    return [{ label: entry.label, url: entry.url }];
  });
}

export function parseProfileSocials(value: Json): ProfileSocial[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (
      !isJsonObject(entry) ||
      typeof entry.platform !== 'string' ||
      typeof entry.value !== 'string'
    ) {
      return [];
    }
    return [{ platform: entry.platform, value: entry.value }];
  });
}
