import { Button } from '@/components/ui/Button';
import { Stage, type ThemeId } from '../preview-helpers/stage';

function ButtonSet() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button>Start something</Button>
        <Button variant="secondary">Maybe later</Button>
        <Button variant="ghost">Not now</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="accept">I am in</Button>
        <Button variant="danger">Decline</Button>
        <Button disabled>Invite sent</Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>
    </div>
  );
}

const cell = (theme: ThemeId) =>
  function Cell() {
    return (
      <Stage theme={theme}>
        <ButtonSet />
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
