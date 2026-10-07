---
category: Plans
---
The signature plan card: a full-bleed color gradient, a big display title, who is going, and the time and place. Three variants fit the feed, a list, and a grid.

## When to use

Every plan, everywhere. `title` is required; everything else is optional and the card lays out around what it gets.

- `variant="full"` (default): the home feed card, 26rem tall, title centered, `actions` row at the bottom. Pass Buttons as `actions`.
- `variant="compact"`: a one-row card for lists. Title, cluster, when, where, with date and distance on the right.
- `variant="tile"`: a 4:5 tile for grids. The cover photo shows in full here; on the other variants it is a faint texture.
- `color`: one of `pink`, `purple`, `blue`, `jade`, `orange`, `magenta`. Use `planColor(i)` to rotate through them by position. Every color keeps white text at WCAG AA in every theme.
- `attendees` is `{ name, src? }[]`, rendered as an AvatarCluster. `attendeesLabel` is the sentence under it ("You and 3 others").
- `when`, `dateLabel`, `where`, `distance`, `status` are plain strings. `status` is the small uppercase pill ("Deciding", "Confirmed").
- `href` wraps the card in a link.

## Rules

- Do not put a PlanCard inside a Card. It is its own surface.
- Keep `actions` to two Buttons, usually `accept` plus `secondary`.
- Never hardcode a gradient. The `color` prop resolves through the theme's plan tokens.

## Example

```tsx
<PlanCard
  title="Sunset ramen run"
  color={planColor(0)}
  status="Deciding"
  attendees={[{ name: 'Priya N' }, { name: 'Marcus Lee' }, { name: 'Jo Alvarez' }]}
  attendeesLabel="You and 3 others"
  when="Fri 7:30pm"
  dateLabel="Oct 10"
  where="Nopa, Divisadero"
  distance="1.2 mi"
  actions={<><Button variant="accept">I am in</Button><Button variant="secondary">Maybe</Button></>}
/>
```
