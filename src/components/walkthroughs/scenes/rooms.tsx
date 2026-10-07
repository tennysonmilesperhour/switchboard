'use client';

import { Glyph } from '@/components/ui/Glyph';
import { At, Panel, Phone, Tap, useAt } from '../scene-kit';
import { PEOPLE, Person, type PersonKey } from './shared';

/* Keeping it together. */

export function RoomPhotos() {
  const tiles = [
    'from-plan-pink to-plan-purple',
    'from-plan-blue to-plan-jade',
    'from-gold to-plan-orange',
    'from-plan-jade to-plan-blue',
    'from-plan-purple to-plan-magenta',
    'from-plan-orange to-plan-pink',
  ];
  return (
    <Phone title="Lena’s birthday">
      <div className="mb-2 flex gap-1 text-[10px] font-bold">
        <span className="rounded-full bg-cream px-2 py-0.5 text-ink-faint">Chat</span>
        <span className="rounded-full bg-ink px-2 py-0.5 text-paper">Photos</span>
        <span className="rounded-full bg-cream px-2 py-0.5 text-ink-faint">Tasks</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {tiles.map((tile, index) => (
          <At key={tile} ms={300 + index * 380}>
            <div className={`aspect-square rounded-lg bg-gradient-to-br ${tile}`} />
          </At>
        ))}
      </div>
      <At ms={2800}>
        <p className="mt-2 flex items-center gap-1 px-1 text-[10px] text-ink-faint">
          <Glyph emoji="🔒" size={11} /> Only people in this room can open these.
        </p>
      </At>
    </Phone>
  );
}

export function SplitBill() {
  const settled = useAt(3700);
  return (
    <Phone title="Split">
      <div className="space-y-2">
        <At ms={200}>
          <Panel className="flex items-center gap-2">
            <Person who="maya" />
            <span className="min-w-0 flex-1 text-[11px] text-ink">
              <b>Maya</b> paid for dinner
            </span>
            <span className="text-[12px] font-extrabold text-ink">$84</span>
          </Panel>
        </At>
        <At ms={800}>
          <Panel className="flex items-center gap-2">
            <Person who="priya" />
            <span className="min-w-0 flex-1 text-[11px] text-ink">
              <b>Priya</b> paid for the cab
            </span>
            <span className="text-[12px] font-extrabold text-ink">$24</span>
          </Panel>
        </At>
        <At ms={1600}>
          <p className="px-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
            Who owes whom
          </p>
        </At>
        <At ms={1900}>
          <Panel className="flex items-center justify-between">
            <span className="text-[11px] text-ink">You → Maya</span>
            <span className="text-[12px] font-bold text-ink">$27</span>
          </Panel>
        </At>
        <At ms={2300}>
          <Panel className="flex items-center justify-between">
            <span className="text-[11px] text-ink">Jordan → Maya</span>
            <span className="text-[12px] font-bold text-ink">$27</span>
          </Panel>
        </At>
        <At ms={2900}>
          <Tap at={3400}>
            <div
              className={`rounded-xl py-2 text-center text-[12px] font-bold ${
                settled ? 'bg-sage-soft text-sage-deep' : 'bg-sage text-white'
              }`}
            >
              {settled ? 'Settled up' : 'Mark settled'}
            </div>
          </Tap>
        </At>
      </div>
    </Phone>
  );
}

export function MemoryCapsule() {
  const lines: { who: PersonKey; text: string; tile: string; at: number }[] = [
    { who: 'maya', text: 'Best salsa of my life.', tile: 'from-plan-pink to-plan-orange', at: 500 },
    { who: 'priya', text: 'Jordan’s toast. Iconic.', tile: 'from-plan-blue to-plan-purple', at: 1500 },
    { who: 'jordan', text: 'Same time next month?', tile: 'from-plan-jade to-gold', at: 2500 },
  ];
  return (
    <Phone title="Memory capsule">
      <div className="space-y-2">
        <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
          Tacos at Lupe’s · Friday
        </p>
        {lines.map((line) => (
          <At key={line.who} ms={line.at}>
            <Panel className="flex items-center gap-2">
              <div className={`size-10 shrink-0 rounded-lg bg-gradient-to-br ${line.tile}`} />
              <div className="min-w-0">
                <p className="text-[11px] italic text-ink">“{line.text}”</p>
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-faint">
                  <Person who={line.who} size="sm" /> {PEOPLE[line.who].name.split(' ')[0]}
                </p>
              </div>
            </Panel>
          </At>
        ))}
        <At ms={3400}>
          <p className="px-1 text-[10px] text-ink-faint">One line and one photo each. It stays.</p>
        </At>
      </div>
    </Phone>
  );
}
