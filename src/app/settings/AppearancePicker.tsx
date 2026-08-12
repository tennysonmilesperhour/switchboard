'use client';

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { updateAppearanceTheme } from '@/lib/actions/profile';
import { APP_THEMES, type AppThemeId } from '@/lib/themes-app';

interface AppearancePickerProps {
  current: AppThemeId;
  /** Whether the earned preset is unlocked yet. */
  passportComplete: boolean;
}

/**
 * The appearance picker.
 *
 * Applies on tap rather than through the settings save bar: a theme is the one
 * setting whose result you judge by looking at it, and "pick, then scroll down
 * and press Save to find out" is the wrong shape for that. `router.refresh()`
 * re-renders the root layout, which is where `data-theme` lives.
 *
 * The locked preset stays visible rather than being hidden, because a reward
 * you can't see isn't one. It says what unlocks it and doesn't nag.
 */
export function AppearancePicker({ current, passportComplete }: AppearancePickerProps) {
  const [pending, startTransition] = useTransition();
  const [shown, showTheme] = useOptimistic(current, (_, next: AppThemeId) => next);
  const router = useRouter();
  const toast = useToast();

  function choose(id: AppThemeId, locked: boolean) {
    if (locked || id === shown) return;
    startTransition(async () => {
      showTheme(id);
      const result = await updateAppearanceTheme(id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not change the look.', result.code);
        return;
      }
      router.refresh();
    });
  }

  return (
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
              {theme.swatches.map((color, index) => (
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
