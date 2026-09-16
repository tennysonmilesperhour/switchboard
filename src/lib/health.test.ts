import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  evaluateSchemaStatus,
  EXPECTED_SCHEMA_VERSION,
} from './health';

describe('schema health', () => {
  it('requires unique migration versions and pins health to the newest', () => {
    const versions = readdirSync(join(process.cwd(), 'supabase/migrations'))
      .map((name) => /^(\d{14})_.*\.sql$/.exec(name)?.[1])
      .filter((version): version is string => Boolean(version))
      .sort();

    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.at(-1)).toBe(EXPECTED_SCHEMA_VERSION);
  });

  it('accepts the exact current version with no missing schema objects', () => {
    expect(
      evaluateSchemaStatus(
        {
          complete: true,
          current: EXPECTED_SCHEMA_VERSION,
          missing: [],
        },
        null,
      ),
    ).toEqual({
      current: EXPECTED_SCHEMA_VERSION,
      healthy: true,
      missing: [],
    });
  });

  it('reports missing object names and marks the schema unhealthy', () => {
    expect(
      evaluateSchemaStatus(
        {
          complete: false,
          current: EXPECTED_SCHEMA_VERSION,
          missing: ['public.profiles.notify_plans', 42, null],
        },
        null,
      ),
    ).toEqual({
      current: EXPECTED_SCHEMA_VERSION,
      healthy: false,
      missing: ['public.profiles.notify_plans'],
    });
  });

  it('fails closed on an RPC error or stale version', () => {
    const complete = {
      complete: true,
      current: EXPECTED_SCHEMA_VERSION,
      missing: [],
    };

    expect(evaluateSchemaStatus(complete, new Error('unreachable')).healthy).toBe(
      false,
    );
    expect(
      evaluateSchemaStatus({ ...complete, current: '20260731201812' }, null)
        .healthy,
    ).toBe(false);
  });
});
