# Switchboard Design System (as shipped)

*This is the true source of truth for how the app actually looks. It documents
the tokens and conventions in `src/app/globals.css` and the shared components in
`src/components/ui/`. The five candidate art directions in
`archive/DESIGN-DIRECTIONS.md` are historical exploration — none of them was
adopted; the app ships the "bold, bright, social" system described here.*

Ground rules that still hold from the exploration: no italics in headers, no
emdashes in copy, and copy never hedges.

## Palette (CSS custom properties, `@theme` in globals.css)

**Neutrals**
- `--color-paper` `#f9fbfd` — app background
- `--color-cream` `#f5f5f6` — quiet surfaces
- `--color-card` `#ffffff` — card surface
- `--color-ink` `#191d22` — primary text
- `--color-ink-soft` `#565a60`, `--color-ink-faint` `#8d8f93` — secondary text
- `--color-line` `#ebebeb` — borders/skeletons

**Brand accent — pink (kept under the `terracotta` token name so existing
utility classes restyle automatically; it is NOT terracotta anymore).**
- `--color-terracotta` `#f82a63` (the pink brand accent)
- `--color-terracotta-deep` `#d1318a`, `--color-terracotta-soft` `#ffe3ec`

**Semantic**
- `--color-sage` `#21af96` (jade) — availability / acceptance; deep `#178a76`, soft `#dff5f0`
- `--color-gold` `#eeae36` — highlight/rewards; soft `#fbefd3`; **`--color-gold-deep` `#8a5300`** for accessible text on light/gold-soft surfaces (added for WCAG AA — never use `text-gold` as text on a light background)
- `--color-rose-soft` `#ffe1e6`, `--color-rose-deep` `#e5405e` — error / decline

**Plan-card gradients** — each plan card gets one accent, applied via a
`.plan-*` class (pink, purple, blue, jade, orange, magenta). The classes are
vivid, top-lit, slightly-deepening linear gradients (see the `.plan-*` rules in
globals.css). `planColor(i)` in `PlanCard` rotates through them.

**Signature CTA gradient** — `.bg-brand-gradient` (`--brand-gradient`), a
pink → magenta → violet sweep used on primary buttons, the create FAB, progress,
and sliders.

## Type

- Display and UI are the **same family: Work Sans** (`--font-work`, loaded in
  `layout.tsx`). Both `--font-display` and `--font-sans` point at it. (The old
  spec's Fraunces + Inter pairing was never shipped.)
- `h1, h2, h3, .font-display` carry `letter-spacing: -0.02em`; `h1/h2` are weight 800.

## Shape & depth

- Radii: `--radius-card` 21px, `--radius-btn` 19px, `--radius-pill` 999px.
- Shadows: `--shadow-lift` (resting), `--shadow-float` (raised/overlays),
  `--shadow-card`.
- Motion tokens: `--ease-out-expo`, `--duration-fast` 150ms, `--duration-normal`
  300ms. Keyframe utilities: `.animate-rise` (match reveals, toasts, sheets),
  `.animate-card-in` (home feed), `.animate-pulse-soft` (live status dots).
  `prefers-reduced-motion` is honored globally.

## Component conventions

- Reuse the shared primitives in `src/components/ui/`: `Button` (variants
  primary/secondary/ghost/accept/danger), `Card` + `SectionHeader`, `Chip`,
  `Avatar`/`AvatarCluster`, `PlanCard`, `EmptyState`, `Icon`, `Skeleton`,
  `Toast` (`useToast`), `ConfirmDialog` (`useConfirm`).
- Wall-clock times use `TimeSelect` (five-minute steps), never
  `<input type="time">`: iOS ignores `step` on a time input and offers a
  minute-by-minute wheel, so hosts aiming for 5:20 landed on 5:19.
- Interactive controls carry a visible focus ring:
  `focus-visible:ring-2 focus-visible:ring-terracotta`, and a ~44px tap target.
- Native `accent-color` controls (checkboxes, range sliders) use
  `accent-terracotta` — never a hardcoded `oklch(...)` value.
- App chrome is `AppShell` (sticky header + `BottomNav`). The bottom nav is
  Home / Explore / create-FAB / Calendar / More, where **More** opens a sheet
  listing the rest of the features.
- Every query-heavy route has a `loading.tsx` built on `PageSkeleton`; the app
  has root `error.tsx` and `not-found.tsx`.

## Appearance presets (the token layer, swapped at runtime)

The look above is the default, not the only one. A signed-in person can pick a
preset in Settings → Appearance; it is stored on their profile
(`profiles.appearance_theme`) and applied as `data-theme` on `<html>` by the
root layout, server-side — never by a client effect, which would flash the
default palette on every navigation.

A preset is **only** a token override, defined in `globals.css` under
`[data-theme="…"]`. No component knows themes exist: they all reference
`bg-terracotta`, `text-ink`, `bg-brand-gradient`, `plan-*`, and those resolve
through the custom properties. Presets ship today for **Almanac** (cream and
ink), **Dusk** (warm dark, candle amber), and **Transit** (one signal color) —
the first three of the five directions explored before launch and shelved in
`archive/DESIGN-DIRECTIONS.md`.

Rules for adding one, enforced by `src/lib/themes-app.test.ts`:

- **Redefine every token in `REQUIRED_TOKENS`, in full.** A half-swapped
  palette — new background, inherited ink — is how a theme ends up unreadable
  in the one corner nobody opened while building it.
- **Meet WCAG AA** on body text, secondary text, accent-as-link, and each
  semantic pair (`sage-deep` on `sage-soft`, and so on). The test computes the
  ratios from the CSS itself, so it fails on the real values rather than on an
  intention.
- **Keep semantics semantic.** `sage` still means availability and acceptance,
  `rose` still means decline. A theme changes the register, never the meaning.
- **Register it in `src/lib/themes-app.ts`** and in the migration's CHECK
  constraint, so an unknown value can never reach `<html>`.

Note that `.plan-*` gradients are derived from the `--color-plan-*` tokens with
`color-mix`, not written as literal hex. They were the last hardcoded colors in
the app, and the reason a themed screen still had six bright pink and violet
cards in the middle of it.

## If you re-theme wholesale

Changing the accent, neutrals, or type in the `@theme` block restyles the app's
default for everyone, the same way a preset restyles it for one person. If a
future direction is adopted as *the* look rather than an option, port it by
rewriting that block and the `--brand-gradient` rule, then update this document.
