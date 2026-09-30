/**
 * Test support for `event-page.test.ts` and `event-page-plan.test.ts`: an
 * in-memory stand-in for the two Supabase clients the plan page loader uses,
 * plus one plan's worth of rows. Not imported by application code.
 *
 * The fake honours what the loader actually asks for — `eq`/`in`/`ilike`/`or`
 * filters, `order`, `limit`, `count`/`head`, and the column list of every
 * `select` — so a test can say "a guest's page never carries a guest's contact"
 * and have it follow from the loader's queries rather than from the fixture.
 * Embedded relations (`invitee:profiles(...)`) are stored pre-joined on the row
 * under their alias and returned only when the select names them.
 */
import { vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

export type Row = Record<string, unknown>;
export type DbError = { code?: string; message: string };
type Client = 'session' | 'admin';

export interface Query {
  client: Client;
  table: string;
  columns: string;
  head: boolean;
  filters: Array<[op: string, column: string, value: unknown]>;
  limit: number | null;
}

export const db = {
  tables: {} as Record<string, Row[]>,
  rpc: {} as Record<string, (args: Row) => unknown>,
  queries: [] as Query[],
  rpcCalls: [] as Array<{ client: Client; name: string; args: Row }>,
};

/** Relation aliases the fixtures store pre-joined; `*` never includes them. */
const EMBEDS = new Set(['host', 'cohost', 'invitee', 'delivery_attempts', 'author', 'invite', 'requester', 'addressee']);

function topLevelItems(columns: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of columns) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      items.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function project(row: Row, columns: string): Row {
  const out: Row = {};
  for (const item of topLevelItems(columns)) {
    const embed = /^(?:(\w+):)?(\w+)(?:!\w+)?\(/.exec(item);
    if (embed) {
      const key = embed[1] ?? embed[2];
      out[key] = row[key] ?? null;
    } else if (item === '*') {
      for (const [key, value] of Object.entries(row)) if (!EMBEDS.has(key)) out[key] = value;
    } else {
      out[item] = row[item] ?? null;
    }
  }
  return out;
}

/** PostgREST `ilike`, honouring `likeLiteral`'s backslash escapes. */
function ilikeRegex(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '\\') source += pattern[++index]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? '';
    else if (char === '%') source += '.*';
    else if (char === '_') source += '.';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i');
}

function matches(row: Row, [op, column, value]: Query['filters'][number]): boolean {
  if (op === 'eq') return row[column] === value;
  if (op === 'in') return (value as unknown[]).includes(row[column]);
  if (op === 'ilike') return ilikeRegex(String(value)).test(String(row[column] ?? ''));
  if (op === 'or') {
    return String(value)
      .split(',')
      .some((clause) => {
        const [col, clauseOp, ...rest] = clause.split('.');
        return clauseOp === 'eq' && row[col] === rest.join('.');
      });
  }
  throw new Error(`fake db: unsupported filter ${op}`);
}

function tableQuery(client: Client, table: string, forcedError: DbError | null = null) {
  const query: Query = { client, table, columns: '*', head: false, filters: [], limit: null };
  const orders: Array<{ column: string; ascending: boolean }> = [];
  db.queries.push(query);

  const settle = () => {
    if (forcedError) return { data: null, error: forcedError, count: null };
    let rows = (db.tables[table] ?? []).filter((row) => query.filters.every((filter) => matches(row, filter)));
    rows = [...rows].sort((left, right) => {
      for (const { column, ascending } of orders) {
        const a = left[column] as string | number;
        const b = right[column] as string | number;
        if (a < b) return ascending ? -1 : 1;
        if (a > b) return ascending ? 1 : -1;
      }
      return 0;
    });
    const count = rows.length;
    if (query.limit !== null) rows = rows.slice(0, query.limit);
    return { data: query.head ? null : rows.map((row) => project(row, query.columns)), error: null, count };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select(columns = '*', options: { count?: string; head?: boolean } = {}) {
      query.columns = columns;
      query.head = Boolean(options.head);
      return chain;
    },
    eq: (column: string, value: unknown) => (query.filters.push(['eq', column, value]), chain),
    in: (column: string, value: unknown[]) => (query.filters.push(['in', column, value]), chain),
    ilike: (column: string, value: string) => (query.filters.push(['ilike', column, value]), chain),
    or: (expression: string) => (query.filters.push(['or', '', expression]), chain),
    order: (column: string, options: { ascending?: boolean } = {}) => {
      orders.push({ column, ascending: options.ascending ?? true });
      return chain;
    },
    limit: (count: number) => ((query.limit = count), chain),
    returns: () => chain,
    maybeSingle: async () => {
      const result = settle();
      return { ...result, data: result.data?.[0] ?? null };
    },
    single: async () => {
      const result = settle();
      if (result.error) return result;
      return result.data?.length === 1
        ? { ...result, data: result.data[0] }
        : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, count: null };
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  };
  return chain;
}

function rpcCall(client: Client, name: string, args: Row = {}) {
  db.rpcCalls.push({ client, name, args });
  const handler = db.rpc[name];
  if (!handler) throw new Error(`fake db: unexpected ${client} rpc ${name}`);
  return Promise.resolve({ data: handler(args), error: null });
}

export const clients = {
  sessionFrom: vi.fn(),
  adminFrom: vi.fn(),
  sessionRpc: vi.fn(),
  adminRpc: vi.fn(),
  createAdminClient: vi.fn(),
};

export const session = {
  from: (table: string) => clients.sessionFrom(table),
  rpc: (name: string, args?: Row) => clients.sessionRpc(name, args),
};
export const admin = {
  from: (table: string) => clients.adminFrom(table),
  rpc: (name: string, args?: Row) => clients.adminRpc(name, args),
};

/** Name-keyed defaults: every table and RPC reads the in-memory rows. */
export function restoreDefaults(): void {
  clients.sessionFrom.mockReset().mockImplementation((table: string) => tableQuery('session', table));
  clients.adminFrom.mockReset().mockImplementation((table: string) => tableQuery('admin', table));
  clients.sessionRpc.mockReset().mockImplementation((name: string, args?: Row) => rpcCall('session', name, args));
  clients.adminRpc.mockReset().mockImplementation((name: string, args?: Row) => rpcCall('admin', name, args));
  clients.createAdminClient.mockReset().mockImplementation(() => admin);
}

/** Make one table's reads fail through one client, leaving the rest as they were. */
export function failTable(client: Client, table: string, error: DbError): void {
  const from = client === 'session' ? clients.sessionFrom : clients.adminFrom;
  from.mockImplementation((name: string) => tableQuery(client, name, name === table ? error : null));
}

/** RLS: the viewer's own session cannot see this plan (a stranger, or no plan). */
export function hidePlanFromViewer(): void {
  clients.sessionFrom.mockImplementation((name: string) =>
    name === 'events' ? tableQuery('session', name, null).eq('id', '__hidden_by_rls__') : tableQuery('session', name),
  );
}

export function queriesOn(client: Client, table: string): Query[] {
  return db.queries.filter((query) => query.client === client && query.table === table);
}

export function rpcCallsTo(name: string) {
  return db.rpcCalls.filter((call) => call.name === name);
}

export const asUser = (id: string) => ({ id }) as User;

// ---- One plan's worth of rows -------------------------------------------------

export const PLAN_ID = 'plan-1';
export const HOST = 'u-host';
export const COHOST = 'u-cohost';
export const YES = 'u-yes';
export const HELD = 'u-held';
export const SENT = 'u-sent';
export const NO = 'u-no';
export const QUEUED = 'u-queued';
export const FRIEND = 'u-friend';
export const STRANGER = 'u-stranger';

/** Contact details and RSVP tokens only the host typed or holds. */
export const PRIVATE_STRINGS = ['sam@example.com', 'tok-sam', 'ada@example.com', 'tok-ada', 'parent@example.com'];

const profile = (id: string, display_name: string, handle: string) => ({ id, display_name, handle, avatar_url: `${handle}.png` });

function invite(id: string, patch: Row): Row {
  return {
    id,
    event_id: PLAN_ID,
    invitee_id: null,
    guest_name: null,
    guest_contact: null,
    guest_token: null,
    status: 'sent',
    position: 0,
    invitee: null,
    delivery_attempts: [],
    ...patch,
  };
}

export function seedPlan(eventPatch: Row = {}): void {
  db.queries = [];
  db.rpcCalls = [];
  db.tables = {
    events: [
      {
        id: PLAN_ID,
        host_id: HOST,
        title: 'Taco night',
        description: 'Bring salsa',
        status: 'inviting',
        starts_at: '2026-10-10T01:00:00.000Z',
        ends_at: null,
        time_zone: 'America/Los_Angeles',
        location_name: 'Casa Azul',
        location_address: '1 Main St',
        show_accepted: true,
        show_invite_list: false,
        parental_approval: true,
        share_link_active: true,
        share_token: 'share-tok',
        cancel_voice_url: null,
        capacity: 8,
        room_id: 'room-1',
        host: { ...profile(HOST, 'Hana', 'hana'), tagline: null, timezone: 'America/New_York' },
        ...eventPatch,
      },
    ],
    invites: [
      invite('inv-yes', { invitee_id: YES, status: 'accepted', position: 0, invitee: profile(YES, 'Yara', 'yara'), delivery_attempts: [{ channel: 'in_app', status: 'sent', attempted_at: '2026-09-01T10:00:00Z' }] }),
      invite('inv-held', { invitee_id: HELD, status: 'pending_approval', position: 1, invitee: profile(HELD, 'Hal', 'hal') }),
      invite('inv-sent', {
        invitee_id: SENT,
        position: 2,
        invitee: profile(SENT, 'Sam', 'sam.b'),
        delivery_attempts: [
          { channel: 'email', status: 'failed', attempted_at: '2026-09-01T10:00:00Z' },
          { channel: 'email', status: 'sent', attempted_at: '2026-09-02T10:00:00Z' },
          { channel: 'in_app', status: 'sent', attempted_at: '2026-09-01T10:00:00Z' },
        ],
      }),
      invite('inv-no', { invitee_id: NO, status: 'declined', position: 3, invitee: profile(NO, 'Nia', 'nia') }),
      invite('inv-queued', { invitee_id: QUEUED, status: 'queued', position: 4, invitee: profile(QUEUED, 'Quinn', 'quinn') }),
      invite('inv-cohost', { invitee_id: COHOST, status: 'accepted', position: 5, invitee: profile(COHOST, 'Cora', 'cora') }),
      invite('inv-sam', { guest_name: 'Sam', guest_contact: 'sam@example.com', guest_token: 'tok-sam', position: 6 }),
      invite('inv-ada', { guest_name: 'ada@example.com', guest_contact: 'ada@example.com', guest_token: 'tok-ada', status: 'accepted', position: 7 }),
      invite('inv-other-plan', { event_id: 'plan-2', invitee_id: YES, status: 'accepted', position: 0 }),
    ],
    sms_jobs: [
      { invite_id: 'inv-sam', status: 'queued', created_at: '2026-09-02T00:00:00Z' },
      { invite_id: 'inv-sam', status: 'delivered', created_at: '2026-09-03T00:00:00Z' },
    ],
    event_cohosts: [{ event_id: PLAN_ID, cohost_id: COHOST, cohost: { display_name: 'Cora' } }],
    connections: [
      { requester_id: HOST, addressee_id: FRIEND, status: 'accepted', requester: profile(HOST, 'Hana', 'hana'), addressee: { ...profile(FRIEND, 'Fern', 'fern'), sabbatical: true, sabbatical_message: ' Back in May ' } },
      { requester_id: YES, addressee_id: HOST, status: 'accepted', requester: profile(YES, 'Yara', 'yara'), addressee: profile(HOST, 'Hana', 'hana') },
      { requester_id: HOST, addressee_id: 'u-pending', status: 'pending', requester: profile(HOST, 'Hana', 'hana'), addressee: profile('u-pending', 'Pip', 'pip') },
      { requester_id: 'u-a', addressee_id: 'u-b', status: 'accepted', requester: profile('u-a', 'Ash', 'ash'), addressee: profile('u-b', 'Bo', 'bo') },
    ],
    event_questions: [
      { id: 'q-song', event_id: PLAN_ID, prompt: 'Song request?', position: 1 },
      { id: 'q-diet', event_id: PLAN_ID, prompt: 'Dietary needs?', position: 0 },
    ],
    invite_answers: [
      { invite_id: 'inv-sam', question_id: 'q-song', answer: 'Toto', invite: { guest_name: 'Sam', invitee: null } },
      { invite_id: 'inv-sent', question_id: 'q-diet', answer: 'Vegan', invite: { guest_name: null, invitee: { display_name: 'Sam' } } },
      { invite_id: 'inv-sam', question_id: 'q-diet', answer: 'None', invite: { guest_name: 'Sam', invitee: null } },
      { invite_id: 'inv-elsewhere', question_id: 'q-other-plan', answer: 'Not yours', invite: { guest_name: 'Other', invitee: null } },
    ],
    announcements: [
      { id: 'a-1', event_id: PLAN_ID, body: 'Parking is behind', created_at: '2026-09-20T00:00:00Z', author: { display_name: 'Hana' } },
      { id: 'a-2', event_id: PLAN_ID, body: 'Bring a jacket', created_at: '2026-09-21T00:00:00Z', author: null },
    ],
    event_comments: [
      { id: 'c-1', event_id: PLAN_ID, body: 'First!  so\n excited', voice_url: null, voice_duration_seconds: null, created_at: '2026-09-20T01:00:00Z', author_id: YES, reply_to_id: null, author: { display_name: 'Yara' } },
      { id: 'c-2', event_id: PLAN_ID, body: 'Same', voice_url: null, voice_duration_seconds: null, created_at: '2026-09-20T02:00:00Z', author_id: HOST, reply_to_id: 'c-1', author: { display_name: 'Hana' } },
      { id: 'c-3', event_id: PLAN_ID, body: null, voice_url: 'voice/c-3.webm', voice_duration_seconds: 4, created_at: '2026-09-20T03:00:00Z', author_id: SENT, reply_to_id: 'c-2', author: { display_name: 'Sam' } },
    ],
    give_space_notices: [{ user_id: YES, event_id: PLAN_ID, warned: true }],
    parental_approvals: [
      { event_id: PLAN_ID, invite_id: 'inv-held', status: 'pending', guardian_email: 'parent@example.com', guardian_name: 'Pat', email_status: 'sent', created_at: '2026-09-20T00:00:00Z' },
      { event_id: PLAN_ID, invite_id: 'inv-no', status: 'denied', guardian_email: 'nia.mom@example.com', guardian_name: null, email_status: 'sent', created_at: '2026-09-19T00:00:00Z' },
    ],
    venues: [
      { name: 'Casa Azul Annex', perk: 'Not this one', status: 'verified' },
      { name: 'casa azul', perk: 'Unverified', status: 'pending' },
      { name: 'Casa Azul', perk: 'Free chips', status: 'verified' },
    ],
    calendar_busy: [
      { user_id: SENT, slot: '2026-10-07T01:00:00.000Z' },
      { user_id: YES, slot: '2026-10-06T16:00:00.000Z' },
    ],
    polls: [],
    poll_options: [],
    poll_votes: [],
  };
  db.rpc = {
    calendar_subscription_status: () => [],
    poll_results: () => [],
    event_invite_list: () => [],
  };
}
