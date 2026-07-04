import type { Metadata } from 'next';
import {
  Archivo,
  Archivo_Black,
  Fraunces,
  IBM_Plex_Mono,
  Inter_Tight,
  Karla,
  Work_Sans,
  Young_Serif,
} from 'next/font/google';

export const metadata: Metadata = {
  title: 'Design directions',
  robots: { index: false },
};

const youngSerif = Young_Serif({ weight: '400', subsets: ['latin'] });
const archivo = Archivo({ subsets: ['latin'] });
const archivoBlack = Archivo_Black({ weight: '400', subsets: ['latin'] });
const plexMono = IBM_Plex_Mono({ weight: ['400', '600'], subsets: ['latin'] });
const interTight = Inter_Tight({ subsets: ['latin'] });
const karla = Karla({ subsets: ['latin'] });
const workSans = Work_Sans({ subsets: ['latin'] });
const fraunces = Fraunces({ subsets: ['latin'] });

/*
 * Public preview of the five candidate design directions.
 * Same content in every mock: header, hero, a live cascade, one action.
 * House rules: no italics in heroes or headers, no emdashes anywhere.
 */

function Frame({
  n,
  name,
  blurb,
  children,
}: {
  n: number;
  name: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-14">
      <div className="px-1 mb-3">
        <h2 className="font-display text-2xl text-ink">
          {n}. {name}
        </h2>
        <p className="text-sm text-ink-soft mt-0.5">{blurb}</p>
      </div>
      <div className="rounded-[2rem] border-8 border-ink/85 overflow-hidden shadow-float">
        {children}
      </div>
    </section>
  );
}

