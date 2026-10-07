import { Chip } from '@/components/ui/Chip';
import { Stage, type ThemeId } from '../preview-helpers/stage';

function ChipSet() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-ink">What are you up for?</p>
      <div className="flex flex-wrap gap-2">
        <Chip emoji="🍜" selected>
          Ramen
        </Chip>
        <Chip emoji="🎬">Movie</Chip>
        <Chip emoji="🥾" selected>
          Hike
        </Chip>
        <Chip emoji="🎲">Board games</Chip>
        <Chip emoji="☕">Coffee</Chip>
        <Chip>Anything</Chip>
      </div>
    </div>
  );
}

const cell = (theme: ThemeId) =>
  function Cell() {
    return (
      <Stage theme={theme}>
        <ChipSet />
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
