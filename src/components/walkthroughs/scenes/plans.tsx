'use client';

import { Icon } from '@/components/ui/Icon';
import { Glyph } from '@/components/ui/Glyph';
import { At, Panel, Phone, Pill, Tap, Typed, useAt, useElapsed, useProgress } from '../scene-kit';
import { Person, Field, GradientButton, type PersonKey } from './shared';

/* Making a plan. */

export function ImportLink() {
  return (
    <Phone title="New plan">
      <div className="space-y-2">
        <Panel className="space-y-1.5">
          <p className="flex items-center gap-1 text-[10px] font-bold text-ink-faint">
            <Icon name="link" size={12} /> Import from a link
          </p>
          <p className="truncate rounded-lg bg-cream px-2 py-1.5 font-mono text-[10px] text-ink">
            <Typed text="partiful.com/e/rooftop-bday" from={300} cps={34} placeholder="Paste a link" />
          </p>
        </Panel>
        <At ms={1500}>
          <p className="flex items-center gap-1 px-1 text-[10px] font-bold text-sage-deep">
            <Icon name="check" size={12} /> Details came across
          </p>
        </At>
        <At ms={1800} keep>
          <div className="h-16 rounded-2xl bg-gradient-to-br from-plan-purple to-plan-pink" />
        </At>
        <At ms={2100} keep>
          <Field label="What">Lena’s rooftop birthday</Field>
        </At>
        <At ms={2400} keep>
          <Field label="When">Sat, June 14 · 8:00 PM</Field>
        </At>
        <At ms={2700} keep>
          <Field label="Where">The Roof at Hotel Vera</Field>
        </At>
      </div>
    </Phone>
  );
}

export function CascadePreview() {
  const elapsed = useElapsed();
  const steps = [
    { at: 600, time: 'Now', text: 'Maya and Jordan get the invite' },
    { at: 1400, time: '+6 hrs', text: 'If either passes, Priya is next' },
    { at: 2200, time: '+12 hrs', text: 'Then Sam, if a spot is still open' },
    { at: 3000, time: 'Thu', text: 'Invites stop. Friday is the plan.' },
  ];
  const progress = Math.max(0, Math.min(1, (elapsed - 400) / 2800));
  return (
    <Phone title="Review">
      <div className="space-y-2">
        <Panel>
          <p className="text-[11px] font-bold text-ink">Preview the chain</p>
          <p className="text-[10px] text-ink-faint">Nothing is sent until you tap Send.</p>
        </Panel>
        <div className="relative pl-4">
          <span className="absolute left-1.5 top-1 bottom-1 w-0.5 rounded bg-line" />
          <span
            className="absolute left-1.5 top-1 w-0.5 rounded bg-terracotta"
            style={{ height: `${progress * 100}%` }}
          />
          <div className="space-y-2">
            {steps.map((step) => (
              <At key={step.text} ms={step.at} keep>
                <div className="relative">
                  <span className="absolute -left-[13px] top-1 size-2.5 rounded-full border-2 border-terracotta bg-card" />
                  <p className="text-[9px] font-bold uppercase text-terracotta-deep">{step.time}</p>
                  <p className="text-[11px] text-ink">{step.text}</p>
                </div>
              </At>
            ))}
          </div>
        </div>
        <At ms={3600}>
          <div className="flex items-start gap-1.5 rounded-xl bg-gold-soft px-2.5 py-2 text-[10px] text-gold-deep">
            <Glyph emoji="💡" size={12} className="mt-px shrink-0" />
            Tip: a Friday dinner usually fills faster with a 6 hour window.
          </div>
        </At>
      </div>
    </Phone>
  );
}

