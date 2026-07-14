-- Close the plan loop. Past-ness was only ever inferred from starts_at; this
-- makes "it happened" an explicit, host-affirmed transition so we can show a
-- real-world recap ("you got N people together") and offer a one-tap Run It
-- Back. The event status also moves to 'past' (a value the enum already allows
-- but nothing wrote before), which drops it out of the active /plans list.

alter table public.events
  add column if not exists happened_at timestamptz;
