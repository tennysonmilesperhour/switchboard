---
category: Primitives
---
What a screen says when there is nothing in it yet: an emoji, a short title, one line of body, and usually one action.

## When to use

Any list, feed, or room with no content. Required: `emoji`, `title`, `body`. Optional: `action`, almost always a single primary Button that creates the first thing.

## Voice

Copy never hedges and never blames. The title names the situation ("No plans yet"), the body says what happens next ("Start one and invite a few people"), and the action does it. No exclamation marks, no "oops".

## Rules

- One action, not a menu.
- Center it in the space the content would fill; it already pads itself vertically.
- Under a wallpaper it sits on a plate automatically; do not add a background.

## Example

```tsx
<EmptyState
  emoji="🗓️"
  title="No plans yet"
  body="Start one and invite a few people. Nobody sees it until they say yes."
  action={<Button>Start something</Button>}
/>
```
