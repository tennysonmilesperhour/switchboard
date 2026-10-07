#!/usr/bin/env node
/*
 * Builds .design-sync/pkg/dist for the design-sync converter. Run from
 * anywhere: `node .design-sync/pkg/build.mjs`.
 *
 *   dist/index.d.ts, dist/src/...   real prop types, emitted by tsc from src/
 *   dist/switchboard.css            src/app/globals.css compiled by Tailwind 4,
 *                                   every theme block included verbatim
 *   dist/fonts/                     the six Google families layout.tsx loads
 *                                   through next/font, fetched once and cached
 *
 * Nothing here edits app code. Colors, tokens and theme blocks come straight
 * from globals.css; the only CSS this script adds is the font variables that
 * next/font would otherwise set on <html>.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const dist = join(here, 'dist');
mkdirSync(dist, { recursive: true });

// 1. Prop types from the real source, via the repo's own TypeScript.
console.error('types: tsc --emitDeclarationOnly');
execFileSync(process.execPath, [join(repo, 'node_modules/typescript/bin/tsc'), '-p', join(here, 'tsconfig.types.json')], {
  stdio: 'inherit',
});
// tsc keeps the repo layout under dist/ (rootDir is the repo root), so the
// barrel's declaration sits at this path. package.json `types` points at the
// re-export below, which the converter reads as the package's API surface.
writeFileSync(join(dist, 'index.d.ts'), "export * from './.design-sync/pkg/src/index';\n");

// 2. Fonts. next/font/google downloads these at build time and self-hosts
// them; this does the same, into dist/fonts/, keeping the latin subset the app
// requests. Cached: a family is only fetched when its file is missing.
const FAMILIES = [
  { variable: '--font-work', family: 'Work Sans', axes: 'wght@100..900', file: 'work-sans.woff2' },
  { variable: '--font-bricolage', family: 'Bricolage Grotesque', axes: 'wght@200..800', file: 'bricolage-grotesque.woff2' },
  { variable: '--font-figtree', family: 'Figtree', axes: 'wght@300..900', file: 'figtree.woff2' },
  { variable: '--font-geist', family: 'Geist', axes: 'wght@100..900', file: 'geist.woff2' },
  { variable: '--font-newsreader', family: 'Newsreader', axes: 'wght@200..800', file: 'newsreader.woff2' },
  { variable: '--font-hanken', family: 'Hanken Grotesk', axes: 'wght@100..900', file: 'hanken-grotesk.woff2' },
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const fontsDir = join(dist, 'fonts');
mkdirSync(fontsDir, { recursive: true });
const faces = [];
for (const f of FAMILIES) {
  const target = join(fontsDir, f.file);
  const weight = f.axes.replace('wght@', '').replace('..', ' ');
  if (!existsSync(target)) {
    const api = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:${f.axes}&display=swap`;
    const css = await (await fetch(api, { headers: { 'User-Agent': UA } })).text();
    const latin = css.split('/* latin */').at(-1) ?? '';
    const url = latin.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (!url) throw new Error(`fonts: no latin woff2 for ${f.family} in ${api}`);
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(target, bytes);
    console.error(`fonts: fetched ${f.family} (${(bytes.length / 1024).toFixed(0)} KB)`);
  }
  faces.push(
    `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(./${f.file}) format('woff2');}`,
  );
}
writeFileSync(join(fontsDir, 'fonts.css'), faces.join('\n') + '\n');

// 3. The stylesheet: globals.css through Tailwind 4, exactly as the app
// compiles it, scanning the repo for the utility classes in use. Prepended:
// the font variables next/font sets on <html> in the app.
console.error('css: tailwind');
const postcss = (await import('postcss')).default;
const tailwind = (await import('@tailwindcss/postcss')).default;
const globals = join(repo, 'src/app/globals.css');
const out = join(dist, 'switchboard.css');
const result = await postcss([tailwind({ base: repo, optimize: false })]).process(readFileSync(globals, 'utf8'), {
  from: globals,
  to: out,
  map: false,
});
const fontVars = `:root{${FAMILIES.map((f) => `${f.variable}:'${f.family}'`).join(';')}}\n`;
writeFileSync(out, `/* design-sync: font variables (next/font sets these on <html> in the app) */\n${fontVars}${result.css}`);
console.error(`css: ${(result.css.length / 1024).toFixed(0)} KB -> ${out}`);
