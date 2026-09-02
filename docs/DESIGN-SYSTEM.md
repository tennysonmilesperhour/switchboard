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
- `--color-ink-soft` `#565a60`, `--color-ink-faint` `#727377` — secondary text
- `--color-line` `#ebebeb` — borders/skeletons

**Brand accent — pink (kept under the `terracotta` token name so existing
utility classes restyle automatically; it is NOT terracotta anymore).**
- `--color-terracotta` `#dc2558` (the pink brand fill; white text passes AA)
- `--color-terracotta-deep` `#bd2c7d` (link/text accent on light surfaces),
  `--color-terracotta-soft` `#ffe3ec`. Use `text-terracotta-deep`, never
  `text-terracotta`, for readable accent text across every preset.

**Semantic**
- `--color-sage` `#198472` (jade) — availability / acceptance; deep `#147a69`, soft `#dff5f0`
- `--color-gold` `#eeae36` — highlight/rewards; soft `#fbefd3`; **`--color-gold-deep` `#8a5300`** for accessible text on light/gold-soft surfaces (added for WCAG AA — never use `text-gold` as text on a light background)
- `--color-rose-soft` `#ffe1e6`, `--color-rose-deep` `#bc354d` — error / decline

**Plan-card gradients** — each plan card gets one accent, applied via a
`.plan-*` class (pink, purple, blue, jade, orange, magenta). The classes are
vivid, top-lit, slightly-deepening linear gradients (see the `.plan-*` rules in
globals.css). `planColor(i)` in `PlanCard` rotates through them. Every plan
token is dark enough for its white card title to pass WCAG AA.

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
- Wall-clock times use `TimeSelect`, never `<input type="time">`: iOS ignores
  `step` on a time input and offers a minute-by-minute wheel, so hosts aiming
  for 5:20 landed on 5:19. `TimeSelect` asks for the time the way people say
  one — an hour, a minute in five-minute steps, and an AM/PM toggle. It was a
  single select of all 288 five-minute slots, which had the right detents and
  the wrong shape: reaching 7:30pm meant scrolling past ninety rows. Three
  short columns beat one long one.
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

Both of those columns are read through the session client, which means both
need an explicit SELECT grant: `profiles` has a column allowlist rather than a
table-level grant (see `docs/SECURITY.md`, SB-01), and a column left off it
fails the *whole* query, so the app sees an empty profile rather than a denied
column. `appearance_theme` shipped without its grant and the symptom was that
Settings appeared to ignore every theme you picked.
`src/lib/profile-column-grants.test.ts` now fails on a profiles column that is
neither granted nor documented as withheld.

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
- **Meet WCAG AA** on body and secondary text, accent-as-link, every shared
  `Button` variant, notification badges, inactive bottom-nav labels, every
  white-on-plan-card title, and each semantic pair (`sage-deep` on
  `sage-soft`, and so on). The test computes the ratios from the CSS itself, so
  it fails on the real values rather than on an intention.
- **Keep semantics semantic.** `sage` still means availability and acceptance,
  `rose` still means decline. A theme changes the register, never the meaning.
- **Register it in `src/lib/themes-app.ts`** and in the migration's CHECK
  constraint, so an unknown value can never reach `<html>`.

Note that `.plan-*` gradients are derived from the `--color-plan-*` tokens with
`color-mix`, not written as literal hex. They were the last hardcoded colors in
the app, and the reason a themed screen still had six bright pink and violet
cards in the middle of it.

### One preset is not written down: `custom`

`custom` takes three colors from the person — a background, a button color, a
highlight — plus an optional wallpaper image, and **derives** the rest of the
token layer at render time in `src/lib/theme-custom.ts`. The derived values are
set as inline custom properties on `<html>` by the root layout, alongside
`data-theme="custom"`; only the three choices are stored
(`profiles.appearance_custom`).

It works this way because the rules above cannot be reviewed for a palette
nobody has seen. So they are met by construction instead:

- Body ink is whichever of black or white has more room against the page. The
  two cannot both fail — their contrast ratios against any color multiply to
  21 — so the better one is never below ~4.58:1, and the page background is
  workable whatever gets chosen.
- Every other surface (cards, secondary surfaces, the tinted chips a colored
  label sits on) is held on that ink's side of a luminance limit, so one text
  direction reads on all of them.
- Secondary and faint ink are body ink relaxed back toward the page. The
  relaxation has a floor as well as a target, so the hierarchy cannot collapse
  into three shades of the same near-black.
- The wallpaper is never dimmed for readability. It shows at exactly the
  strength that was asked for; the slider is linear and is not clamped.
  Readability is bought somewhere else: every surface the app puts text on —
  cards, chips, the header, the tab bar, and the plates behind section headings
  and empty states — is painted at `1 - plateVeil` over the photograph, and
  `plateVeil` is the largest transparency that still leaves every ink weight
  above its threshold against the worst pixel a photograph can contain. So a
  background with contrast to spare lets the picture through its own cards; a
  mid-gray one gets solid cards and still shows the picture everywhere else.
  Solving the plate rather than the image is what stopped a "100%" slider from
  showing 26% of somebody's photo.

`src/lib/theme-custom.test.ts` fuzzes hundreds of palettes through the same
contrast pairs the shipped presets are held to, plus the wallpaper composite. If
you add a token to the presets, it fails until the derivation covers that too.

## If you re-theme wholesale

Changing the accent, neutrals, or type in the `@theme` block restyles the app's
default for everyone, the same way a preset restyles it for one person. If a
future direction is adopted as *the* look rather than an option, port it by
rewriting that block and the `--brand-gradient` rule, then update this document.
