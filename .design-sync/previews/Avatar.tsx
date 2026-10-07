import { Avatar, AvatarCluster } from '@/components/ui/Avatar';
import { Stage, type ThemeId } from '../preview-helpers/stage';

const PEOPLE = [
  { name: 'Priya Natarajan' },
  { name: 'Marcus Lee' },
  { name: 'Jo Alvarez' },
  { name: 'Sam Okafor' },
  { name: 'Dee Winters' },
  { name: 'Ravi Shah' },
];

function AvatarSet() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <Avatar name="Priya Natarajan" size="xs" />
        <Avatar name="Marcus Lee" size="sm" />
        <Avatar name="Jo Alvarez" size="md" />
        <Avatar name="Sam Okafor" size="lg" />
        <Avatar name="Dee Winters" size="xl" />
      </div>
      <div className="flex items-center gap-4">
        <Avatar name="Marcus Lee" size="lg" signal={{ emoji: '🍜', label: 'ramen' }} />
        <div>
          <p className="text-sm font-semibold text-ink">Marcus is up for ramen</p>
          <p className="text-xs text-ink-faint">Signal ring, sage, with the emoji badge</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <AvatarCluster people={PEOPLE} />
        <div className="rounded-card bg-terracotta p-3">
          <AvatarCluster people={PEOPLE} max={3} onColor />
        </div>
      </div>
    </div>
  );
}

const cell = (theme: ThemeId) =>
  function Cell() {
    return (
      <Stage theme={theme}>
        <AvatarSet />
      </Stage>
    );
  };

export const Switchboard = cell('default');
export const Almanac = cell('almanac');
export const Dusk = cell('dusk');
export const Transit = cell('transit');
export const Afterparty = cell('afterparty');
export const Guestlist = cell('guestlist');
export const Prompt = cell('prompt');
