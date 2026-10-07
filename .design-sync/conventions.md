# Switchboard conventions for the design agent

Switchboard is a mobile-first app for making social plans without the group-thread pressure. Warm, direct, quietly playful. Every screen is a phone screen: one content column at `max-w-lg`, 16px gutters (`px-4`), 44px tap targets, and `pb-24` on the page so the last item clears the fixed BottomNav.

## Setup

Link `styles.css` and load `_ds_bundle.js`; the components live on `window.Switchboard`. No provider is required. The one exception is BottomNav, which reads the current route: wrap the screen in `PathnameProvider` with `pathname` set to `/`, `/discover`, `/plans`, or a More-sheet route such as `/people`, or Home stays active.

## Themes

The look is a token layer swapped by one attribute. Put `data-theme` on the root element (or any wrapper) with one of `almanac`, `dusk`, `transit`, `afterparty`, `guestlist`, `prompt`; omit it, or use `default`, for the Switchboard look. Every class below resolves through the tokens, so a themed screen needs no other change. Dusk and Afterparty are dark. Afterparty, Guestlist and Prompt also swap the typefaces, corner radii and shadows. Never write a hex color: it will not follow the theme.

## Styling idiom: Tailwind 4 utilities bound to tokens

Use these class families. The names are the only color vocabulary.

| Family | Classes |
|---|---|
| Surfaces | `bg-paper` (page), `bg-cream` (quiet panel), `bg-card` (card), `bg-line` and `border-line` (hairlines, skeletons) |
| Text | `text-ink` (primary), `text-ink-soft` and `text-ink-faint` (secondary), `text-paper` (on dark fills) |
| Brand accent | `bg-terracotta` (accent fill, white text), `bg-terracotta-soft`, `text-terracotta-deep` (readable accent text; never `text-terracotta` for text), `border-terracotta`, `ring-terracotta` (focus), `bg-brand-gradient` (primary CTA fill, white text) |
| Sage: available, accepted | `bg-sage`, `bg-sage-deep`, `bg-sage-soft`, `text-sage-deep`, `border-sage` |
| Gold: highlight, reward | `bg-gold`, `bg-gold-soft`, `text-gold-deep` (never `text-gold` as text on a light surface) |
| Rose: decline, error | `bg-rose-soft`, `text-rose-deep` |
| Plan gradients | `plan-pink`, `plan-purple`, `plan-blue`, `plan-jade`, `plan-orange`, `plan-magenta` (PlanCard applies these from its `color` prop) |
| Shape | `rounded-card`, `rounded-btn`, `rounded-pill`; `shadow-lift` (resting), `shadow-float` (overlays), `shadow-card` |
| Type | `font-display` on display text outside h1 to h3; h1 to h3 take the display face automatically. Weight 800 headings, tracking tight. No italics in headings. |
| Motion | `animate-rise` (reveals, toasts, sheets), `animate-card-in` (feed), `animate-pulse-soft` (live dots). Reduced motion is honored globally. |

Semantic colors keep their meaning in every theme: sage always means availability or acceptance, rose always means decline or error. Do not pick them for decoration.

Layout utilities (`flex`, `grid`, `gap-3`, `p-4`, `mt-1`, `text-sm`, `font-bold`, and so on) are the ordinary Tailwind 4 set, but only the ones the app already uses are compiled into `_ds_bundle.css`. If a class you want is not in that file, use an inline style with a token instead of inventing a class: `style={{ background: 'var(--color-cream)' }}`.

Raw tokens, for inline styles and custom CSS: `--color-paper`, `--color-cream`, `--color-card`, `--color-ink`, `--color-ink-soft`, `--color-ink-faint`, `--color-line`, `--color-terracotta`, `--color-terracotta-deep`, `--color-terracotta-soft`, `--color-sage`, `--color-sage-deep`, `--color-sage-soft`, `--color-gold`, `--color-gold-soft`, `--color-gold-deep`, `--color-rose-soft`, `--color-rose-deep`, `--color-plan-pink`, `--color-plan-purple`, `--color-plan-blue`, `--color-plan-jade`, `--color-plan-orange`, `--color-plan-magenta`, `--brand-gradient`, `--radius-card`, `--radius-btn`, `--radius-pill`, `--shadow-lift`, `--shadow-float`, `--shadow-card`, `--font-display`, `--font-sans`, `--ease-out-expo`, `--duration-fast`, `--duration-normal`.

## Where the truth lives

- `_ds_bundle.css`: the app's `globals.css` compiled. Token values, every `[data-theme]` block, the plan gradients, and the utility classes that exist.
- `guidelines/DESIGN-SYSTEM.md` and `guidelines/PRODUCT.md`: palette meaning, type, voice, accessibility.
- `components/<group>/<Name>/<Name>.prompt.md`: when to use each component and its rules.

## Composition rules

- One `primary` Button per view; pair it with `secondary` or `ghost`. `accept` says yes, `danger` declines.
- Plans are always a PlanCard. Groups of content are a Card under a SectionHeader. People are Avatars.
- Copy never hedges and never blames. No exclamation marks, no em dashes.
- Reach WCAG AA: body text in `text-ink` or `text-ink-soft`, accent text in the `-deep` tokens.

## Example

```tsx
const { Button, Card, SectionHeader, PlanCard, planColor, BottomNav, PathnameProvider } = window.Switchboard;

<PathnameProvider pathname="/">
  <main className="mx-auto max-w-lg px-4 pb-24 pt-6 bg-paper text-ink">
    <SectionHeader title="This week" hint="Two plans still deciding" action={<Button variant="ghost" size="sm">See all</Button>} />
    <PlanCard
      title="Sunset ramen run"
      color={planColor(0)}
      status="Deciding"
      attendees={[{ name: 'Priya Natarajan' }, { name: 'Marcus Lee' }]}
      attendeesLabel="You and 1 other"
      when="Fri 7:30pm"
      dateLabel="Oct 10"
      where="Nopa, Divisadero"
      actions={<><Button variant="accept">I am in</Button><Button variant="secondary">Maybe</Button></>}
    />
    <Card tone="cream" className="mt-4">
      <p className="text-sm text-ink-soft">Nobody sees a plan until they say yes.</p>
    </Card>
  </main>
  <BottomNav />
</PathnameProvider>
```
