'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ImageInput } from '@/components/ui/ImageInput';
import { useToast } from '@/components/ui/Toast';
import { updateAppearanceTheme, updateCustomAppearance } from '@/lib/actions/profile';
import { APP_THEMES, type AppThemeId } from '@/lib/themes-app';
import { paletteFromImage } from '@/lib/client/image-palette';
import {
  DEFAULT_CUSTOM,
  customThemeVars,
  hasWallpaper,
  wallpaperShare,
  type CustomAppearance,
} from '@/lib/theme-custom';

interface AppearancePickerProps {
  current: AppThemeId;
  /** The person's saved custom palette, or the defaults if they've never set one. */
  custom: CustomAppearance;
  userId: string;
  /** Whether the earned preset is unlocked yet. */
  passportComplete: boolean;
}

/**
 * The appearance picker.
 *
 * Applies on tap rather than through the settings save bar: a theme is the one
 * setting whose result you judge by looking at it, and "pick, then scroll down
 * and press Save to find out" is the wrong shape for that.
 *
 * The selection is held in ordinary state rather than `useOptimistic`, because
 * optimistic state is defined to revert the moment its transition settles, and
 * a `router.refresh()` fired inside that transition is not awaited by it. Every
 * tap therefore flickered back to the saved value for as long as the refetch
 * took — which was invisible while saving worked and became the entire symptom
 * once it stopped: the theme you picked reverting a second later, with no error
 * to explain it. What was actually broken was the read (see the migration in
 * 20260819120000), but the picker was making a real failure look like a UI
 * glitch, and it should not have been able to. Now a tap holds what it says
 * until the server contradicts it, and the server contradicting it is a toast.
 *
 * The locked preset stays visible rather than being hidden, because a reward
 * you can't see isn't one. It says what unlocks it and doesn't nag.
 */
