import type { EventTheme } from './types';
import type { PlanColor } from '@/components/ui/PlanCard';

export interface EventThemeMeta {
  id: EventTheme;
  label: string;
  /** Maps to a plan-card gradient so the choice actually shows on the hero. */
  color: PlanColor;
}

/** The pickable event themes, in display order. 'default' keeps the classic
 *  varied palette (color shown here is just the swatch for the picker). */
export const EVENT_THEMES: EventThemeMeta[] = [
  { id: 'default', label: 'Classic', color: 'pink' },
  { id: 'sunrise', label: 'Sunrise', color: 'orange' },
  { id: 'dusk', label: 'Dusk', color: 'purple' },
  { id: 'meadow', label: 'Meadow', color: 'jade' },
  { id: 'ink', label: 'Ink', color: 'blue' },
  { id: 'blossom', label: 'Blossom', color: 'magenta' },
];

const BY_ID = Object.fromEntries(
  EVENT_THEMES.map((theme) => [theme.id, theme]),
) as Record<EventTheme, EventThemeMeta>;

/** The plan-card color for a theme, or null for 'default' so classic plans
 *  keep their id-hashed varied color. */
export function themeColor(theme: EventTheme): PlanColor | null {
  if (theme === 'default') return null;
  return BY_ID[theme]?.color ?? null;
}
