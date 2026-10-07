'use client';

import { Icon } from '@/components/ui/Icon';
import { Glyph } from '@/components/ui/Glyph';
import { At, CountUp, Panel, Phone, Tap, useAt, useElapsed, useProgress } from '../scene-kit';

/* Deciding together. */

export function DecideRatings() {
  const elapsed = useElapsed();
  const options = [
    { name: 'Ramen Tatsu', pick: 0, at: 900 },
    { name: 'Thai Kitchen', pick: 1, at: 1700 },
    { name: 'Pizza Night In', pick: 2, at: 2500 },
  ];
  const marks = [
    { label: 'Love', on: 'bg-terracotta text-white border-terracotta' },
    { label: 'Good', on: 'bg-sage text-white border-sage' },
    { label: 'Rather not', on: 'bg-ink-soft text-white border-ink-soft' },
  ];
  return (
    <Phone title="Where for dinner?">
      <div className="space-y-2">
        {options.map((option) => (
          <Panel key={option.name} className="space-y-1.5">
            <p className="text-[12px] font-bold text-ink">{option.name}</p>
            <div className="grid grid-cols-3 gap-1">
              {marks.map((mark, index) => (
                <Tap key={mark.label} at={index === option.pick ? option.at : 99999}>
                  <span
                    className={`block rounded-full border py-0.5 text-center text-[10px] font-semibold transition-colors duration-200 ${
                      index === option.pick && elapsed >= option.at
                        ? mark.on
                        : 'border-line text-ink-soft'
                    }`}
                  >
                    {mark.label}
                  </span>
                </Tap>
              ))}
            </div>
          </Panel>
        ))}
        <At ms={3200}>
          <p className="flex items-center gap-1 rounded-xl bg-cream px-2.5 py-2 text-[10px] text-ink-soft">
            <Glyph emoji="🔒" size={12} /> Your ratings are private. Nobody sees who voted what.
          </p>
        </At>
      </div>
    </Phone>
  );
}

export function AvailabilityGrid() {
  const elapsed = useElapsed();
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const slots = ['Morn', 'Aft', 'Eve'];
  // How many of five people are free in each cell, revealed column by column.
  const counts = [
    [1, 2, 0, 1, 2, 3, 2],
    [0, 1, 1, 2, 2, 4, 3],
    [2, 3, 2, 3, 5, 3, 1],
  ];
  return (
    <Phone title="When is everyone free">
      <div className="space-y-2">
        <Panel>
          <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-1">
            <span />
            {days.map((day, index) => (
              <span key={index} className="text-center text-[9px] font-bold text-ink-faint">
                {day}
              </span>
            ))}
            {slots.map((slot, row) => (
              <Row key={slot} slot={slot} counts={counts[row]} row={row} elapsed={elapsed} />
            ))}
          </div>
        </Panel>
        <At ms={2900}>
          <Panel className="flex items-center gap-2 border-sage">
            <span className="size-3 rounded bg-sage" />
            <span className="text-[11px] text-ink">
              <b>Friday evening</b>: all 5 are free
            </span>
          </Panel>
        </At>
        <At ms={3400}>
          <p className="px-1 text-[10px] text-ink-faint">
            The group sees how many are free, never who.
          </p>
        </At>
      </div>
    </Phone>
  );
}

function Row({
  slot,
  counts,
  row,
  elapsed,
}: {
  slot: string;
  counts: number[];
  row: number;
  elapsed: number;
}) {
  return (
    <>
      <span className="self-center text-[9px] font-bold text-ink-faint">{slot}</span>
      {counts.map((count, column) => {
        const shown = elapsed >= 300 + column * 260 + row * 90;
        const best = count === 5 && elapsed >= 2700;
        return (
          <span
            key={column}
            className={`aspect-square rounded-[5px] transition-all duration-300 ${
              best ? 'ring-2 ring-sage ring-offset-1 ring-offset-card' : ''
            }`}
            style={{
              backgroundColor: shown
                ? `color-mix(in srgb, var(--color-sage) ${count * 20}%, var(--color-line))`
                : 'var(--color-line)',
            }}
          />
        );
      })}
    </>
  );
}

export function Consensus() {
  const bars = [
    { name: 'Ramen Tatsu', share: 0.62, tone: 'bg-terracotta' },
    { name: 'Thai Kitchen', share: 0.28, tone: 'bg-plan-purple' },
    { name: 'Pizza Night In', share: 0.1, tone: 'bg-plan-blue' },
  ];
  const grow = useProgress(400, 1800);
  return (
    <Phone title="Where for dinner?">
      <div className="space-y-2">
        <Panel className="space-y-2.5">
          <p className="text-[11px] font-bold text-ink">Where it’s leaning</p>
          {bars.map((bar) => (
            <div key={bar.name} className="space-y-0.5">
              <div className="flex justify-between text-[10px]">
                <span className="font-semibold text-ink">{bar.name}</span>
                <span className="text-ink-faint">{Math.round(bar.share * grow * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div className={`h-full rounded-full ${bar.tone}`} style={{ width: `${bar.share * grow * 100}%` }} />
              </div>
            </div>
          ))}
        </Panel>
        <At ms={2400}>
          <Panel className="flex items-center justify-between">
            <span className="text-[11px] text-ink-soft">Rated so far</span>
            <span className="text-[13px] font-extrabold text-ink">
              <CountUp to={7} from={2400} over={700} /> of 8
            </span>
          </Panel>
        </At>
        <At ms={3200}>
          <p className="px-1 text-[10px] text-ink-faint">
            Totals only. No names, no individual votes.
          </p>
        </At>
      </div>
    </Phone>
  );
}

export function PollCloses() {
  const closed = useAt(2200);
  const seconds = Math.max(0, 3 - Math.floor(useElapsed() / 700));
  return (
    <Phone title="Where for dinner?">
      <div className="space-y-2">
        <Panel className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] font-bold text-ink">
            <Glyph emoji="⏳" size={13} /> {closed ? 'Poll closed' : 'Closes in'}
          </span>
          {!closed && (
            <span className="font-mono text-[12px] font-bold text-terracotta-deep">0:0{seconds}</span>
          )}
        </Panel>
        <At ms={2400}>
          <div className="space-y-1 rounded-2xl bg-sage-soft p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-sage-deep">Winner</p>
            <p className="text-[16px] font-extrabold text-ink">Ramen Tatsu</p>
            <p className="text-[11px] text-ink-soft">Friday · 7:00 PM</p>
          </div>
        </At>
        <At ms={3100}>
          <Panel className="flex items-center gap-2">
            <Icon name="calendar" size={14} className="text-terracotta" />
            <span className="text-[11px] text-ink">The winning time is now the plan’s date.</span>
          </Panel>
        </At>
        <At ms={3600}>
          <Panel className="flex items-center gap-2">
            <Icon name="bell" size={14} className="text-terracotta" />
            <span className="text-[11px] text-ink">Everyone who was asked hears the result.</span>
          </Panel>
        </At>
      </div>
    </Phone>
  );
}