export function AppearancePicker({
  current,
  custom,
  userId,
  passportComplete,
}: AppearancePickerProps) {
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState<AppThemeId>(current);
  const router = useRouter();
  const toast = useToast();

  // Follow the server when it changes underneath us — a save elsewhere, a
  // refresh, a back-navigation — without discarding the tap in flight. Adjusted
  // during render rather than in an effect: an effect would paint the stale
  // value first, which is the flicker this component is here to stop having.
  const [lastCurrent, setLastCurrent] = useState(current);
  if (current !== lastCurrent && !pending) {
    setLastCurrent(current);
    setShown(current);
  }

  function choose(id: AppThemeId, locked: boolean) {
    if (locked || id === shown) return;
    const previous = shown;
    setShown(id);
    startTransition(async () => {
      const result = await updateAppearanceTheme(id);
      if (!result.ok) {
        setShown(previous);
        toast.error(result.error ?? 'Could not change the look.', result.code);
        return;
      }
      router.refresh();
    });
  }

  // The custom card previews the palette as it will actually render — a button
  // color is deepened when white labels need it, and a swatch showing the raw
  // pick would be the one place in Settings that lies about the result.
  const rendered = customThemeVars(custom);
  const customSwatches = [
    rendered['--color-paper'],
    rendered['--color-gold'],
    rendered['--color-terracotta'],
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5" aria-busy={pending}>
        {APP_THEMES.map((theme) => {
          const locked = Boolean(theme.earned) && !passportComplete;
          const selected = theme.id === shown;
          return (
            <button
              key={theme.id}
              type="button"
              disabled={pending || locked}
              aria-pressed={selected}
              onClick={() => choose(theme.id, locked)}
              className={`rounded-card border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                selected
                  ? 'border-terracotta shadow-lift'
                  : 'border-line hover:border-terracotta'
              } ${locked ? 'opacity-60' : ''}`}
            >
              <span className="flex gap-1" aria-hidden>
                {(theme.custom ? customSwatches : theme.swatches).map((color, index) => (
                  <span
                    key={index}
                    style={{ background: color }}
                    className="size-5 rounded-full border border-black/10"
                  />
                ))}
              </span>
              <span className="mt-2 flex items-center gap-1.5">
                <span className="font-bold text-ink">{theme.name}</span>
                {selected && (
                  <span className="text-xs font-bold text-terracotta">✓ on</span>
                )}
                {locked && <span aria-hidden>🔒</span>}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-faint">
                {locked
                  ? 'Unlocks once you’ve tried everything Switchboard does.'
                  : theme.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {shown === 'custom' ? <CustomEditor saved={custom} userId={userId} /> : null}
    </>
  );
}

/**
 * The editor for the custom preset: a wallpaper, three colors, and how much of
 * the image to let through.
 *
 * Edits preview against the whole app rather than a swatch in a box, because
 * the question a person is actually asking is "can I read my plans on top of
 * this photo", and no thumbnail answers that. The preview writes the derived
 * tokens straight onto `<html>` — the same properties the server sets — and
 * puts back exactly what it found when it unmounts, so leaving without saving
 * leaves nothing behind.
 */
function CustomEditor({
  saved,
  userId,
}: {
  saved: CustomAppearance;
  userId: string;
}) {
  const [draft, setDraft] = useState<CustomAppearance>(saved);
  const [matching, setMatching] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  // The saved value wins whenever it actually changes — a successful save
  // refreshes the page, and the draft should become the new truth rather than
  // stay a pending edit forever. Compared by content, so the parent
  // re-rendering with an equal object does not throw away an edit in progress.
  const savedKey = JSON.stringify(saved);
  const [lastSaved, setLastSaved] = useState(savedKey);
  if (savedKey !== lastSaved) {
    setLastSaved(savedKey);
    setDraft(saved);
  }

  const vars = useMemo(() => customThemeVars(draft), [draft]);
  const share = useMemo(() => wallpaperShare(draft), [draft]);
  const dirty = JSON.stringify(draft) !== savedKey;

  usePreview(vars, hasWallpaper(draft));

  async function matchToImage() {
    if (!draft.wallpaper) return;
    setMatching(true);
    const palette = await paletteFromImage(draft.wallpaper, draft);
    setMatching(false);
    if (palette.background === draft.background && palette.button === draft.button) {
      toast.error('Couldn’t read colors out of that image.');
      return;
    }
    setDraft((previous) => ({ ...previous, ...palette }));
  }

  function save() {
    startTransition(async () => {
      const result = await updateCustomAppearance(draft);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save that look.', result.code);
        return;
      }
      router.refresh();
    });
  }

  // Requested strength above what the palette can carry: the slider stops
  // having an effect, and a control that silently stops working is worse than
  // one that says why.
  const clamped = Boolean(draft.wallpaper) && share * 100 < draft.wallpaperStrength - 1;

  return (
    <div className="mt-4 rounded-card border border-line p-4" aria-busy={pending}>
      <p className="text-sm font-bold text-ink">Make it yours</p>
      <p className="mt-0.5 text-xs leading-snug text-ink-faint">
        Pick a picture and three colors. Everything else — text, lines, the
        going/can’t-make-it colors — is worked out from them so it stays
        readable. A very pale button color comes out deeper than you picked it,
        because button labels are white.
      </p>

      <div className="mt-3">
        <ImageInput
          value={draft.wallpaper ?? ''}
          onChange={(url) =>
            setDraft((previous) => ({ ...previous, wallpaper: url || null }))
          }
          userId={userId}
          bucket="covers"
          pathPrefix="wallpaper"
          label="wallpaper"
          allowLink={false}
        />
      </div>

      {draft.wallpaper ? (
        <>
          <button
            type="button"
            onClick={matchToImage}
            disabled={matching}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink transition hover:border-terracotta disabled:opacity-60"
          >
            <Icon name="sparkle" size={14} />
            {matching ? 'Reading the picture…' : 'Match colors to this picture'}
          </button>

          <label className="mt-4 block">
            <span className="flex items-baseline justify-between text-xs font-bold text-ink">
              How much of the picture shows
              <span className="font-semibold text-ink-faint">
                {Math.round(share * 100)}%
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={draft.wallpaperStrength}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  wallpaperStrength: Number(event.target.value),
                }))
              }
              className="mt-1.5 w-full accent-terracotta"
            />
          </label>
          {clamped ? (
            <p className="mt-1 text-xs leading-snug text-ink-faint">
              Held at {Math.round(share * 100)}% so the text on top of it stays
              readable. A background further from mid-gray lets more through.
            </p>
          ) : null}
        </>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ColorField
          label="Background"
          value={draft.background}
          onChange={(background) => setDraft((previous) => ({ ...previous, background }))}
        />
        <ColorField
          label="Buttons"
          value={draft.button}
          onChange={(button) => setDraft((previous) => ({ ...previous, button }))}
        />
        <ColorField
          label="Highlight"
          value={draft.highlight}
          onChange={(highlight) => setDraft((previous) => ({ ...previous, highlight }))}
        />
      </div>

      <Preview vars={vars} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-pill bg-brand-gradient px-4 py-2 text-sm font-bold text-white shadow-lift transition active:scale-[0.97] disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Use these'}
        </button>
        {dirty ? (
          <button
            type="button"
            onClick={() => setDraft(saved)}
            className="rounded-pill border border-line px-4 py-2 text-sm font-bold text-ink transition hover:border-terracotta"
          >
            Undo changes
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setDraft({ ...DEFAULT_CUSTOM, wallpaper: draft.wallpaper })}
          className="text-xs font-medium text-ink-faint underline decoration-line underline-offset-2 hover:text-ink"
        >
          Start from the standard colors
        </button>
      </div>
    </div>
  );
}

/**
 * Apply a palette to the live document while it is being edited, and put back
 * exactly what was there on the way out.
 *
 * `<html>`'s inline style is the server's, so the snapshot is taken per property
 * — set what was set, remove what was not — rather than by clobbering
 * `style.cssText`, which would also throw away anything else living there.
 */
function usePreview(vars: Record<string, string>, wallpaper: boolean) {
  const restore = useRef<(() => void) | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!restore.current) {
      const style = root.getAttribute('style');
      const themeAttribute = root.getAttribute('data-theme');
      const wallpaperAttribute = root.getAttribute('data-wallpaper');
      restore.current = () => {
        if (style === null) root.removeAttribute('style');
        else root.setAttribute('style', style);
        if (themeAttribute === null) root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', themeAttribute);
        if (wallpaperAttribute === null) root.removeAttribute('data-wallpaper');
        else root.setAttribute('data-wallpaper', wallpaperAttribute);
      };
    }
    for (const [token, value] of Object.entries(vars)) {
      root.style.setProperty(token, value);
    }
    root.setAttribute('data-theme', 'custom');
    if (wallpaper) root.setAttribute('data-wallpaper', 'on');
    else root.removeAttribute('data-wallpaper');
  }, [vars, wallpaper]);

  useEffect(
    () => () => {
      restore.current?.();
      restore.current = null;
    },
    [],
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-ink">{label}</span>
      <span className="mt-1 flex items-center gap-1.5 rounded-card border border-line bg-card px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          aria-label={label}
          className="size-7 shrink-0 cursor-pointer rounded border-none bg-transparent p-0"
        />
        <span className="truncate font-mono text-xs text-ink-soft">{value}</span>
      </span>
    </label>
  );
}

