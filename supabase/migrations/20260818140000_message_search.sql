-- Full-text search over room messages.
--
-- Rooms accumulate the details that plans are actually made of — the address
-- someone pasted, what they said they'd bring, the time that got moved. Finding
-- any of it again meant scrolling, and the longer a room had been useful the
-- worse that got.
--
-- A GIN index over `to_tsvector('english', body)`, so PostgREST's `websearch`
-- operator has something to use. Without it every search is a sequential scan
-- of every message the searcher can see, which is fine on a demo and not fine
-- on a room a year old.
--
-- `'english'` is a deliberate, stated limitation rather than an oversight:
-- stemming is language-specific, and a mixed-language room will match less well
-- than a monolingual one. The alternative — `'simple'`, which does no stemming —
-- would mean "bringing" never matches "bring", which is worse for the common
-- case. Revisit when there are enough non-English rooms to measure.
--
-- IMMUTABLE-safe: `to_tsvector(regconfig, text)` is immutable, the single-arg
-- form is not, so the config is named explicitly. Postgres rejects the other
-- form in an index expression, which is a good error to have hit here rather
-- than at query time.

create index if not exists messages_body_search_idx
  on public.messages
  using gin (to_tsvector('english', body));

-- No policy changes, on purpose.
--
-- `messages_select` already scopes reads to rooms the caller is a member of.
-- Search runs through the caller's own client and therefore inherits exactly
-- that: a message a searcher could not open cannot be found by searching for
-- it. Adding a search-specific accessor — or reaching for the admin client to
-- "make search fast" — would be a second answer to "who may read this message",
-- and the second answer is the one that leaks.
