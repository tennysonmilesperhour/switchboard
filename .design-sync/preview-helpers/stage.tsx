import type { CSSProperties, ReactNode } from 'react';

/*
 * Shared helper for the authored previews: renders one cell per appearance
 * preset. A preset is only a token override on `[data-theme]` (see
 * src/app/globals.css), so wrapping a component in an element carrying the
 * attribute restyles it exactly as the root layout would restyle the whole
 * app. Not a component of the design system; nothing here is uploaded as one.
 */

export type ThemeId = 'default' | 'almanac' | 'dusk' | 'transit' | 'afterparty' | 'guestlist' | 'prompt';

export const THEMES: ReadonlyArray<{ id: ThemeId; name: string }> = [
  { id: 'default', name: 'Switchboard' },
  { id: 'almanac', name: 'Almanac' },
  { id: 'dusk', name: 'Dusk' },
  { id: 'transit', name: 'Transit' },
  { id: 'afterparty', name: 'Afterparty' },
  { id: 'guestlist', name: 'Guestlist' },
  { id: 'prompt', name: 'Prompt' },
];

// The root layout puts the saved preset on <html data-theme>; with no saved
// preset the OS color scheme picks Dusk. The preview page has no layout, so
// pin the root to the default palette the same way a saved "Switchboard"
// choice does, or a dark-mode viewer sees Dusk in every "Switchboard" cell.
if (typeof document !== 'undefined' && !document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = 'default';
}

const STAGE_STYLE: CSSProperties = {
  background: 'var(--color-paper)',
  color: 'var(--color-ink)',
  fontFamily: 'var(--font-sans)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-lift)',
};

interface StageProps {
  theme: ThemeId;
  children: ReactNode;
  /** Extra inline style on the padded stage, for width or height. */
  style?: CSSProperties;
  /** Drop the padding, for full-bleed content like the bottom nav. */
  flush?: boolean;
}

/** One preset's rendering of whatever it wraps, labeled with the preset name. */
export function Stage({ theme, children, style, flush = false }: StageProps) {
  const name = THEMES.find((t) => t.id === theme)?.name ?? theme;
  return (
    <div data-theme={theme} style={{ ...STAGE_STYLE, ...style }}>
      <div
        style={{
          padding: flush ? '12px 16px 0' : '12px 16px 0',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-ink-faint)',
        }}
      >
        {name}
      </div>
      <div style={{ padding: flush ? '12px 0 0' : 16 }}>{children}</div>
    </div>
  );
}
