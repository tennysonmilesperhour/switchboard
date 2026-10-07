---
category: Primitives
---
The basic surface: a rounded, bordered panel with a tone, plus SectionHeader for the heading that sits above a group of cards.

## When to use

Anything that groups content: a plan summary, a settings row group, a person preview. `tone` picks the surface:

- `default`: card white with a line border. Most content.
- `cream`: a quiet, recessed panel. Secondary information, hints.
- `sage`: availability or acceptance callouts.
- `terracotta`: brand-accent callouts, the current or highlighted item.
- `gold`: rewards, streaks, highlights.

Pass `lifted` for a resting shadow when the card sits on the page rather than inside another surface.

## Companion: SectionHeader

`SectionHeader` renders the heading for a group of cards: `title` (display face), optional `hint` below it, and an optional `action` node on the right, usually a ghost Button. Put it above a list of Cards, not inside one.

## Rules

- Cards use `rounded-card` and `p-4`; keep that rhythm. Add `className` for layout, not for reskinning.
- Tones mean something. Do not pick `sage` because green looks nice.
- Card is a `div`; it is not a link or a button. Wrap it or put the control inside.

## Example

```tsx
<SectionHeader title="This week" hint="Three plans, two still deciding" action={<Button variant="ghost" size="sm">See all</Button>} />
<Card lifted>
  <h3 className="font-bold text-ink">Dinner at Nopa</h3>
  <p className="text-sm text-ink-soft mt-1">Friday, 7:30pm. Four going.</p>
</Card>
```