export function ResponseWindow() {
  const chosen = useAt(1000);
  const more = useAt(3000);
  const drain = useProgress(1400, 1500);
  const width = more ? 92 : Math.max(18, 92 - drain * 74);
  return (
    <Phone title="Order">
      <div className="space-y-2">
        <Panel className="space-y-1.5">
          <p className="text-[11px] font-bold text-ink">Time to answer</p>
          <div className="flex gap-1">
            {['2 hrs', '6 hrs', '1 day'].map((label, index) => (
              <Tap key={label} at={index === 1 ? 800 : 99999}>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    index === 1 && chosen
                      ? 'border-terracotta bg-terracotta text-white'
                      : 'border-line text-ink-soft'
                  }`}
                >
                  {label}
                </span>
              </Tap>
            ))}
          </div>
        </Panel>
        <At ms={1300}>
          <Panel className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Person who="jordan" />
              <span className="flex-1 text-[12px] font-semibold text-ink">Jordan</span>
              <Pill tone="live">{more ? '6 hrs left' : 'Invited'}</Pill>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full ${width < 30 ? 'bg-gold' : 'bg-terracotta'}`}
                style={{ width: `${width}%`, transition: more ? 'width 400ms' : undefined }}
              />
            </div>
            <At ms={2400}>
              <Tap at={2800}>
                <div className="flex items-center justify-between rounded-lg border border-line px-2 py-1 text-[10px] font-bold text-ink-soft">
                  More time
                  <Icon name="back" size={10} className="-rotate-90" />
                </div>
              </Tap>
            </At>
          </Panel>
        </At>
        <At ms={3300}>
          <p className="px-1 text-[10px] text-ink-faint">
            Nobody who already said yes is disturbed.
          </p>
        </At>
      </div>
    </Phone>
  );
}

export function RsvpQuestion() {
  const answers: { who: PersonKey; text: string; at: number }[] = [
    { who: 'maya', text: 'No shellfish please', at: 1900 },
    { who: 'jordan', text: 'All good!', at: 2500 },
    { who: 'priya', text: 'Vegetarian', at: 3100 },
  ];
  return (
    <Phone title="Basics">
      <div className="space-y-2">
        <Panel className="space-y-1">
          <p className="text-[10px] font-bold text-ink-faint">Ask guests a question</p>
          <p className="text-[12px] font-semibold text-ink">
            <Typed text="Any allergies or dietary needs?" from={300} cps={30} />
          </p>
        </Panel>
        <At ms={1600}>
          <p className="flex items-center gap-1 px-1 text-[10px] font-bold text-ink-faint">
            <Icon name="eye" size={12} /> Answers, only you can see them
          </p>
        </At>
        {answers.map((answer) => (
          <At key={answer.who} ms={answer.at}>
            <Panel className="flex items-center gap-2">
              <Person who={answer.who} />
              <span className="text-[11px] text-ink">{answer.text}</span>
            </Panel>
          </At>
        ))}
      </div>
    </Phone>
  );
}

export function AfterThePlan() {
  return (
    <Phone title="Tacos at Lupe’s">
      <div className="space-y-2">
        <At ms={300}>
          <Panel className="flex items-start gap-2">
            <span className="text-terracotta">
              <Icon name="bell" size={16} />
            </span>
            <span className="text-[11px] text-ink">
              <b>Tomorrow, 7 PM.</b> Tacos at Lupe’s. 4 going.
              <span className="block text-[9px] text-ink-faint">Sent the day before</span>
            </span>
          </Panel>
        </At>
        <At ms={1100}>
          <Panel className="flex items-start gap-2">
            <span className="text-terracotta">
              <Glyph emoji="⏰" size={16} />
            </span>
            <span className="text-[11px] text-ink">
              <b>Starting soon.</b> Lupe’s in 30 min.
            </span>
          </Panel>
        </At>
        <At ms={2000}>
          <p className="pt-1 text-center text-[10px] font-bold uppercase tracking-wide text-ink-faint">
            Saturday
          </p>
        </At>
        <At ms={2300}>
          <Panel className="space-y-2">
            <p className="text-[11px] text-ink-soft">That was fun. Same crew again?</p>
            <Tap at={3200}>
              <GradientButton>
                <Glyph emoji="🔁" size={14} /> Run it back
              </GradientButton>
            </Tap>
          </Panel>
        </At>
        <At ms={3700}>
          <p className="px-1 text-[10px] text-sage-deep">
            New plan started with Maya, Jordan and Priya. It opens by asking when works.
          </p>
        </At>
      </div>
    </Phone>
  );
}
