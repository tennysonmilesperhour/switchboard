---
category: Primitives
---
A person: a photo when there is one, otherwise deterministic initials on a hue derived from the name. AvatarCluster stacks several with a +N overflow.

## When to use

Anywhere a person appears. `name` is required and drives both the initials and the fallback color, so the same person always gets the same hue. Pass `src` for a photo, `seed` to pin the hue to something other than the name (an id, say).

- `size`: `xs` (24px), `sm` (32px), `md` (40px, default), `lg` (56px), `xl` (96px).
- `ring`: a white ring so the avatar reads on a colored surface.
- `signal`: `{ emoji, label }` draws a sage ring and an emoji badge meaning "this person is up for this right now". The label is announced to screen readers. Only pass a signal the viewer is allowed to see.

## Companion: AvatarCluster

`AvatarCluster` takes `people` (`{ name, src? }[]`), overlaps them, and shows `+N` past `max` (default 4). `onColor` adds white rings and a light overflow label for use on plan cards.

## Rules

- Never invent a photo URL. Leave `src` off and the initials render.
- The signal ring is the sage ring. Do not draw a green ring for anything else.

## Example

```tsx
<Avatar name="Priya Natarajan" size="lg" signal={{ emoji: '🍜', label: 'ramen' }} />
<AvatarCluster people={[{ name: 'Priya N' }, { name: 'Marcus Lee' }, { name: 'Jo Alvarez' }, { name: 'Sam K' }, { name: 'Dee' }]} />
```
