-- A board announcement can become a real plan, and the post remembers which.
--
-- Board posts are notices: "Saturday pickup game, 9am, usually the north field".
-- Nobody can say they're coming, nobody knows who else is in, and there is no
-- reminder — so the coordination that the post is *about* happens somewhere
-- else, or not at all. Turning one into a plan meant retyping it into the
-- wizard, and then the board still showed the old notice with no way through.
--
-- One column, because the relationship is genuinely one-directional and
-- optional: most posts never become plans, and a plan does not need to know it
-- came from a board.
--
-- `on delete set null` rather than cascade: deleting the plan must not delete
-- the announcement people are still reading. The post simply goes back to being
-- a notice, which is what it was.

alter table public.board_posts
  add column if not exists event_id uuid references public.events(id) on delete set null;

-- One plan per post. Tapping twice should not leave two half-populated plans
-- with the same title and the board pointing at whichever won the race.
create unique index if not exists board_posts_event_idx
  on public.board_posts (event_id)
  where event_id is not null;

-- How board members reach it:
--
-- Deliberately NOT a new visibility rule on events. `docs/AGENTS.md` is explicit
-- that `src/lib/share-link.ts` decides what an invite URL does, and that
-- `hostCanShare ⊆ canReadPlan` — inventing a second path by which a non-invitee
-- may read a plan is exactly the drift that broke invite links repeatedly. The
-- plan is created with its share link on, and the post links to it, so a board
-- member follows the same URL a host would text anyone. One answer to "who may
-- read this", already tested.
