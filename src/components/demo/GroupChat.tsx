'use client';

import { At, Phone } from '@/components/walkthroughs/scene-kit';
import { Bubble, type PersonKey } from '@/components/walkthroughs/scenes/shared';

/**
 * The problem, staged: a group chat where everyone is keen and nobody commits.
 * This is not a Switchboard screen, so it names no feature. Newest messages sit
 * at the bottom and older ones scroll off the top, the way a real thread does.
 */

const MESSAGES: { who: PersonKey; text: string; at: number }[] = [
  { who: 'maya', text: 'we should do something this weekend!!', at: 300 },
  { who: 'jordan', text: 'yesss', at: 900 },
  { who: 'priya', text: '100% I’m in', at: 1400 },
  { who: 'sam', text: 'when?', at: 2000 },
  { who: 'theo', text: 'free whenever, you guys pick', at: 2600 },
  { who: 'lena', text: 'maybe sat? depends on work', at: 3200 },
];

export function GroupChat() {
  return (
    <Phone title="Weekend crew">
      <div className="flex h-full flex-col justify-end gap-1.5">
        {MESSAGES.map((message) => (
          <At key={message.text} ms={message.at}>
            <Bubble who={message.who}>{message.text}</Bubble>
          </At>
        ))}
        <At ms={4100}>
          <p className="py-1 text-center text-[9px] font-bold uppercase tracking-wide text-ink-faint">
            Sunday 11:48 PM
          </p>
        </At>
        <At ms={4500}>
          <Bubble who="maya">next weekend then? 😅</Bubble>
        </At>
        <At ms={5200}>
          <p className="pr-1 text-right text-[9px] text-ink-faint">Seen by 5</p>
        </At>
      </div>
    </Phone>
  );
}
