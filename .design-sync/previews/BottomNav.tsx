import { BottomNav } from '@/components/shell/BottomNav';
import { PathnameProvider } from '../pkg/shims/next-navigation';
import { Stage, type ThemeId } from '../preview-helpers/stage';

/*
 * BottomNav is `position: fixed`. A transformed ancestor becomes its containing
 * block, so each cell is a short phone-width frame the bar sits at the bottom
 * of, instead of every cell's bar piling up at the bottom of the page.
 */
function Frame({ pathname }: { pathname: string }) {
  return (
    <PathnameProvider pathname={pathname}>
      <div
        style={{
          position: 'relative',
          height: 168,
          overflow: 'hidden',
          transform: 'translateZ(0)',
          borderRadius: '0 0 var(--radius-card) var(--radius-card)',
        }}
      >
        <p className="px-4 text-sm text-ink-soft">Active route: {pathname}</p>
        <BottomNav />
      </div>
    </PathnameProvider>
  );
}

const cell = (theme: ThemeId, pathname: string) =>
  function Cell() {
    return (
      <Stage theme={theme} flush>
        <Frame pathname={pathname} />
      </Stage>
    );
  };

export const Switchboard = cell('default', '/');
export const Almanac = cell('almanac', '/discover');
export const Dusk = cell('dusk', '/plans');
export const Transit = cell('transit', '/people');
export const Afterparty = cell('afterparty', '/');
export const Guestlist = cell('guestlist', '/discover');
export const Prompt = cell('prompt', '/plans');
