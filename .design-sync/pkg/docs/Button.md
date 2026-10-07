---
category: Primitives
---
The one button. Five variants carry meaning, three sizes carry hierarchy, and every theme restyles it through tokens.

## When to use

Any tap that does something. Use `variant` to say what kind of thing:

- `primary` (default): the one main action on a screen. Brand gradient fill, white text. One per view.
- `secondary`: the quieter companion to a primary action. Card surface, hairline border.
- `ghost`: low-emphasis actions inside lists, rows, and headers. No surface until hover.
- `accept`: saying yes. Sage (jade) fill. Sage always means availability or acceptance, never decoration.
- `danger`: decline, remove, leave. Rose-soft fill with rose-deep text. Rose always means decline or error.

`size` is `sm`, `md` (default), or `lg`. Use `lg` for the hero action in a flow, `sm` inside dense rows.

## Props

Every native button attribute passes through. `type` defaults to `button`, so a Button inside a form never submits by accident; pass `type="submit"` for the real submit.

## Rules

- Never recolor a Button with extra classes. The variant is the color.
- Pair an icon with text, not instead of text, unless it has an `aria-label`.
- Do not stack two primaries. Primary plus secondary, or primary plus ghost.
- Disabled is `disabled`, which fades the button to 40 percent and blocks pointer events.

## Example

```tsx
<div className="flex gap-3">
  <Button variant="accept" size="lg">I am in</Button>
  <Button variant="secondary" size="lg">Maybe later</Button>
</div>
```