/* 1 ————— THE ALMANAC ————— */
function Almanac() {
  const ink = '#221d15';
  const oxblood = '#7a2e2a';
  const blue = '#2b4a8b';
  return (
    <div style={{ background: '#f6f1e5', color: ink }} className={archivo.className}>
      <div className="px-5 py-4 flex items-baseline justify-between" style={{ borderBottom: `2px solid ${ink}` }}>
        <span className={youngSerif.className} style={{ fontSize: 20 }}>Switchboard</span>
        <span className={plexMono.className} style={{ fontSize: 11 }}>VOL. 1 · NO. 4</span>
      </div>
      <div className="px-5 pt-7 pb-5">
        <p className={plexMono.className} style={{ fontSize: 11, color: oxblood, letterSpacing: 2 }}>
          FRIDAY, JULY 10
        </p>
        <h3 className={youngSerif.className} style={{ fontSize: 34, lineHeight: 1.1, marginTop: 8 }}>
          Plans without the pressure.
        </h3>
        <p style={{ fontSize: 14, marginTop: 10, color: '#54493a', lineHeight: 1.5 }}>
          Entry no. 12: coffee downtown. One invitation out at a time, in your
          order, recorded below.
        </p>
      </div>
      <div className="mx-5 mb-5" style={{ border: `1.5px solid ${ink}` }}>
        <div className={plexMono.className} style={{ fontSize: 10, letterSpacing: 2, padding: '8px 12px', borderBottom: `1.5px solid ${ink}`, background: '#efe7d4' }}>
          THE LEDGER
        </div>
        {[
          ['01', 'ALEX RIVERA', 'ACCEPTED', oxblood],
          ['02', 'JORDAN OKAFOR', 'ASKED · 14 MIN', blue],
          ['03', 'MIA CHEN', 'WAITING IN LINE', '#8b8070'],
        ].map(([n, name, status, color]) => (
          <div key={n as string} className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px dotted #b6a98e' }}>
            <span className={plexMono.className} style={{ fontSize: 12 }}>
              {n} <span style={{ fontWeight: 600 }}>{name}</span>
            </span>
            <span className={plexMono.className} style={{ fontSize: 10, color: color as string, letterSpacing: 1 }}>
              {status}
            </span>
          </div>
        ))}
      </div>
      <div className="mx-5 mb-6 px-4 py-3 flex items-center justify-between"
        style={{ border: `1.5px dashed ${oxblood}`, background: '#fdfaf2' }}>
        <div>
          <p className={youngSerif.className} style={{ fontSize: 15 }}>Admit one, gladly</p>
          <p className={plexMono.className} style={{ fontSize: 10, color: '#8b8070' }}>GUEST TICKET · NO ACCOUNT NEEDED</p>
        </div>
        <span className={plexMono.className} style={{ fontSize: 18, color: oxblood }}>✂</span>
      </div>
      <div className="px-5 pb-7">
        <button type="button" className="w-full py-3.5"
          style={{ background: ink, color: '#f6f1e5', fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}>
          Send the invitations
        </button>
      </div>
    </div>
  );
}

/* 2 ————— TRANSIT BOARD ————— */
function Transit() {
  const black = '#141310';
  const orange = '#ff5c00';
  const green = '#1f7a4d';
  return (
    <div style={{ background: '#f4f1ea', color: black }} className={interTight.className}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `3px solid ${black}` }}>
        <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.5 }}>SWITCHBOARD</span>
        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>18:42</span>
      </div>
      <div className="px-5 pt-7 pb-6">
        <h3 style={{ fontSize: 40, lineHeight: 0.98, fontWeight: 800, letterSpacing: -1.5 }}>
          PLANS<br />WITHOUT THE<br />
          <span style={{ color: orange }}>PRESSURE.</span>
        </h3>
        <p style={{ fontSize: 13, marginTop: 12, color: '#57534a', maxWidth: 280 }}>
          Coffee downtown. Invitations depart one at a time. Board updates
          live.
        </p>
      </div>
      <div className="px-5">
        <div className="flex justify-between pb-1.5" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#8a857a' }}>
          <span>INVITEE</span><span>STATUS</span><span>TIME</span>
        </div>
        {[
          ['RIVERA A.', 'ACCEPTED', '18:31', green, 700],
          ['OKAFOR J.', 'ASKED', '14 MIN', orange, 700],
          ['CHEN M.', 'QUEUED', '· · ·', '#8a857a', 500],
        ].map(([name, status, time, color, weight]) => (
          <div key={name as string} className="grid grid-cols-3 py-3" style={{ borderTop: `1.5px solid ${black}` }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
            <span style={{ fontSize: 12, fontWeight: weight as number, color: color as string, letterSpacing: 1.5, textAlign: 'center' }}>
              {status}
            </span>
            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 600 }}>
              {time}
            </span>
          </div>
        ))}
        <div style={{ borderTop: `1.5px solid ${black}` }} />
      </div>
      <div className="px-5 py-6 flex items-center gap-4">
        <button type="button" className="flex-1 py-3.5"
          style={{ background: orange, color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: 1 }}>
          DEPART INVITATIONS
        </button>
        <span style={{ fontSize: 44, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: -2 }}>
          2<span style={{ color: '#8a857a' }}>/3</span>
        </span>
      </div>
    </div>
  );
}

