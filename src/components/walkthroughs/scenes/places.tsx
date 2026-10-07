'use client';

import { Icon } from '@/components/ui/Icon';
import { Glyph } from '@/components/ui/Glyph';
import { At, CountUp, Panel, Phone, Tap, Typed, useAt, useElapsed } from '../scene-kit';
import { PEOPLE, Person, TabBar, type PersonKey } from './shared';

/* Places and chance encounters. */

export function DiscoverIdeas() {
  const ideas = [
    { title: 'Sunset kayak on Lady Bird Lake', why: 'Outdoors, easy, golden hour at 7:40', at: 1900 },
    { title: 'Barton Springs, then tacos', why: 'Cool off, then the dinner you mentioned', at: 2400 },
    { title: 'Mount Bonnell picnic', why: 'Short climb, big view, bring snacks', at: 2900 },
  ];
  return (
    <Phone title="Explore">
      <div className="space-y-2">
        <Panel>
          <p className="text-[12px] text-ink">
            <Typed text="Something outdoorsy and chill on Sunday" from={200} cps={32} placeholder="What kind of evening?" />
          </p>
        </Panel>
        {ideas.map((idea, index) => (
          <At key={idea.title} ms={idea.at}>
            <Panel className="space-y-1">
              <p className="text-[12px] font-bold text-ink">{idea.title}</p>
              <p className="text-[10px] text-ink-faint">{idea.why}</p>
              {index === 0 && (
                <Tap at={3700}>
                  <span className="inline-block rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] font-bold text-white">
                    Make it a plan
                  </span>
                </Tap>
              )}
            </Panel>
          </At>
        ))}
      </div>
      <TabBar active="explore" />
    </Phone>
  );
}

export function Zones() {
  const inside = useAt(1500);
  return (
    <Phone title="Zones">
      <div className="space-y-2">
        <Panel className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-plan-purple text-white">
              <Glyph emoji="🎪" size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold text-ink">Austin Climbing Fest</span>
              <span className="block text-[10px] text-ink-faint">Zilker Park · ends Sunday</span>
            </span>
          </div>
          <Tap at={1100}>
            <div
              className={`rounded-xl py-1.5 text-center text-[11px] font-bold ${
                inside ? 'bg-sage text-white' : 'bg-brand-gradient text-white'
              }`}
            >
              {inside ? 'Checked in' : 'Check in'}
            </div>
          </Tap>
        </Panel>
        <At ms={1900}>
          <Panel className="space-y-1.5">
            <p className="text-[11px] font-bold text-ink">
              <CountUp to={23} from={1900} over={900} /> people here now
            </p>
            <div className="flex -space-x-1.5">
              {(Object.keys(PEOPLE) as PersonKey[]).map((who, index) => (
                <At key={who} ms={2100 + index * 150}>
                  <Person who={who} size="sm" />
                </At>
              ))}
            </div>
          </Panel>
        </At>
        <At ms={3300}>
          <p className="px-1 text-[10px] text-ink-faint">“Who else is here?” finally has an answer.</p>
        </At>
      </div>
    </Phone>
  );
}

export function Moments() {
  const elapsed = useElapsed();
  const steps = [
    { label: 'Someone nearby checked in too', at: 600 },
    { label: 'You’re both open to saying hi', at: 1500 },
    { label: 'You both agree to be revealed', at: 2400 },
  ];
  const revealed = elapsed >= 3200;
  return (
    <Phone title="Moments">
      <div className="space-y-2">
        {steps.map((step, index) => {
          const done = elapsed >= step.at;
          return (
            <Panel key={step.label} className="flex items-center gap-2">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors duration-300 ${
                  done ? 'bg-sage text-white' : 'bg-cream text-ink-faint'
                }`}
              >
                {done ? <Icon name="check" size={12} /> : index + 1}
              </span>
              <span className={`text-[11px] ${done ? 'text-ink' : 'text-ink-faint'}`}>{step.label}</span>
            </Panel>
          );
        })}
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-card p-2.5">
          <span
            className={`transition-all duration-500 ${revealed ? '' : 'blur-[5px] grayscale'}`}
          >
            <Person who="priya" />
          </span>
          <span className="text-[11px] text-ink">
            {revealed ? (
              <>
                It’s <b>Priya</b>, 40 m away
              </>
            ) : (
              'Hidden until both of you agree'
            )}
          </span>
        </div>
      </div>
    </Phone>
  );
}

export function MapLayers() {
  const elapsed = useElapsed();
  const layers = [
    { label: 'Plans', color: 'bg-plan-pink', at: 600 },
    { label: 'Zones', color: 'bg-plan-purple', at: 1500 },
    { label: 'Places', color: 'bg-plan-jade', at: 2400 },
  ];
  const pins = [
    { x: 22, y: 30, layer: 0 },
    { x: 64, y: 22, layer: 0 },
    { x: 46, y: 58, layer: 1 },
    { x: 78, y: 66, layer: 2 },
    { x: 30, y: 72, layer: 2 },
  ];
  return (
    <Phone title="Around">
      <div className="relative h-[calc(100%-36px)] overflow-hidden rounded-2xl border border-line bg-sage-soft">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="absolute left-[-10%] top-[45%] h-3 w-[120%] rotate-[-12deg] bg-card/80" />
        <div className="absolute left-[38%] top-[-10%] h-[120%] w-3 rotate-[8deg] bg-card/80" />
        {elapsed >= layers[1].at && (
          <div className="absolute left-[30%] top-[42%] size-20 animate-rise rounded-full border-2 border-plan-purple bg-plan-purple/15" />
        )}
        {pins.map((pin, index) =>
          elapsed >= layers[pin.layer].at + index * 80 ? (
            <span
              key={index}
              className={`absolute size-3.5 -translate-x-1/2 -translate-y-1/2 animate-rise rounded-full border-2 border-card shadow-lift ${layers[pin.layer].color}`}
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex gap-1">
        {layers.map((layer) => (
          <Tap key={layer.label} at={layer.at - 200}>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                elapsed >= layer.at ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
              }`}
            >
              <span className={`size-2 rounded-full ${layer.color}`} />
              {layer.label}
            </span>
          </Tap>
        ))}
      </div>
    </Phone>
  );
}
