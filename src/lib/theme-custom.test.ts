import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_CUSTOM,
  contrast,
  customThemeVars,
  hasWallpaper,
  hslToHex,
  isWallpaperUrl,
  luminance,
  wallpaperShare,
  mix,
  parseCustomAppearance,
  rgbToHsl,
  type CustomAppearance,
} from '@/lib/theme-custom';

const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/**
 * `isWallpaperUrl` compares against the configured project origin, so the tests
 * have to configure one. The host below is deliberately NOT the one the
 * rejection cases use.
 */
const PROJECT = 'https://xyz.supabase.co';
const ORIGINAL_PROJECT = process.env.NEXT_PUBLIC_SUPABASE_URL;
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT;
});
afterAll(() => {
  if (ORIGINAL_PROJECT === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_PROJECT;
});

/** A deterministic generator, so a failure is reproducible from its seed. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomHex(next: () => number): string {
  const channel = () =>
    Math.floor(next() * 256)
      .toString(16)
      .padStart(2, '0');
  return `#${channel()}${channel()}${channel()}`;
}

/** A spread of appearances, including the ones a person actually picks badly. */
function sampleAppearances(count: number): CustomAppearance[] {
  const next = rng(20260819);
  const samples: CustomAppearance[] = [
    DEFAULT_CUSTOM,
    // The classic own-goals: no-contrast pastel, near-black on near-black,
    // saturated yellow (the color that breaks every naive palette), pure gray
    // (where nothing can reach 7:1 in either direction).
    { ...DEFAULT_CUSTOM, background: '#ffffff', button: '#ffe600', highlight: '#fff9b0' },
    { ...DEFAULT_CUSTOM, background: '#000000', button: '#101010', highlight: '#1a1a1a' },
    { ...DEFAULT_CUSTOM, background: '#808080', button: '#7f7f7f', highlight: '#818181' },
    { ...DEFAULT_CUSTOM, background: '#2b2b33', button: '#00ffcc', highlight: '#ff00aa' },
    { ...DEFAULT_CUSTOM, background: '#f6f1e5', button: '#9c2f24', highlight: '#b8860b' },
  ];
  while (samples.length < count) {
    samples.push({
      wallpaper: null,
      background: randomHex(next),
      button: randomHex(next),
      highlight: randomHex(next),
      wallpaperStrength: Math.round(next() * 100),
    });
  }
  return samples;
}

/**
 * The pairs that carry the app's actual reading, and their thresholds — the
 * same set `themes-app.test.ts` holds the shipped presets to. A custom preset
 * is not an exemption from PRODUCT.md's WCAG AA target; it is the case where
 * the target has to be met by construction, because nobody reviews the colors.
 */
const SURFACES = [
  '--color-paper',
  '--color-card',
  '--color-cream',
  '--color-terracotta-soft',
  '--color-gold-soft',
  '--color-sage-soft',
  '--color-rose-soft',
];

/** Body and secondary ink go on every surface, including the tinted ones. */
const INK_PAIRS: Array<[string, string, number, string]> = SURFACES.flatMap(
  (surface) =>
    [
      ['--color-ink', surface, 4.5, `body text on ${surface}`],
      ['--color-ink-soft', surface, 4.5, `secondary text on ${surface}`],
      ['--color-ink-faint', surface, 3, `faint text on ${surface}`],
    ] as Array<[string, string, number, string]>,
);

/**
 * Each `-deep` colour is text, and it appears on the page, on a card, and on
 * its own tinted chip — `text-rose-deep` on a bare form, `text-sage-deep` in a
 * toned card, `text-gold-deep` on a perk row. Checking only the chip is what
 * let three of these four ship at 1.9:1 against a mid-tone page while every
 * assertion here passed.
 */
const DEEP_PAIRS: Array<[string, string, number, string]> = (
  [
    ['--color-terracotta-deep', '--color-terracotta-soft'],
    ['--color-gold-deep', '--color-gold-soft'],
    ['--color-sage-deep', '--color-sage-soft'],
    ['--color-rose-deep', '--color-rose-soft'],
  ] as Array<[string, string]>
).flatMap(([deep, own]) =>
  [own, '--color-card', '--color-paper', '--color-cream'].map(
    (surface) =>
      [deep, surface, 4.5, `${deep} on ${surface}`] as [string, string, number, string],
  ),
);

const READABLE_PAIRS: Array<[string, string, number, string]> = [
  ...INK_PAIRS,
  ...DEEP_PAIRS,
];

describe('parseCustomAppearance', () => {
  it('reads a complete, valid value back unchanged', () => {
    const stored = {
      wallpaper:
        'https://xyz.supabase.co/storage/v1/object/public/covers/uid/wallpaper-1.jpg',
      background: '#101820',
      button: '#3ddc97',
      highlight: '#ffd166',
      wallpaperStrength: 42,
    };
    expect(parseCustomAppearance(stored)).toEqual(stored);
  });

  /**
   * A profile row outlives the deploy that wrote it. Every field falls back on
   * its own rather than the whole value being rejected: somebody whose stored
   * wallpaper no longer validates should still get their colors, not the stock
   * theme and no explanation.
   */
  it('falls back field by field, never all at once', () => {
    const partial = parseCustomAppearance({
      background: '#123456',
      button: 'rebeccapurple',
      highlight: '#GGGGGG',
      wallpaper: 'https://evil.example.com/tracker.png',
      wallpaperStrength: 999,
    });
    expect(partial.background).toBe('#123456');
    expect(partial.button).toBe(DEFAULT_CUSTOM.button);
    expect(partial.highlight).toBe(DEFAULT_CUSTOM.highlight);
    expect(partial.wallpaper).toBeNull();
    expect(partial.wallpaperStrength).toBe(100);
  });

  it('renders something for anything at all', () => {
    for (const junk of [null, undefined, '', 0, [], 'custom', { background: 42 }]) {
      expect(parseCustomAppearance(junk)).toEqual(DEFAULT_CUSTOM);
    }
  });

  it('normalises hex case so stored values compare equal', () => {
    expect(parseCustomAppearance({ background: '#AABBCC' }).background).toBe('#aabbcc');
  });
});

describe('isWallpaperUrl', () => {
  it('accepts a public object in one of our own buckets', () => {
    for (const bucket of ['covers', 'media', 'avatars']) {
      expect(
        isWallpaperUrl(
          `https://xyz.supabase.co/storage/v1/object/public/${bucket}/uid/wallpaper-1.webp`,
        ),
      ).toBe(true);
    }
  });

  /**
   * A wallpaper URL is fetched by the browser on every page of the app, on
   * every device the account signs in on. An attacker-chosen origin here is a
   * beacon, and the value also lands inside a `url("…")` CSS token.
   */
  it('rejects anything that is not ours, and anything that could break the sink', () => {
    for (const bad of [
      'https://evil.example.com/beacon.png',
      // The one that used to pass: the bucket path was matched as a SUBSTRING
      // of the whole URL, so any host could simply serve that path and be
      // rendered as a background-image on every page, on every device, for as
      // long as it stayed set.
      'https://evil.example.com/storage/v1/object/public/covers/uid/a.png',
      // Same trick with the real host somewhere it doesn't count.
      'https://evil.example.com/?x=https://xyz.supabase.co/storage/v1/object/public/covers/uid/a.png',
      'https://evil.example.com/#/storage/v1/object/public/covers/uid/a.png',
      // Userinfo that reads like our host to a naive prefix check.
      'https://xyz.supabase.co@evil.example.com/storage/v1/object/public/covers/uid/a.png',
      // A lookalike subdomain, and a host our host is a prefix of.
      'https://xyz.supabase.co.evil.example.com/storage/v1/object/public/covers/uid/a.png',
      // Right host, wrong path shape.
      'https://xyz.supabase.co/storage/v1/object/sign/covers/uid/a.png',
      'https://xyz.supabase.co/x/storage/v1/object/public/covers/uid/a.png',
      'https://xyz.supabase.co/storage/v1/object/public/covers/a.png',
      'https://xyz.supabase.co/storage/v1/object/public/covers/uid/../../secret.png',
      'https://xyz.supabase.co/storage/v1/object/public/covers/uid/a.png?download=1',
      'http://xyz.supabase.co/storage/v1/object/public/covers/uid/a.png',
      'javascript:alert(1)',
      'data:image/svg+xml;base64,AAAA',
      'https://xyz.supabase.co/storage/v1/object/public/media-private/uid/a.png',
      'https://xyz.supabase.co/storage/v1/object/public/covers/uid/a.png") ; background: url("https://evil.example.com/b.png',
      'https://xyz.supabase.co/storage/v1/object/public/covers/uid/a b.png',
      '',
      null,
      42,
    ]) {
      expect(isWallpaperUrl(bad), String(bad)).toBe(false);
    }
  });

  it('fails closed when the project origin is not configured', () => {
    const ours = `${PROJECT}/storage/v1/object/public/covers/uid/a.png`;
    expect(isWallpaperUrl(ours)).toBe(true);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    // No configured project means nothing can be verified as ours, and an
    // unverified beacon is worse than no wallpaper.
    expect(isWallpaperUrl(ours)).toBe(false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT;
  });
});

describe('customThemeVars', () => {
  /**
   * A preset that redefines the background but inherits the old ink is how a
   * theme ends up unreadable in one corner nobody opened. The shipped presets
   * are held to this by `themes-app.test.ts` reading globals.css; the custom
   * one is held to the same list, read from the same place, so adding a token
   * to the presets fails here until the derivation covers it too.
   */
  it('defines every token the shipped presets define', () => {
    const almanac = CSS.match(/\[data-theme="almanac"\]\s*\{([\s\S]*?)\n\}/);
    expect(almanac, 'no almanac block to compare against').not.toBeNull();
    const tokens = [...almanac![1].matchAll(/(--[a-z-]+):/g)].map((m) => m[1]);
    expect(tokens.length).toBeGreaterThan(20);

    const derived = customThemeVars(DEFAULT_CUSTOM);
    for (const token of tokens) {
      expect(derived[token], `the custom preset never sets ${token}`).toBeTruthy();
    }
  });

  /**
   * The `[data-theme="custom"]` block in globals.css is the palette for the
   * moment before the person's own values are known — a signed-out visitor, a
   * profile read that fell over. It is the derivation applied to
   * DEFAULT_CUSTOM, so if the derivation changes and the block does not, the
   * fallback quietly stops being the theme it is standing in for.
   */
  it('matches the fallback block committed to globals.css', () => {
    const block = CSS.match(/\[data-theme="custom"\]\s*\{([\s\S]*?)\n\}/);
    expect(block, 'no [data-theme="custom"] block in globals.css').not.toBeNull();

    const committed = new Map(
      [...block![1].matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );
    const derived = customThemeVars(DEFAULT_CUSTOM);
    for (const [token, value] of committed) {
      expect(
        value,
        `globals.css sets ${token} to ${value}, but the derivation now yields ` +
          `${derived[token]}. Regenerate the block from customThemeVars(DEFAULT_CUSTOM).`,
      ).toBe(derived[token]);
    }
  });

  it('emits colors as literal hex, and nothing else as a color', () => {
    const derived = customThemeVars(DEFAULT_CUSTOM);
    for (const [token, value] of Object.entries(derived)) {
      if (!token.startsWith('--color-')) continue;
      expect(value, `${token} is not a plain hex color`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps every reading pair at AA, for any three colors somebody picks', () => {
    for (const appearance of sampleAppearances(400)) {
      const vars = customThemeVars(appearance);
      for (const [fg, bg, min, what] of READABLE_PAIRS) {
        const ratio = contrast(vars[fg], vars[bg]);
        expect(
          ratio,
          `${what} is ${ratio.toFixed(2)}:1 (needs ${min}:1) for background ` +
            `${appearance.background} / button ${appearance.button} / highlight ` +
            `${appearance.highlight}`,
        ).toBeGreaterThanOrEqual(min);
      }
    }
  });

  /**
   * Semantics stay semantic (AGENTS.md): a theme changes the register, never
   * the meaning. Acceptance stays green and decline stays red no matter what
   * the accent is, so the two never trade places.
   */
  /**
   * `text-white` is written into the components, not read from a token: 18
   * places pair it with `bg-terracotta`, the primary Button pairs it with
   * `bg-sage`, and every call to action pairs it with the brand gradient. The
   * theme owns only one end of those pairs, so the fill has to carry the
   * contrast on its own — including when somebody picks pale yellow for their
   * "button color".
   */
  it('keeps white legible on every fill it is written onto', () => {
    for (const appearance of sampleAppearances(400)) {
      const vars = customThemeVars(appearance);
      const stops = [...vars['--brand-gradient'].matchAll(/#[0-9a-f]{6}/g)].map(
        (match) => match[0],
      );
      expect(stops.length, 'the gradient has no color stops to check').toBe(3);

      const planFills = Object.entries(vars)
        .filter(([token]) => token.startsWith('--color-plan-'))
        .map(([, value]) => value);
      for (const fill of [
        vars['--color-terracotta'],
        vars['--color-sage'],
        ...planFills,
        ...stops,
      ]) {
        const ratio = contrast('#ffffff', fill);
        expect(
          ratio,
          `white on ${fill} is ${ratio.toFixed(2)}:1 for button ${appearance.button} / ` +
            `highlight ${appearance.highlight}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('deepens a fill only as far as white needs, keeping the hue', () => {
    const pale = customThemeVars({ ...DEFAULT_CUSTOM, button: '#ffe600' });
    // Same yellow, dark enough to put a label on.
    expect(contrast('#ffffff', pale['--color-terracotta'])).toBeGreaterThanOrEqual(4.5);
    // Actually the same hue, not merely "still warmer than it is cool".
    const [chosenHue] = rgbToHsl('#ffe600');
    const [renderedHue] = rgbToHsl(pale['--color-terracotta']);
    expect(Math.abs(renderedHue - chosenHue)).toBeLessThan(15);

    // An already-deep choice is left exactly as chosen.
    const deep = customThemeVars({ ...DEFAULT_CUSTOM, button: '#123f7a' });
    expect(deep['--color-terracotta']).toBe('#123f7a');
  });

  /**
   * Six plan colors that are all the same color are a gradient, not a palette.
   * The spread used to depend on the highlight sitting clockwise of the button:
   * Switchboard's own two colors in the opposite roles collapsed to six oranges
   * eleven degrees apart.
   */
  it('keeps the six plan colors distinct however the two hues are ordered', () => {
    const planHues = (button: string, highlight: string) =>
      Object.entries(customThemeVars({ ...DEFAULT_CUSTOM, button, highlight }))
        .filter(([token]) => token.startsWith('--color-plan-'))
        .map(([, hex]) => rgbToHsl(hex)[0]);

    const separation = (hues: number[]) => {
      let worst = 360;
      for (let i = 0; i < hues.length; i += 1) {
        for (let j = i + 1; j < hues.length; j += 1) {
          const raw = Math.abs(hues[i] - hues[j]) % 360;
          worst = Math.min(worst, raw > 180 ? 360 - raw : raw);
        }
      }
      return worst;
    };

    // Both orderings of the shipped pair, and a full sweep of the second hue.
    expect(separation(planHues('#f82a63', '#eeae36'))).toBeGreaterThan(20);
    expect(separation(planHues('#eeae36', '#f82a63'))).toBeGreaterThan(20);
    for (let degrees = 0; degrees < 360; degrees += 15) {
      const highlight = hslToHex(degrees, 0.7, 0.5);
      expect(
        separation(planHues('#f82a63', highlight)),
        `highlight at ${degrees} degrees`,
      ).toBeGreaterThan(20);
    }
  });

  it('keeps acceptance green and decline red', () => {
    for (const appearance of sampleAppearances(40)) {
      const vars = customThemeVars(appearance);
      const hue = (hex: string) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max === min) return -1;
        const d = max - min;
        if (max === r) return (((g - b) / d + (g < b ? 6 : 0)) / 6) * 360;
        if (max === g) return (((b - r) / d + 2) / 6) * 360;
        return (((r - g) / d + 4) / 6) * 360;
      };
      expect(hue(vars['--color-sage'])).toBeGreaterThan(90);
      expect(hue(vars['--color-sage'])).toBeLessThan(200);
      const roseHue = hue(vars['--color-rose-deep']);
      expect(roseHue > 320 || roseHue < 30, `rose hue ${roseHue}`).toBe(true);
    }
  });

  it('darkens the shadow set only for a dark background', () => {
    expect(customThemeVars({ ...DEFAULT_CUSTOM, background: '#ffffff' })['--shadow-lift'])
      .toBeUndefined();
    expect(customThemeVars({ ...DEFAULT_CUSTOM, background: '#141018' })['--shadow-lift'])
      .toBeTruthy();
  });

  it('only emits a wallpaper when there is one to emit', () => {
    expect(customThemeVars(DEFAULT_CUSTOM)['--wallpaper']).toBeUndefined();
    const withImage = customThemeVars({
      ...DEFAULT_CUSTOM,
      wallpaper:
        'https://xyz.supabase.co/storage/v1/object/public/covers/uid/wallpaper-1.jpg',
    });
    expect(withImage['--wallpaper']).toBe(
      'url("https://xyz.supabase.co/storage/v1/object/public/covers/uid/wallpaper-1.jpg")',
    );
  });
});

describe('the wallpaper scrim', () => {
  function scrimAlpha(vars: Record<string, string>): number {
    const match = vars['--wallpaper-scrim'].match(/rgba\([^)]*,\s*([\d.]+)\)$/);
    expect(match, 'the scrim is not an rgba() value').not.toBeNull();
    return Number(match![1]);
  }

  /**
   * Text sits directly on the page background all over this app, and an
   * arbitrary photograph behind it is an arbitrary contrast ratio. The scrim is
   * what keeps that from being true — so it is checked against the worst
   * wallpaper that exists: one whose pixels are pure black, and one whose
   * pixels are pure white.
   */
  it('never lets an image push text below AA, at any strength', () => {
    for (const appearance of sampleAppearances(400)) {
      const withImage = {
        ...appearance,
        wallpaper:
          'https://xyz.supabase.co/storage/v1/object/public/covers/uid/w.jpg',
        wallpaperStrength: 100,
      };
      const vars = customThemeVars(withImage);
      const share = 1 - scrimAlpha(vars);
      for (const pixel of ['#000000', '#ffffff']) {
        const composited = mix(vars['--color-paper'], pixel, share);
        for (const [text, min] of [
          [vars['--color-ink'], 4.5],
          [vars['--color-ink-soft'], 4.5],
          [vars['--color-ink-faint'], 3],
        ] as Array<[string, number]>) {
          const ratio = contrast(text, composited);
          expect(
            ratio,
            `${text} over a ${pixel} wallpaper at ${(share * 100).toFixed(0)}% is ` +
              `${ratio.toFixed(2)}:1, needs ${min}:1 (background ${appearance.background})`,
          ).toBeGreaterThanOrEqual(min);
        }
      }
    }
  });

  it('honours a strength below the ceiling rather than always maximising', () => {
    const base = {
      ...DEFAULT_CUSTOM,
      wallpaper: 'https://xyz.supabase.co/storage/v1/object/public/covers/uid/w.jpg',
    };
    const quiet = scrimAlpha(customThemeVars({ ...base, wallpaperStrength: 10 }));
    const loud = scrimAlpha(customThemeVars({ ...base, wallpaperStrength: 100 }));
    expect(quiet).toBeGreaterThan(loud);
    expect(quiet).toBeCloseTo(0.9, 5);
  });

  it('hides the image entirely when the palette has no headroom', () => {
    // Mid-gray admits at most ~4.6:1 with anything, so there is nothing left to
    // spend on an image. It gets scrimmed out rather than made unreadable.
    expect(
      wallpaperShare({
        ...DEFAULT_CUSTOM,
        background: '#808080',
        wallpaper: 'https://xyz.supabase.co/storage/v1/object/public/covers/uid/w.jpg',
        wallpaperStrength: 100,
      }),
    ).toBeLessThan(0.05);
  });

  /**
   * The point of solving the inks and the strength together: a background with
   * contrast to spare shows more of the image than one without, rather than
   * every theme getting the same timid dimming.
   */
  it('shows a usable amount of a wallpaper on an ordinary background', () => {
    const wallpaper =
      'https://xyz.supabase.co/storage/v1/object/public/covers/uid/w.jpg';
    expect(
      wallpaperShare({ ...DEFAULT_CUSTOM, wallpaper, wallpaperStrength: 100 }),
    ).toBeGreaterThan(0.25);
    expect(
      wallpaperShare({
        ...DEFAULT_CUSTOM,
        background: '#12100f',
        wallpaper,
        wallpaperStrength: 100,
      }),
    ).toBeGreaterThan(0.25);
  });

  it('treats a zero strength as no wallpaper at all', () => {
    const wallpaper =
      'https://xyz.supabase.co/storage/v1/object/public/covers/uid/w.jpg';
    expect(hasWallpaper({ ...DEFAULT_CUSTOM, wallpaper })).toBe(true);
    expect(hasWallpaper({ ...DEFAULT_CUSTOM, wallpaper, wallpaperStrength: 0 })).toBe(
      false,
    );
    expect(hasWallpaper(DEFAULT_CUSTOM)).toBe(false);
  });
});

describe('color primitives', () => {
  it('matches the WCAG reference points', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBeCloseTo(0, 5);
  });

  it('mixes in sRGB, the space a browser composites in', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(mix('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });
});
