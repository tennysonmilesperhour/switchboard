import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Stage, type ThemeId } from '../preview-helpers/stage';

function CardSet() {
  return (
    <div>
      <SectionHeader
        title="This week"
        hint="Three plans, two still deciding"
        action={
          <Button variant="ghost" size="sm">
            See all
          </Button>
        }
      />
      <div className="grid gap-3">
        <Card lifted>
          <h3 className="font-bold text-ink">Dinner at Nopa</h3>
          <p className="mt-1 text-sm text-ink-soft">Friday, 7:30pm. Four going, two deciding.</p>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Card tone="cream">
            <p className="text-sm font-semibold text-ink">Cream</p>
            <p className="text-xs text-ink-soft">Quiet surfaces</p>
          </Card>
          <Card tone="sage">
            <p className="text-sm font-semibold text-sage-deep">Sage</p>
            <p className="text-xs text-sage-deep">Available, accepted</p>
          </Card>
          <Card tone="terracotta">
            <p className="text-sm font-semibold text-terracotta-deep">Terracotta</p>
            <p className="text-xs text-terracotta-deep">Current, highlighted</p>
          </Card>
          <Card tone="gold">
            <p className="text-sm font-semibold text-gold-deep">Gold</p>
            <p className="text-xs text-gold-deep">Rewards, streaks</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

const cell = (theme: ThemeId) =>
  function Cell() {
    return (
      <Stage theme={theme}>
        <CardSet />
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