/**
 * A miniature of the app in the palette being edited — scoped by setting the
 * same custom properties on a wrapper, so it needs no styles of its own.
 *
 * It exists for the case the live preview cannot cover: choosing colors while
 * some OTHER preset is still applied, before committing to this one.
 */
function Preview({ vars }: { vars: Record<string, string> }) {
  return (
    <div
      style={vars as React.CSSProperties}
      className="mt-4 overflow-hidden rounded-card border border-line"
    >
      <div className="bg-paper p-3">
        <div className="rounded-card bg-card p-3 shadow-lift">
          <p className="text-sm font-bold text-ink">Thursday, 7pm</p>
          <p className="mt-0.5 text-xs text-ink-soft">Six people said yes</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-pill bg-brand-gradient px-2.5 py-1 text-xs font-bold text-white">
              I’m in
            </span>
            <span className="rounded-pill bg-sage-soft px-2.5 py-1 text-xs font-bold text-sage-deep">
              Going
            </span>
            <span className="rounded-pill bg-rose-soft px-2.5 py-1 text-xs font-bold text-rose-deep">
              Can’t
            </span>
            <span className="rounded-pill bg-gold-soft px-2.5 py-1 text-xs font-bold text-gold-deep">
              Stamped
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-faint">And this is quieter text.</p>
      </div>
    </div>
  );
}

/** The section wrapper, so the settings page stays declarative. */
export function AppearanceSection(props: AppearancePickerProps) {
  return (
    <Card>
      <AppearancePicker {...props} />
    </Card>
  );
}
