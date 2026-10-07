# design-sync notes for Switchboard

Repo-specific facts for the claude.ai/design sync. Read before every re-sync.

## Shape

- The repo is a Next.js app, not a packaged library, so the converter targets a
  wrapper package at `.design-sync/pkg/` (`switchboard-ui`). Its `src/index.ts`
  re-exports the real components from `src/components`; nothing is copied.
- `buildCmd` (`node .design-sync/pkg/build.mjs`) must run before the converter.
  It emits `pkg/dist/`: real prop types via `tsc --emitDeclarationOnly`,
  `src/app/globals.css` compiled by Tailwind 4 (scanning the repo, previews
  included), and the six Google font families `layout.tsx` loads through
  `next/font`, fetched once from Google Fonts and cached in `pkg/dist/fonts/`.
  First run on a fresh clone needs network for the fonts.
- `next/link` and `next/navigation` resolve to `pkg/shims/` inside the bundle
  only (`tsconfig.paths.json`). `PathnameProvider` is exported from the bundle
  so BottomNav can show an active tab outside the Next router. Previews reach
  it through `storyImports.shim`, which keeps one context identity.
- Scope is deliberately seven components. `SectionHeader`, `AvatarCluster`,
  `PathnameProvider`, `PLAN_COLORS` and `planColor` ride along as bundle exports
  (`componentSrcMap: null` keeps them off the card list). `Icon` and `Sheet`
  are bundled internally for BottomNav and not exported.
- `dtsPropsFor` hand-writes four bodies: Button and Chip, because the extractor
  filters DOM props and the agent needs `disabled`, `type`, `onClick`; Avatar and
  PlanCard, because the extracted bodies referenced `AvatarSignal` and
  `Attendee` without declaring them. Keep them in step with the real interfaces.
- Guidelines come from `docs/DESIGN-SYSTEM.md` and `PRODUCT.md` verbatim.

## Previews

- `.design-sync/previews/<Name>.tsx` renders one cell per appearance preset by
  wrapping the component in `data-theme` (`preview-helpers/stage.tsx`). The
  stage pins `<html data-theme="default">`, as the root layout does for a
  saved default, so a dark-mode viewer does not see Dusk in the default cell.
- BottomNav is `position: fixed`; its preview contains it in a transformed
  phone frame per cell.

## Known render warns (triaged, expected on every run)

- `[TOKENS_MISSING] --wallpaper, --wallpaper-scrim, --plate-*`: set at runtime
  as inline custom properties by the custom theme (`src/lib/theme-custom.ts`).
  Not a stylesheet token. Expected absent.
- `[GRID_OVERFLOW] BottomNav ... escape (fixed/portal)`: the heuristic flags any
  visible fixed descendant. The transform containment in the preview holds (see
  the review sheet), and `cardMode: single` would hide six of the seven theme
  cells, so the grid stays.
- `npx eslint .design-sync` warns once on the gitignored generated
  `pkg/dist/src/components/ui/Avatar.d.ts` (`SIZES` only used as a type). Local
  only; CI never has `dist/`.

## Observations about the app (not changed by the sync)

- Tailwind 4 inlines `--shadow-*` theme values into the `shadow-lift`,
  `shadow-float` and `shadow-card` utilities, so the per-preset shadow
  overrides in `globals.css` only reach `var(--shadow-*)` uses, not the
  utility classes. The bundle reproduces the app as compiled.

## Re-sync risks

- `dtsPropsFor` bodies drift if Button, Chip, Avatar or PlanCard props change.
- `pkg/build.mjs` fetches fonts from Google Fonts; an offline fresh clone fails
  at the fonts step until the files exist in `pkg/dist/fonts/`.
- The shim list in `tsconfig.paths.json` covers `next/link` and
  `next/navigation` only. A synced component that imports another Next module
  needs a new shim there.
- Node 22 and the repo's pinned `@playwright/test` (chromium build 1228) were
  used; `.ds-sync/` installs its own `playwright@1.61.1` to match.

## Re-sync

```sh
command npm ci
S=<design-sync skill dir>; cp -r "$S"/package-build.mjs "$S"/package-validate.mjs "$S"/package-capture.mjs "$S"/resync.mjs "$S"/lib "$S"/storybook .ds-sync/
node .design-sync/pkg/build.mjs
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```