/* 3 ————— CORKBOARD ————— */
function Corkboard() {
  const black = '#191512';
  const red = '#d92b2b';
  const butter = '#f5d95b';
  return (
    <div style={{ background: '#faf4e8', color: black }} className={karla.className}>
      <div className="px-5 py-4 flex items-center justify-between">
        <span className={archivoBlack.className} style={{ fontSize: 17 }}>SWITCHBOARD</span>
        <span className="px-2.5 py-1" style={{ background: butter, border: `2.5px solid ${black}`, fontSize: 11, fontWeight: 700, boxShadow: `3px 3px 0 ${black}` }}>
          BETA
        </span>
      </div>
      <div className="px-5 pt-5 pb-2">
        <div className="px-4 py-5" style={{ background: butter, border: `3px solid ${black}`, boxShadow: `6px 6px 0 ${black}`, transform: 'rotate(-1.2deg)' }}>
          <h3 className={archivoBlack.className} style={{ fontSize: 28, lineHeight: 1.05 }}>
            PLANS WITHOUT THE PRESSURE.
          </h3>
          <p style={{ fontSize: 13.5, marginTop: 8, fontWeight: 500 }}>
            Pin a plan. Switchboard asks your people one at a time. Nobody
            feels like a backup.
          </p>
        </div>
      </div>
      <div className="px-5 pt-4 space-y-3">
        {[
          ['ALEX IS IN! 🎉', '#cdebc9', 0.8],
          ['JORDAN: ASKED (14 MIN LEFT)', '#fff', -0.6],
          ['MIA: UP NEXT', '#f0ece0', 0.5],
        ].map(([label, bg, rot]) => (
          <div key={label as string} className="px-3.5 py-3 flex items-center gap-2.5"
            style={{ background: bg as string, border: `2.5px solid ${black}`, boxShadow: `4px 4px 0 ${black}`, transform: `rotate(${rot}deg)`, fontWeight: 700, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: red, border: `2px solid ${black}` }} />
            {label}
          </div>
        ))}
      </div>
      <div className="px-5 py-6">
        <button type="button" className="w-full py-4 active:translate-x-1 active:translate-y-1"
          style={{ background: red, color: '#fff', border: `3px solid ${black}`, boxShadow: `5px 5px 0 ${black}`, fontWeight: 800, fontSize: 15 }}>
          <span className={archivoBlack.className}>SEND IT →</span>
        </button>
      </div>
    </div>
  );
}

/* 4 ————— DUSK LOUNGE ————— */
function Dusk() {
  const amber = '#e8a24b';
  const cream = '#f2e8d8';
  const sage = '#8aa88f';
  return (
    <div style={{ background: '#1e1712', color: cream }} className={interTight.className}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(232,162,75,0.35)' }}>
        <span className={fraunces.className} style={{ fontSize: 19 }}>Switchboard</span>
        <span style={{ fontSize: 10, letterSpacing: 3, color: amber }}>TONIGHT</span>
      </div>
      <div className="px-5 pt-8 pb-6" style={{ background: 'radial-gradient(120% 90% at 50% 0%, rgba(232,162,75,0.14), transparent 60%)' }}>
        <h3 className={fraunces.className} style={{ fontSize: 34, lineHeight: 1.12 }}>
          Plans without<br />the <span style={{ color: amber }}>pressure</span>.
        </h3>
        <p style={{ fontSize: 13.5, marginTop: 12, color: 'rgba(242,232,216,0.65)', lineHeight: 1.6, maxWidth: 280 }}>
          Dinner at eight. The asking is handled; the evening is yours.
        </p>
      </div>
      <div className="mx-5 rounded-2xl px-4 py-1" style={{ background: '#2a211a', border: '1px solid rgba(232,162,75,0.25)' }}>
        <p style={{ fontSize: 10, letterSpacing: 3, color: amber, padding: '12px 0 4px' }}>THE TABLE</p>
        {[
          ['Alex Rivera', 'Joining you', sage],
          ['Jordan Okafor', 'Considering · 14 min', amber],
          ['Mia Chen', 'Next, if needed', 'rgba(242,232,216,0.4)'],
        ].map(([name, status, color], i) => (
          <div key={name as string} className="flex items-center justify-between py-3.5"
            style={{ borderTop: i > 0 ? '1px solid rgba(232,162,75,0.15)' : 'none' }}>
            <span className={fraunces.className} style={{ fontSize: 15 }}>{name}</span>
            <span style={{ fontSize: 11.5, color: color as string }}>{status}</span>
          </div>
        ))}
      </div>
      <div className="px-5 py-7">
        <button type="button" className="w-full py-4 rounded-full"
          style={{ background: amber, color: '#1e1712', fontWeight: 700, fontSize: 14, letterSpacing: 0.3 }}>
          Set the table
        </button>
        <p style={{ fontSize: 11, textAlign: 'center', marginTop: 12, color: 'rgba(242,232,216,0.4)' }}>
          Invitations go out one at a time, quietly
        </p>
      </div>
    </div>
  );
}

