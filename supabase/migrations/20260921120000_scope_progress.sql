-- Shared progress on the scope-of-work checklist.
--
-- Until now the checklist's ticks lived in `localStorage` and nowhere else, so
-- they existed only in the browser that made them. The client could walk the
-- whole list and the person who sent her the link had no way to see any of it —
-- not because it was hidden, but because it had never been sent anywhere. This
-- table is where a tick goes now.
--
-- One row per item, shared by everyone who opens the link. There is deliberately
-- no notion of "her progress" versus "his": the page is one board that two
-- people look at, which is what makes the link worth sending.
--
-- Like `client_feedback`, this is written by people with no account, so it keeps
-- RLS on with NO policies and is reached only through
-- `/api/scope-progress`, which holds the service key and adds the rate limit and
-- the bounds a table cannot. The difference from `client_feedback` is that this
-- one is also READ through that route by anyone holding the URL — the owner
-- asked for the board to be visible to anyone with the link, with no account.
-- See `docs/SECURITY.md`.

create table if not exists public.scope_progress (
  -- The checklist's own item id ("A1", "J6"). Free text rather than a foreign
  -- key because the list lives in a static HTML file, not in this database.
  item_id text primary key,

  checked boolean not null default true,
  updated_at timestamptz not null default now(),

  -- Optional, whatever the person typed. Never trusted as identity; only
  -- quoted back so the board can say who ticked something.
  updated_by text,

  -- The shape of a real checklist id. This is the cap on how big an open,
  -- unauthenticated write surface can make the table: without it, anything
  -- could be used as a key and the row count would be unbounded.
  constraint scope_progress_item_id_shape
    check (item_id ~ '^[A-Z][0-9]{1,3}$'),
  constraint scope_progress_updated_by_bounded
    check (updated_by is null or char_length(updated_by) <= 80)
);

alter table public.scope_progress enable row level security;

-- No policies, on purpose. `anon` and `authenticated` cannot touch this table
-- directly; the route mediates every read and write so the rate limit cannot be
-- bypassed by going straight to the database.

create index if not exists scope_progress_updated_at_idx
  on public.scope_progress (updated_at desc);
