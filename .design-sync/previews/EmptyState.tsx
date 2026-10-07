import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stage, type ThemeId } from '../preview-helpers/stage';

const cell = (theme: ThemeId) =>
  function Cell() {
    return (
      <Stage theme={theme}>
        <EmptyState
          emoji="🗓️"
          title="No plans yet"
          body="Start one and invite a few people. Nobody sees it until they say yes."
          action={<Button>Start something</Button>}
        />
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
