'use client';

import { Icon } from '@/components/ui/Icon';
import { Glyph } from '@/components/ui/Glyph';
import { At, Panel, Phone, Pill, Tap, Typed, useAt, useElapsed } from '../scene-kit';
import { PEOPLE, Person, Field, GradientButton, Bubble, TabBar, type PersonKey } from './shared';

/* The first-run walkthrough: one plan, start to finish. */

export function StartDoors() {
  const open = useAt(1200);
  const doors = [
    { emoji: '📅', title: 'I’ve got a plan', body: 'Send invites in your order' },
    { emoji: '🗳', title: 'Help me figure it out', body: 'Let the group decide' },
    { emoji: '💡', title: 'Show me ideas', body: 'Things to do near you' },
  ];
  return (
    <Phone title="Home">
      <div className="space-y-2">
        <Panel>
          <p className="text-[10px] font-bold text-ink-faint">THIS WEEK</p>
          <p className="text-[12px] font-bold text-ink">Nothing planned yet</p>
        </Panel>
        <Panel className="h-14" />
      </div>
      {!open && (
        <Tap at={500} className="absolute inset-x-0 bottom-0 h-[44px]">
          <TabBar active="home" />
        </Tap>
      )}
      {open && (
        // The sheet the + button opens, over a dimmed Home.
        <div className="absolute inset-0 flex flex-col justify-end bg-ink/25">
          <div className="animate-rise space-y-1.5 rounded-t-3xl bg-paper px-3 pb-3 pt-2 shadow-float">
            <span className="mx-auto block h-1 w-8 rounded-full bg-line" />
            <p className="px-1 text-[13px] font-extrabold text-ink">Start something</p>
            {doors.map((door, index) => (
              <At key={door.title} ms={1400 + index * 220}>
                <Tap at={index === 0 ? 2800 : 99999}>
                  <Panel className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-full bg-terracotta-soft text-terracotta-deep">
                      <Glyph emoji={door.emoji} size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-bold text-ink">{door.title}</span>
                      <span className="block text-[10px] text-ink-faint">{door.body}</span>
                    </span>
                  </Panel>
                </Tap>
              </At>
            ))}
          </div>
        </div>
      )}
    </Phone>
  );
}

export function DescribePlan() {
  return (
    <Phone title="New plan">
      <div className="space-y-2">
        <Panel className="space-y-1.5">
          <p className="flex items-center gap-1 text-[10px] font-bold text-terracotta-deep">
            <Icon name="mic" size={12} /> Describe it
          </p>
          <p className="min-h-8 text-[12px] leading-snug text-ink">
            <Typed
              text="Tacos at Lupe’s Friday at 7, maybe 4 of us"
              from={300}
              cps={30}
              placeholder="What do you have in mind?"
            />
          </p>
        </Panel>
        <At ms={2000}>
          <p className="flex items-center gap-1 px-1 text-[10px] font-bold text-sage-deep">
            <Glyph emoji="✨" size={12} /> Filled in for you
          </p>
        </At>
        <At ms={2200} keep>
          <Field label="What">Tacos</Field>
        </At>
        <At ms={2500} keep>
          <Field label="When">Friday · 7:00 PM</Field>
        </At>
        <At ms={2800} keep>
          <Field label="Where">Lupe’s Taqueria</Field>
        </At>
        <At ms={3300}>
          <GradientButton>Next: who to ask</GradientButton>
        </At>
      </div>
    </Phone>
  );
}

