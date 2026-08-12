import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_THEMES,
  availableThemes,
  resolveTheme,
  themeById,
} from '@/lib/themes-app';

const CSS = readFileSync(
  join(process.cwd(), 'src/app/globals.css'),
  'utf8',
);

/** Tokens every preset has to define, or it inherits a half-swapped palette. */
const REQUIRED_TOKENS = [
  '--color-paper',
  '--color-cream',
  '--color-card',
  '--color-ink',
  '--color-ink-soft',
  '--color-ink-faint',
  '--color-line',
  '--color-terracotta',
  '--color-terracotta-deep',
  '--color-terracotta-soft',
  '--color-sage',
  '--color-sage-deep',
  '--color-sage-soft',
  '--color-gold',
  '--color-gold-soft',
  '--color-gold-deep',
  '--color-rose-soft',
  '--color-rose-deep',
  '--color-plan-pink',
  '--color-plan-purple',
  '--color-plan-blue',
  '--color-plan-jade',
  '--color-plan-orange',
  '--color-plan-magenta',
  '--brand-gradient',
];

/** The block of declarations for one `[data-theme="…"]` selector. */
function themeBlock(id: string): string {
  const match = CSS.match(
    new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  return match?.[1] ?? '';
}

function tokenValue(block: string, token: string): string | null {
  const match = block.match(new RegExp(`${token}:\\s*([^;]+);`));
  return match?.[1].trim() ?? null;
}

function srgbChannel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (
    0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
  );
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

describe('appearance presets', () => {
  it('gives every preset a name, a blurb, and three swatches', () => {
    const ids = new Set<string>();
    for (const theme of APP_THEMES) {
      expect(ids.has(theme.id), `duplicate theme: ${theme.id}`).toBe(false);
      ids.add(theme.id);
      expect(theme.name.trim()).not.toBe('');
      expect(theme.blurb.trim()).not.toBe('');
      expect(theme.swatches).toHaveLength(3);
      for (const swatch of theme.swatches) {
        expect(swatch, `${theme.id} swatch`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('ships exactly one default, which is never locked', () => {
    const base = APP_THEMES[0];
    expect(base.id).toBe('default');
    expect(base.earned).toBeUndefined();
  });

  /**
   * A preset that redefines the background but inherits the old ink is how a
   * theme ends up unreadable in one corner nobody opened while building it.
   */
  it('defines every token it needs, in full', () => {
    for (const theme of APP_THEMES) {
      if (theme.id === 'default') continue; // the base lives in @theme
      const block = themeBlock(theme.id);
      expect(block, `no CSS block for ${theme.id}`).not.toBe('');
      for (const token of REQUIRED_TOKENS) {
        expect(
          tokenValue(block, token),
          `${theme.id} is missing ${token}`,
        ).not.toBeNull();
      }
    }
  });

  /**
   * PRODUCT.md targets WCAG AA, and a preset is not an exemption. These are the
   * pairs that carry the app's actual reading: body text and secondary text on
   * both surfaces, and the accent where it is used as a link color.
   */
  it('keeps text readable on every surface (WCAG AA)', () => {
    for (const theme of APP_THEMES) {
      if (theme.id === 'default') continue;
      const block = themeBlock(theme.id);
      const token = (name: string) => tokenValue(block, name) as string;

      const pairs: Array<[string, string, number, string]> = [
        [token('--color-ink'), token('--color-paper'), 4.5, 'body text on background'],
        [token('--color-ink'), token('--color-card'), 4.5, 'body text on a card'],
        [token('--color-ink-soft'), token('--color-paper'), 4.5, 'secondary text'],
        [token('--color-ink-soft'), token('--color-card'), 4.5, 'secondary text on a card'],
        // Faint text is supporting copy, held to the large-text threshold.
        [token('--color-ink-faint'), token('--color-card'), 3, 'faint text on a card'],
        [
          token('--color-terracotta-deep'),
          token('--color-card'),
          4.5,
          'accent text on a card',
        ],
        [
          token('--color-sage-deep'),
          token('--color-sage-soft'),
          4.5,
          'acceptance text on its own surface',
        ],
        [
          token('--color-gold-deep'),
          token('--color-gold-soft'),
          4.5,
          'highlight text on its own surface',
        ],
        [
          token('--color-rose-deep'),
          token('--color-rose-soft'),
          4.5,
          'decline text on its own surface',
        ],
      ];

      for (const [fg, bg, min, what] of pairs) {
        const ratio = contrast(fg, bg);
        expect(
          ratio,
          `${theme.id}: ${what} is ${ratio.toFixed(2)}:1, needs ${min}:1`,
        ).toBeGreaterThanOrEqual(min);
      }
    }
  });
});

describe('resolveTheme', () => {
  it('accepts every theme it ships', () => {
    for (const theme of APP_THEMES) {
      expect(resolveTheme(theme.id)).toBe(theme.id);
    }
  });

  /**
   * A profile row outlives the deploy that wrote it. An unknown value must
   * render the default palette, not leave the app with no tokens at all.
   */
  it('falls back to the default for anything else', () => {
    expect(resolveTheme(null)).toBe('default');
    expect(resolveTheme(undefined)).toBe('default');
    expect(resolveTheme('')).toBe('default');
    expect(resolveTheme('neon')).toBe('default');
    expect(resolveTheme('DUSK')).toBe('default');
  });
});

describe('availableThemes', () => {
  it('hides the earned preset until the passport is complete', () => {
    const locked = availableThemes(false).map((theme) => theme.id);
    const earned = APP_THEMES.filter((theme) => theme.earned).map((t) => t.id);
    expect(earned.length, 'there should be something to earn').toBeGreaterThan(0);
    for (const id of earned) expect(locked).not.toContain(id);
  });

  it('offers everything once it is', () => {
    expect(availableThemes(true)).toHaveLength(APP_THEMES.length);
  });
});

describe('themeById', () => {
  it('falls back to the default rather than returning undefined', () => {
    expect(themeById('dusk').id).toBe('dusk');
    // @ts-expect-error — deliberately passing a value the type forbids, because
    // a stale stored value can reach this at runtime.
    expect(themeById('gone').id).toBe('default');
  });
});
