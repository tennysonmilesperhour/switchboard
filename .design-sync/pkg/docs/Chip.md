---
category: Primitives
---
A tappable pill for picking activities, experiences, and signals. Selected chips fill with the brand accent.

## When to use

Multi-select choices that read as a cloud, not a list: what someone is up for, which experiences a plan offers, which signals to show. Each Chip is a `button` with `aria-pressed` bound to `selected`, so a group of Chips is a group of toggles.

- `selected`: filled with the accent, white text, resting shadow.
- Unselected: card surface, line border, accent border on hover.
- `emoji`: an optional leading emoji, hidden from assistive tech. The label carries the meaning.

## Rules

- Chips are toggles. For a single choice that navigates, use a Button.
- Keep labels to one or two words. A chip that wraps is a card.
- Lay them out with `flex flex-wrap gap-2`.

## Example

```tsx
<div className="flex flex-wrap gap-2">
  <Chip emoji="🍜" selected>Ramen</Chip>
  <Chip emoji="🎬">Movie</Chip>
  <Chip emoji="🥾">Hike</Chip>
</div>
```