export function Cascade() {
  const elapsed = useElapsed();
  // Two spots. Maya says yes, Jordan passes, Priya says yes: full, so Sam is
  // never pinged. That is the whole point of the chain.
  const rows: { who: PersonKey; invitedAt: number; answerAt: number; answer: 'yes' | 'no' | null }[] = [
    { who: 'maya', invitedAt: 500, answerAt: 1300, answer: 'yes' },
    { who: 'jordan', invitedAt: 1500, answerAt: 2300, answer: 'no' },
    { who: 'priya', invitedAt: 2500, answerAt: 3300, answer: 'yes' },
    { who: 'sam', invitedAt: Infinity, answerAt: Infinity, answer: null },
  ];
  const full = elapsed >= 3300;
  const filled = rows.filter((row) => row.answer === 'yes' && elapsed >= row.answerAt).length;
  return (
    <Phone title="Tacos at Lupe’s">
      <div className="space-y-2">
        <Panel className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-ink">Spots filled</span>
          <span className="flex gap-1">
            {[0, 1].map((spot) => (
              <span
                key={spot}
                className={`size-3 rounded-full transition-colors duration-300 ${
                  spot < filled ? 'bg-sage' : 'bg-line'
                }`}
              />
            ))}
          </span>
        </Panel>
        <div className="space-y-1.5">
          {rows.map((row, index) => {
            const invited = elapsed >= row.invitedAt;
            const answered = elapsed >= row.answerAt;
            return (
              <Panel
                key={row.who}
                className={`flex items-center gap-2 transition-opacity duration-300 ${
                  full && !invited ? 'opacity-50' : ''
                }`}
              >
                <span className="w-3 text-[10px] font-bold text-ink-faint">{index + 1}</span>
                <Person who={row.who} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
                  {PEOPLE[row.who].name}
                </span>
                {answered && row.answer === 'yes' ? (
                  <Pill tone="yes">In</Pill>
                ) : answered && row.answer === 'no' ? (
                  <Pill tone="no">Can’t</Pill>
                ) : invited ? (
                  <Pill tone="live">Invited</Pill>
                ) : full ? (
                  <Pill tone="wait">Not needed</Pill>
                ) : (
                  <Pill tone="wait">Waiting</Pill>
                )}
              </Panel>
            );
          })}
        </div>
        <At ms={3600}>
          <p className="rounded-xl bg-sage-soft px-2.5 py-2 text-[11px] font-semibold text-sage-deep">
            Full. Sam was never pinged, so nobody got over-invited.
          </p>
        </At>
      </div>
    </Phone>
  );
}

export function InviteLink() {
  const recipient = useAt(2400);
  return (
    <Phone title={recipient ? undefined : 'Tacos at Lupe’s'}>
      {!recipient ? (
        <div className="space-y-2">
          <Panel className="space-y-2">
            <p className="text-[11px] font-bold text-ink">Invite link</p>
            <p className="truncate rounded-lg bg-cream px-2 py-1.5 font-mono text-[10px] text-ink-soft">
              switchboard.app/i/tacos-friday
            </p>
            <Tap at={900}>
              <GradientButton>
                <Icon name="share" size={14} /> Share
              </GradientButton>
            </Tap>
          </Panel>
          <At ms={1300}>
            <Panel className="flex items-center gap-2">
              <Icon name="check" size={14} className="text-sage" />
              <span className="text-[11px] font-semibold text-ink">Sent to the group chat</span>
            </Panel>
          </At>
        </div>
      ) : (
        <div className="animate-rise space-y-2 pt-1">
          <p className="flex items-center gap-1 text-[10px] font-bold text-ink-faint">
            <Icon name="globe" size={12} /> Opened in a browser, no account
          </p>
          <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-lift">
            <div className="h-16 bg-brand-gradient" />
            <div className="space-y-1 p-2.5">
              <p className="text-[14px] font-extrabold text-ink">Tacos at Lupe’s</p>
              <p className="text-[11px] text-ink-soft">Friday · 7:00 PM</p>
              <p className="text-[11px] text-ink-soft">Hosted by Maya</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Tap at={3600}>
              <div className="rounded-xl bg-sage py-2 text-center text-[12px] font-bold text-white">
                I’m in
              </div>
            </Tap>
            <div className="rounded-xl border border-line bg-card py-2 text-center text-[12px] font-bold text-ink-soft">
              Can’t make it
            </div>
          </div>
          <At ms={4100}>
            <p className="text-center text-[10px] text-ink-faint">
              Signing in is only asked for now, to save the answer.
            </p>
          </At>
        </div>
      )}
    </Phone>
  );
}

