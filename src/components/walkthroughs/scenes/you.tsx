'use client';

import { Icon } from '@/components/ui/Icon';
import { Glyph } from '@/components/ui/Glyph';
import { APP_THEMES } from '@/lib/themes-app';
import { At, Panel, Phone, Tap, useAt, useElapsed } from '../scene-kit';
import { Toggle } from './shared';

/* Making it yours. */

export function SignalComposer() {
  const elapsed = useElapsed();
  const live = elapsed >= 3300;
  const picked = elapsed >= 900;
  const audience = [
    { label: 'Close friends', at: 1700 },
    { label: 'Climbing crew', at: 2200 },
    { label: 'Everyone', at: Infinity },
  ];
  return (
    <Phone title="I’m free">
      <div className="space-y-2">
        <Panel className="space-y-1.5">
          <p className="text-[10px] font-bold text-ink-faint">UP FOR</p>
          <div className="flex flex-wrap gap-1">
            {['☕ Coffee', '🚶 Walk', '🍜 Dinner'].map((label, index) => (
              <Tap key={label} at={index === 0 ? 700 : 99999}>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    index === 0 && picked ? 'border-terracotta bg-terracotta text-white' : 'border-line text-ink-soft'
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
            <p className="text-[10px] font-bold text-ink-faint">WHO HEARS IT</p>
            {audience.map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-[11px] text-ink">{item.label}</span>
                <Toggle on={elapsed >= item.at} />
              </div>
            ))}
          </Panel>
        </At>
        <At ms={2600}>
          <Tap at={3000}>
            <div
              className={`rounded-xl py-2 text-center text-[12px] font-bold text-white ${
                live ? 'bg-sage' : 'bg-brand-gradient'
              }`}
            >
              {live ? 'On until 6 PM, then it ends itself' : 'Turn on'}
            </div>
          </Tap>
        </At>
      </div>
    </Phone>
  );
}

export function QuietHours() {
  const on = useAt(900);
  const held = [
    { text: 'Maya invited you to Brunch', at: 2000 },
    { text: 'Theo is free for a walk', at: 2600 },
  ];
  return (
    <Phone title="Notifications">
      <div className="space-y-2">
        <Panel className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px] font-bold text-ink">
              <Glyph emoji="🌙" size={13} /> Quiet hours
            </span>
            <Tap at={700}>
              <Toggle on={on} />
            </Tap>
          </div>
          <At ms={1100}>
            <p className="text-[11px] text-ink-soft">10:00 PM to 8:00 AM · Central time</p>
          </At>
        </Panel>
        <At ms={1700}>
          <p className="px-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
            Overnight, waiting in your inbox
          </p>
        </At>
        {held.map((item) => (
          <At key={item.text} ms={item.at}>
            <Panel className="flex items-center gap-2">
              <Icon name="bell" size={13} className="text-ink-faint" />
              <span className="text-[11px] text-ink">{item.text}</span>
            </Panel>
          </At>
        ))}
        <At ms={3300}>
          <p className="px-1 text-[10px] text-ink-faint">Nothing buzzed. Nothing was lost.</p>
        </At>
      </div>
    </Phone>
  );
}

export function Sabbatical() {
  const on = useAt(1000);
  const surfaces = ['Discovery', 'The map', 'Mutual', 'Matchmaking', 'Ritual reminders'];
  return (
    <Phone title="Sabbatical">
      <div className="space-y-2">
        <Panel className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-ink">Take a quiet season</span>
          <Tap at={800}>
            <Toggle on={on} />
          </Tap>
        </Panel>
        <At ms={1300}>
          <Panel className="space-y-1">
            {surfaces.map((surface, index) => (
              <SurfaceRow key={surface} label={surface} at={1500 + index * 260} />
            ))}
          </Panel>
        </At>
        <At ms={3100}>
          <Panel className="flex items-center gap-2 bg-sage-soft">
            <Icon name="check" size={13} className="text-sage-deep" />
            <span className="text-[11px] text-ink">Plans you’re already in keep working.</span>
          </Panel>
        </At>
      </div>
    </Phone>
  );
}

function SurfaceRow({ label, at }: { label: string; at: number }) {
  const off = useAt(at);
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[11px] transition-colors ${off ? 'text-ink-faint line-through' : 'text-ink'}`}>
        {label}
      </span>
      <span className={`text-[10px] font-bold ${off ? 'text-ink-faint' : 'text-sage-deep'}`}>
        {off ? 'Paused' : 'On'}
      </span>
    </div>
  );
}

export function Appearance() {
  const elapsed = useElapsed();
  // The real presets, by the names Settings shows. The preview paints with
  // each one's own swatches: [background, surface, accent].
  const looks = APP_THEMES.filter((theme) => !theme.earned && !theme.custom)
    .slice(0, 4)
    .map((theme) => {
      const [paper, card, accent] = theme.swatches;
      return { name: theme.name, paper, card, accent, ink: isDark(paper) ? '#f3ebe1' : '#191d22' };
    });
  const index = elapsed >= 3000 ? 3 : elapsed >= 2000 ? 2 : elapsed >= 1000 ? 1 : 0;
  const look = looks[index];
  return (
    <Phone title="Appearance">
      <div className="space-y-2">
        <div
          className="space-y-1.5 rounded-2xl border border-line p-2.5 transition-colors duration-500"
          style={{ backgroundColor: look.paper }}
        >
          <div
            className="rounded-xl p-2 shadow-lift transition-colors duration-500"
            style={{ backgroundColor: look.card }}
          >
            <p className="text-[10px] font-bold opacity-70 transition-colors duration-500" style={{ color: look.ink }}>
              FRIDAY · 7:00 PM
            </p>
            <p className="text-[13px] font-extrabold transition-colors duration-500" style={{ color: look.ink }}>
              Tacos at Lupe’s
            </p>
          </div>
          <div
            className="rounded-lg py-1.5 text-center text-[11px] font-bold text-white transition-colors duration-500"
            style={{ backgroundColor: look.accent }}
          >
            I’m in
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {looks.map((option, optionIndex) => (
            <Tap key={option.name} at={optionIndex === 0 ? 99999 : optionIndex * 1000 - 200}>
              <div
                className={`flex items-center gap-1.5 rounded-xl border bg-card px-2 py-1.5 ${
                  optionIndex === index ? 'border-terracotta' : 'border-line'
                }`}
              >
                <span className="flex">
                  <span className="size-3 rounded-full border border-line" style={{ backgroundColor: option.paper }} />
                  <span className="-ml-1 size-3 rounded-full" style={{ backgroundColor: option.accent }} />
                </span>
                <span className="text-[10px] font-semibold text-ink">{option.name}</span>
              </div>
            </Tap>
          ))}
        </div>
        <At ms={3500}>
          <p className="px-1 text-[10px] text-ink-faint">Or build your own from a photo and three colors.</p>
        </At>
      </div>
    </Phone>
  );
}

/** Whether a #rrggbb background needs light text. */
function isDark(hex: string): boolean {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}