/* 5 ————— RISO PRINT ————— */
function Riso() {
  const teal = '#00838a';
  const tangerine = '#ff6a39';
  const ink = '#2b2724';
  return (
    <div style={{ background: '#faf6ee', color: ink }} className={workSans.className}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `2px solid ${teal}` }}>
        <span className={archivoBlack.className} style={{ fontSize: 16, color: teal, textShadow: `1.5px 1.5px 0 ${tangerine}` }}>
          SWITCHBOARD
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: tangerine }}>issue 01</span>
      </div>
      <div className="px-5 pt-7 pb-5">
        <h3 className={archivoBlack.className} style={{ fontSize: 30, lineHeight: 1.05, color: teal, textShadow: `2px 2px 0 rgba(255,106,57,0.55)` }}>
          PLANS WITHOUT THE PRESSURE.
        </h3>
        <p style={{ fontSize: 13.5, marginTop: 10, lineHeight: 1.55, color: '#4d463f' }}>
          A little zine about asking people to hang out, printed in two inks
          and zero awkwardness.
        </p>
      </div>
      <div className="mx-5 mb-5 p-4" style={{ background: 'rgba(0,131,138,0.08)', border: `2px solid ${teal}`, borderRadius: 2 }}>
        <p className={archivoBlack.className} style={{ fontSize: 12, color: teal, marginBottom: 10 }}>THE CASCADE ///</p>
        {[
          ['● Alex', 'in!', tangerine],
          ['◐ Jordan', 'thinking (14 min)', teal],
          ['○ Mia', 'up next', '#8d857a'],
        ].map(([name, status, color]) => (
          <div key={name as string} className="flex items-center justify-between py-2" style={{ borderBottom: '1.5px dashed rgba(0,131,138,0.35)' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: color as string }}>{status}</span>
          </div>
        ))}
      </div>
      <div className="px-5 pb-7 flex items-center gap-3">
        <button type="button" className="flex-1 py-3.5"
          style={{ background: tangerine, color: '#faf6ee', borderRadius: 3, fontWeight: 800, fontSize: 14, boxShadow: `3px 3px 0 ${teal}` }}>
          send it out ✶
        </button>
        <span className={archivoBlack.className} style={{ fontSize: 22, color: teal, transform: 'rotate(6deg)' }}>
          ✂ ✶ ●
        </span>
      </div>
    </div>
  );
}

export default function DesignDirectionsPage() {
  return (
    <div className="mx-auto max-w-md min-h-dvh px-5 py-10">
      <header className="mb-10">
        <p className="text-xs font-medium tracking-wide uppercase text-terracotta-deep">
          Switchboard design directions
        </p>
        <h1 className="font-display text-3xl text-ink mt-1.5">
          Five looks, same screen.
        </h1>
        <p className="text-sm text-ink-soft mt-2 leading-relaxed">
          Each mock shows the same moment: a plan with a live cascade. No
          italics in heroes or headers, no emdashes, nothing that reads
          machine-made. Reply with a number to pick one.
        </p>
      </header>

      <Frame n={1} name="The Almanac" blurb="A well-worn planner: ledgers, tickets, ink on cream.">
        <Almanac />
      </Frame>
      <Frame n={2} name="Transit Board" blurb="Departure-board information design. The cascade is infrastructure.">
        <Transit />
      </Frame>
      <Frame n={3} name="Corkboard" blurb="Neo-brutalist bulletin board. Pinned, stickered, handmade.">
        <Corkboard />
      </Frame>
      <Frame n={4} name="Dusk Lounge" blurb="Warm dark. Candlelight amber, brass hairlines, dinner-party gravity.">
        <Dusk />
      </Frame>
      <Frame n={5} name="Riso Print" blurb="Two-ink zine: teal and tangerine overprint, hand-cut energy.">
        <Riso />
      </Frame>

      <footer className="text-center text-xs text-ink-faint pb-8">
        Full written specs live in docs/DESIGN-DIRECTIONS.md
      </footer>
    </div>
  );
}