export function RoomFiling() {
  const tasks = useAt(2300);
  const places = useAt(3600);
  return (
    <Phone title="Tacos at Lupe’s">
      <div className="mb-2 flex gap-1 text-[10px] font-bold">
        <span className="rounded-full bg-ink px-2 py-0.5 text-paper">Chat</span>
        <span
          className={`rounded-full px-2 py-0.5 transition-colors duration-300 ${
            places ? 'bg-terracotta-soft text-terracotta-deep' : 'bg-cream text-ink-faint'
          }`}
        >
          Places{places ? ' · 1' : ''}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 transition-colors duration-300 ${
            tasks ? 'bg-terracotta-soft text-terracotta-deep' : 'bg-cream text-ink-faint'
          }`}
        >
          Tasks{tasks ? ' · 1' : ''}
        </span>
        <span className="rounded-full bg-cream px-2 py-0.5 text-ink-faint">Links</span>
      </div>
      <div className="space-y-1.5">
        <At ms={300}>
          <Bubble who="jordan">So excited!! what should I bring?</Bubble>
        </At>
        <At ms={1300}>
          <Bubble mine>I’ll bring the salsa and chips</Bubble>
        </At>
        <At ms={2300}>
          <p className="flex items-center justify-end gap-1 text-[10px] font-semibold text-terracotta-deep">
            <Icon name="check" size={11} /> Filed to Tasks
          </p>
        </At>
        <At ms={2700}>
          <Bubble who="priya">Meet at 2410 E Cesar Chavez St?</Bubble>
        </At>
        <At ms={3600}>
          <p className="flex items-center gap-1 pl-6 text-[10px] font-semibold text-terracotta-deep">
            <Glyph emoji="📍" size={11} /> Filed to Places
          </p>
        </At>
      </div>
    </Phone>
  );
}

export function HomeSignal() {
  const picked = useAt(1600);
  const on = useAt(2600);
  return (
    <Phone title="Hi, Alex">
      <div className="space-y-2">
        <At ms={200}>
          <div className="overflow-hidden rounded-2xl bg-plan-pink p-2.5 text-white shadow-lift">
            <p className="text-[10px] font-bold opacity-80">FRIDAY · 7:00 PM</p>
            <p className="text-[14px] font-extrabold">Tacos at Lupe’s</p>
            <div className="mt-1 flex -space-x-1.5">
              <Person who="maya" size="sm" />
              <Person who="priya" size="sm" />
              <Person who="jordan" size="sm" />
            </div>
          </div>
        </At>
        <At ms={800}>
          <Panel className="space-y-1.5">
            <p className="text-[11px] font-bold text-ink">I’m free</p>
            <div className="flex flex-wrap gap-1">
              {['☕ Coffee?', '🚶 Walk', '🍻 Drinks'].map((label, index) => (
                <Tap key={label} at={index === 0 ? 1600 : 99999}>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      index === 0 && picked
                        ? 'border-terracotta bg-terracotta text-white'
                        : 'border-line text-ink-soft'
                    }`}
                  >
                    {label}
                  </span>
                </Tap>
              ))}
            </div>
            <At ms={2000}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-ink-soft">To: Close friends</span>
                <Tap at={2600}>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      on ? 'bg-sage text-white' : 'bg-brand-gradient text-white'
                    }`}
                  >
                    {on ? 'On until 6 PM' : 'Turn on'}
                  </span>
                </Tap>
              </div>
            </At>
          </Panel>
        </At>
        <At ms={3300}>
          <Panel className="flex items-center gap-2">
            <Person who="theo" />
            <span className="text-[11px] text-ink">
              <b>Theo</b> is free for coffee too
            </span>
          </Panel>
        </At>
      </div>
      <TabBar active="home" />
    </Phone>
  );
}
