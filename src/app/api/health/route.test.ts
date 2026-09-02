import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  listBuckets: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: () => true,
  createAdminClient: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { listBuckets: mocks.listBuckets },
  }),
}));
vi.mock('@/lib/server/sms', () => ({ smsEnabled: () => false }));

import { EXPECTED_SCHEMA_VERSION } from '@/lib/health';
import { GET } from './route';

const NOW = new Date('2026-09-02T04:00:00.000Z');

function healthRequest() {
  return new Request('http://localhost/api/health', {
    headers: { Authorization: 'Bearer test-secret' },
  });
}

type SchemaStatus = {
  complete: boolean;
  current: string;
  missing: string[];
};

const COMPLETE_SCHEMA: SchemaStatus = {
  complete: true,
  current: EXPECTED_SCHEMA_VERSION,
  missing: [],
};

function heartbeatAt(
  value: string | null,
  schemaStatus: SchemaStatus = COMPLETE_SCHEMA,
) {
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'app_schema_status') {
      return { data: schemaStatus, error: null };
    }
    if (name === 'operator_sweep_status') {
      return {
        data: value
          ? [{
              last_started_at: value,
              last_run_at: value,
              running_until: null,
              last_counts: { eventsAdvanced: 1 },
            }]
          : [],
        error: null,
      };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local-test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.CRON_SECRET = 'test-secret';
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.EMAIL_FROM = 'Switchboard <hello@example.com>';
  mocks.from.mockReturnValue({
    select: () => ({
      limit: async () => ({ error: null }),
    }),
  });
  mocks.listBuckets.mockResolvedValue({
    data: [{ id: 'media-private', public: false }],
    error: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_APP_URL',
    'CRON_SECRET',
    'RESEND_API_KEY',
    'EMAIL_FROM',
  ]) {
    delete process.env[key];
  }
});

describe('privileged health cron heartbeat', () => {
  it('goes red once the cascade heartbeat is older than five minutes', async () => {
    heartbeatAt(new Date(NOW.getTime() - 5 * 60 * 1000 - 1).toISOString());

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.services.cron).toBe(false);
    expect(body.problems).toContain('SB-CONFIG-CRON');
    expect(body.cronHeartbeat.staleAfterSeconds).toBe(300);
  });

  it('is healthy when the successful cascade run is recent', async () => {
    const lastRunAt = new Date(NOW.getTime() - 4 * 60 * 1000).toISOString();
    heartbeatAt(lastRunAt);

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.services.cron).toBe(true);
    expect(body.cronHeartbeat.lastRunAt).toBe(lastRunAt);
  });
});

describe('privileged health schema probe', () => {
  it('names the missing schema objects and goes red', async () => {
    heartbeatAt(new Date(NOW.getTime() - 60 * 1000).toISOString(), {
      complete: false,
      current: EXPECTED_SCHEMA_VERSION,
      missing: ['public.profiles.notify_plans', 'public.calendar_busy'],
    });

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.schema).toBe(false);
    expect(body.problems).toContain('SB-CONFIG-SCHEMA');
    expect(body.missingSchemaObjects).toEqual([
      'public.profiles.notify_plans',
      'public.calendar_busy',
    ]);
  });

  it('goes red when the database is behind the app', async () => {
    heartbeatAt(new Date(NOW.getTime() - 60 * 1000).toISOString(), {
      ...COMPLETE_SCHEMA,
      current: '20260731201812',
    });

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.schema).toBe(false);
    expect(body.schemaVersion).toBe('20260731201812');
    expect(body.expectedSchemaVersion).toBe(EXPECTED_SCHEMA_VERSION);
    expect(body.problems).toContain('SB-CONFIG-SCHEMA');
  });
});

describe('anonymous health', () => {
  it('returns only a liveness boolean and never probes the database', async () => {
    heartbeatAt(NOW.toISOString());

    const response = await GET(new Request('http://localhost/api/health'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.listBuckets).not.toHaveBeenCalled();
  });
});
