import { Button } from '@/components/ui/Button';
import { PLAN_COLORS, PlanCard, planColor } from '@/components/ui/PlanCard';
import { Stage, THEMES, type ThemeId } from '../preview-helpers/stage';

const ATTENDEES = [
  { name: 'Priya Natarajan' },
  { name: 'Marcus Lee' },
  { name: 'Jo Alvarez' },
  { name: 'Sam Okafor' },
];

function FullCard({ index }: { index: number }) {
  return (
    <PlanCard
      title="Sunset ramen run"
      color={planColor(index)}
      status="Deciding"
      attendees={ATTENDEES}
      attendeesLabel="You and 3 others"
      when="Fri 7:30pm"
      dateLabel="Oct 10"
      where="Nopa, Divisadero"
      distance="1.2 mi"
      actions={
        <>
          <Button variant="accept">I am in</Button>
          <Button variant="secondary">Maybe</Button>
        </>
      }
    />
  );
}

/** Compact and tile variants, one tile per plan color, in the default theme. */
export function Variants() {
  return (
    <Stage theme="default">
      <div className="flex flex-col gap-3">
        <PlanCard
          variant="compact"
          title="Board games at Dee's place"
          color="purple"
          attendees={ATTENDEES}
          when="Sat 6pm"
          dateLabel="Oct 11"
          where="Mission, SF"
          distance="0.8 mi"
        />
        <div className="grid grid-cols-3 gap-2">
          {PLAN_COLORS.map((color, i) => (
            <PlanCard
              key={color}
              variant="tile"
              title={['Morning hike', 'Pho night', 'Open mic', 'Pickup soccer', 'Gallery walk', 'Karaoke'][i]}
              color={color}
              status={i === 0 ? 'New' : undefined}
              when="Sun"
              dateLabel="Oct 12"
              attendees={ATTENDEES.slice(0, 2)}
            />
          ))}
        </div>
      </div>
    </Stage>
  );
}

const cell = (theme: ThemeId) =>
  function Cell() {
    const index = THEMES.findIndex((t) => t.id === theme);
    return (
      <Stage theme={theme}>
        <FullCard index={index} />
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
