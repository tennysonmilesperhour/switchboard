---
category: Navigation
---
The app's tab bar: Home, Explore, a center create button, Calendar, and More. Fixed to the bottom of the viewport, blurred over whatever scrolls beneath it.

## When to use

Every signed-in screen. It takes no props. It reads the current route to decide which tab is active, and the More button opens a sheet that lists every other destination.

Outside the app there is no router, so wrap the screen in `PathnameProvider` to choose the active tab:

- `/` lights up Home
- `/discover` lights up Explore
- `/plans` lights up Calendar
- `/people`, `/rooms`, `/settings`, `/profile`, `/map`, `/boards`, `/mutual`, `/you`, `/features` light up More

Without a provider, Home is active.

## Layout facts

- It is `position: fixed; bottom: 0`. Give the page content `pb-24` or similar so the last item clears it.
- The create button overhangs the bar by 16px. Leave that room when stacking anything above the bar.
- The bar is `max-w-lg` and centered, like the rest of the app.

## Rules

- Do not add, remove, or rename tabs in a design. The five destinations are fixed.
- Do not put a second fixed bar at the bottom. Prompts that cover the nav go through the app's bottom overlay slot, one at a time.

## Example

```tsx
<PathnameProvider pathname="/plans">
  <main className="pb-24">...</main>
  <BottomNav />
</PathnameProvider>
```
