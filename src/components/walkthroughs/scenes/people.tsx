'use client';

import { Icon } from '@/components/ui/Icon';
import { Glyph } from '@/components/ui/Glyph';
import { At, Face, Panel, Phone, Tap, Typed, useAt } from '../scene-kit';
import { Person, GradientButton, Toggle, TabBar, type PersonKey } from './shared';

/* People and circles. */

export function AddSomeone() {
  const added = useAt(2800);
  return (
    <Phone title="People">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 rounded-xl border border-line bg-card px-2.5 py-1.5">
          <Icon name="search" size={13} className="text-ink-faint" />
          <span className="text-[12px] text-ink">
            <Typed text="@theo" from={300} cps={10} placeholder="@handle, email, or phone" />
          </span>
        </div>
        <At ms={1300}>
          <Panel className="flex items-center gap-2">
            <Person who="theo" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold text-ink">Theo Park</span>
              <span className="block text-[10px] text-ink-faint">@theo · 3 friends in common</span>
            </span>
            <Tap at={2400}>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  added ? 'bg-sage-soft text-sage-deep' : 'bg-brand-gradient text-white'
                }`}
              >
                {added ? 'Requested' : 'Add'}
              </span>
            </Tap>
          </Panel>
        </At>
        <At ms={3200}>
          <Panel className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-cream text-ink-soft">
              <Glyph emoji="📇" size={14} />
            </span>
            <span className="text-[11px] text-ink">Or find friends from your contacts</span>
          </Panel>
        </At>
      </div>
    </Phone>
  );
}

export function Circles() {
  const members: { who: PersonKey; at: number }[] = [
    { who: 'maya', at: 1000 },
    { who: 'theo', at: 1500 },
    { who: 'priya', at: 2000 },
  ];
  return (
    <Phone title="Your circles">
      <div className="space-y-2">
        <Panel className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-terracotta-soft text-terracotta-deep">
              <Glyph emoji="🏋" size={14} />
            </span>
            <span className="text-[12px] font-bold text-ink">
              <Typed text="Climbing crew" from={200} cps={22} />
            </span>
          </div>
          <div className="flex min-h-7 gap-1">
            {members.map((member) => (
              <At key={member.who} ms={member.at}>
                <Person who={member.who} />
              </At>
            ))}
          </div>
        </Panel>
        <At ms={2600}>
          <Panel className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-sage-soft text-sage-deep">
              <Glyph emoji="🏡" size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold text-ink">The Okafors</span>
              <span className="block text-[10px] text-ink-faint">Household: one tap invites both</span>
            </span>
          </Panel>
        </At>
        <At ms={3300}>
          <Tap at={3800}>
            <GradientButton>Invite Climbing crew</GradientButton>
          </Tap>
        </At>
      </div>
    </Phone>
  );
}

export function Mutual() {
  const mine = useAt(1000);
  const theirs = useAt(2500);
  return (
    <Phone title="Mutual">
      <div className="space-y-2">
        <Panel className="flex items-center gap-2">
          <Person who="lena" />
          <span className="min-w-0 flex-1 text-[12px] font-bold text-ink">Lena Novak</span>
          <Tap at={800}>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                mine ? 'bg-terracotta text-white' : 'border border-line text-ink-soft'
              }`}
            >
              {mine ? 'You’re down' : 'Down to connect'}
            </span>
          </Tap>
        </Panel>
        <At ms={1400}>
          <p className="flex items-center gap-1 px-1 text-[10px] text-ink-faint">
            <Glyph emoji="🔒" size={11} /> Private. Lena only finds out if she says it too.
          </p>
        </At>
        {theirs && (
          <div className="animate-rise space-y-2 rounded-2xl bg-brand-gradient p-3 text-center text-white shadow-float">
            <div className="flex justify-center -space-x-2">
              <Face name="You" hue={200} />
              <Person who="lena" />
            </div>
            <p className="text-[15px] font-extrabold">It’s mutual</p>
            <p className="text-[11px] opacity-90">You and Lena are both down to connect.</p>
          </div>
        )}
        <At ms={3400}>
          <Panel className="flex items-center gap-2">
            <Glyph emoji="🔁" size={14} className="text-terracotta" />
            <span className="text-[11px] text-ink">Make it a ritual: climbing every Thursday</span>
          </Panel>
        </At>
      </div>
    </Phone>
  );
}

export function Radar() {
  return (
    <Phone title="Home">
      <div className="space-y-2">
        <Panel className="h-14 opacity-50" />
        <At ms={600}>
          <Panel className="space-y-2 border-gold">
            <p className="flex items-center gap-1 text-[10px] font-bold text-gold-deep">
              <Glyph emoji="📡" size={12} /> Been a while
            </p>
            <div className="flex items-center gap-2">
              <Person who="sam" />
              <span className="text-[11px] text-ink">
                You and <b>Sam</b> haven’t made a plan in 7 weeks.
              </span>
            </div>
            <At ms={1500}>
              <div className="grid grid-cols-2 gap-1.5">
                <Tap at={2400}>
                  <div className="rounded-lg bg-brand-gradient py-1 text-center text-[10px] font-bold text-white">
                    Plan something
                  </div>
                </Tap>
                <div className="rounded-lg border border-line py-1 text-center text-[10px] font-bold text-ink-soft">
                  Not now
                </div>
              </div>
            </At>
          </Panel>
        </At>
        <At ms={2900}>
          <Panel className="space-y-1">
            <p className="text-[10px] font-bold text-ink-faint">NEW PLAN</p>
            <p className="text-[12px] font-semibold text-ink">Coffee with Sam</p>
          </Panel>
        </At>
      </div>
      <TabBar active="home" />
    </Phone>
  );
}

export function GiveSpace() {
  const on = useAt(1100);
  return (
    <Phone title="Jordan Ruiz">
      <div className="space-y-2">
        <Panel className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-ink">Give space</span>
          <Tap at={900}>
            <Toggle on={on} />
          </Tap>
        </Panel>
        <At ms={1400}>
          <p className="px-1 text-[10px] text-ink-faint">
            Jordan is never removed from anything, and never told.
          </p>
        </At>
        <At ms={2300}>
          <p className="pt-1 text-center text-[10px] font-bold uppercase tracking-wide text-ink-faint">
            Later, saying yes to a plan
          </p>
        </At>
        <At ms={2600}>
          <Panel className="flex items-start gap-2 bg-cream">
            <Glyph emoji="🤫" size={16} className="mt-px shrink-0 text-ink-soft" />
            <span className="text-[11px] text-ink">
              Someone you give space to may be at this one. Only you see this.
            </span>
          </Panel>
        </At>
      </div>
    </Phone>
  );
}
