'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SceneClock } from '@/components/walkthroughs/scene-kit';
import { TOUR_SCENES } from '@/components/walkthroughs/TourScenes';
import { beatDurationMs, type DemoBeat, type DemoSceneId } from '@/lib/investor-demo';
import { GroupChat } from './GroupChat';

const DEMO_SCENES: Record<DemoSceneId, () => ReactNode> = {
  ...TOUR_SCENES,
  'group-chat': GroupChat,
};

export type DemoMode = 'auto' | 'present';

/**
 * Plays the investor demo in one of two modes.
 *
 * - **auto**, for a link someone opens alone: each beat stays up for
 *   `beatDurationMs`, then the next one plays. It stops on the last beat, pauses
 *   when the tab is hidden, and Space or the Pause button holds it.
 * - **present**, for a meeting: nothing advances until the presenter does, and
 *   the talk track sits under each beat (N hides it before sharing a screen).
 *
 * Arrow keys and Page Up/Down (what a slide clicker sends) step in both modes.
 * P switches mode, F goes full screen, R replays the current scene.
 */
export function DemoPlayer({
  beats,
  initialMode,
}: {
  beats: readonly DemoBeat[];
  initialMode: DemoMode;
}) {
  const [index, setIndex] = useState(0);
  // Bumped by Replay so the scene remounts and its clock starts over.
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState<DemoMode>(initialMode);
  const [playing, setPlaying] = useState(initialMode === 'auto');
  const [showNotes, setShowNotes] = useState(true);
  // How far through the current beat autoplay is, 0 to 1. The ref lets a
  // paused beat resume where it stopped instead of starting over.
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  const beat = beats[index];
  const last = index === beats.length - 1;
  const presenting = mode === 'present';

  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= beats.length) return;
      progressRef.current = 0;
      setProgress(0);
      setIndex(target);
      setRun(0);
    },
    [beats.length],
  );

  const replay = useCallback(() => {
    progressRef.current = 0;
    setProgress(0);
    setRun((n) => n + 1);
  }, []);

  const restart = useCallback(() => {
    goTo(0);
    setRun((n) => n + 1);
    if (mode === 'auto') setPlaying(true);
  }, [goTo, mode]);

  const toggleMode = useCallback(() => {
    const next = mode === 'auto' ? 'present' : 'auto';
    setMode(next);
    setPlaying(next === 'auto' && !last);
  }, [mode, last]);

  // Autoplay: fill the current beat's bar, then move on.
  useEffect(() => {
    if (mode !== 'auto' || !playing) return;
    const duration = beatDurationMs(beat);
    const started = performance.now() - progressRef.current * duration;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / duration);
      progressRef.current = p;
      setProgress(p);
      if (p < 1) {
        frame = requestAnimationFrame(tick);
      } else if (index < beats.length - 1) {
        goTo(index + 1);
      } else {
        setPlaying(false);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, playing, beat, index, run, beats.length, goTo]);

  // Nobody is watching a hidden tab; hold the demo until they come back.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const onControl =
        event.target instanceof HTMLElement && event.target.closest('button, a, input, textarea');
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault();
          goTo(index + 1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          goTo(index - 1);
          break;
        case 'Home':
          goTo(0);
          break;
        case 'End':
          goTo(beats.length - 1);
          break;
        case ' ':
          // A focused button already answers Space with a click.
          if (onControl) return;
          event.preventDefault();
          if (mode === 'auto') setPlaying((p) => !p);
          else goTo(index + 1);
          break;
        case 'p':
        case 'P':
          toggleMode();
          break;
        case 'n':
        case 'N':
          setShowNotes((shown) => !shown);
          break;
        case 'r':
        case 'R':
          replay();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, index, beats.length, mode, toggleMode, replay]);

  const Scene = beat.kind === 'scene' ? DEMO_SCENES[beat.scene] : null;
  const nextBeat = beats[index + 1];

  return (
    <main className="flex min-h-[100svh] flex-col bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:px-10 lg:pt-6">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-1">
        <span className="text-plate text-plate-inset flex-1 text-lg font-extrabold lowercase tracking-tight text-terracotta-deep">
          switchboard
        </span>
        {mode === 'auto' && (
          <ControlButton onClick={() => setPlaying((p) => !p)} disabled={last && progress >= 1}>
            <Icon name={playing ? 'pause' : 'play'} size={14} aria-hidden />
            <span className="sr-only sm:not-sr-only">{playing ? 'Pause' : 'Play'}</span>
          </ControlButton>
        )}
        <ControlButton onClick={toggleMode} pressed={presenting}>
          <Icon name="mic" size={14} aria-hidden />
          <span className="sr-only sm:not-sr-only">Presenter</span>
        </ControlButton>
        <ControlButton onClick={toggleFullscreen} desktopOnly>
          <Icon name="external" size={14} aria-hidden />
          Full screen
        </ControlButton>
      </header>

      {/* One segment per beat. In autoplay the current one fills as it plays. */}
      <div
        className="mx-auto mt-3 flex w-full max-w-6xl gap-1"
        role="progressbar"
        aria-label="Demo progress"
        aria-valuemin={1}
        aria-valuemax={beats.length}
        aria-valuenow={index + 1}
        aria-valuetext={`Part ${index + 1} of ${beats.length}`}
      >
        {beats.map((b, i) => {
          const fill = i < index ? 1 : i > index ? 0 : mode === 'auto' ? progress : 1;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to part ${i + 1}: ${b.title}`}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              <span className="block h-full rounded-full bg-terracotta" style={{ width: `${fill * 100}%` }} />
            </button>
          );
        })}
      </div>

      {beat.kind === 'card' ? (
        <section
          key={`${beat.id}-${run}`}
          className="animate-rise mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center py-8 text-center"
          aria-live="polite"
        >
          <p className="text-plate text-plate-inset text-xs font-bold uppercase tracking-[0.2em] text-terracotta-deep lg:text-sm">
            {beat.act}
          </p>
          <h1 className="text-plate text-plate-inset mt-3 text-4xl font-extrabold tracking-tight text-ink lg:text-7xl lg:leading-[1.02]">
            {beat.title}
          </h1>
          <p className="text-plate text-plate-inset mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft lg:mt-6 lg:text-2xl">
            {beat.caption}
          </p>
          {last && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/welcome"
                className="inline-flex h-12 items-center gap-2 rounded-btn bg-brand-gradient px-5 text-base font-bold text-white shadow-lift hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                See the live app
                <Icon name="back" size={16} className="rotate-180" aria-hidden />
              </Link>
            </div>
          )}
          {presenting && showNotes && <TalkTrack notes={beat.notes} next={nextBeat?.title} />}
        </section>
      ) : (
        <div className="mx-auto mt-4 flex w-full max-w-6xl flex-1 flex-col lg:mt-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-center lg:gap-16">
          {/* The stage is a picture of the app; the text beside it carries the
              meaning, so screen readers skip the made-up screen. */}
          <div className="flex items-center justify-center lg:order-2 lg:scale-125" aria-hidden>
            {Scene && (
              <SceneClock key={`${beat.id}-${run}`}>
                <div className="w-full">
                  <Scene />
                </div>
              </SceneClock>
            )}
          </div>
          <section key={beat.id} className="animate-rise mt-4 lg:order-1 lg:mt-0" aria-live="polite">
            <p className="text-plate text-plate-inset text-xs font-bold uppercase tracking-wide text-terracotta-deep lg:text-sm">
              {beat.act}
            </p>
            <h1 className="text-plate text-plate-inset mt-1 text-2xl font-extrabold tracking-tight text-ink lg:mt-3 lg:text-5xl lg:leading-[1.05]">
              {beat.title}
            </h1>
            <p className="text-plate text-plate-inset mt-2 text-[15px] leading-relaxed text-ink-soft lg:mt-5 lg:text-xl">
              {beat.caption}
            </p>
            <button
              type="button"
              onClick={replay}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta lg:mt-4"
            >
              <Icon name="play" size={12} aria-hidden /> Replay scene
            </button>
            {presenting && showNotes && <TalkTrack notes={beat.notes} next={nextBeat?.title} />}
          </section>
        </div>
      )}

      <nav aria-label="Demo" className="mx-auto mt-4 flex w-full max-w-6xl items-center gap-2">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-btn border border-line bg-card text-ink transition-opacity hover:border-terracotta disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          aria-label="Back"
        >
          <Icon name="back" size={20} />
        </button>
        <button
          type="button"
          onClick={() => (last ? restart() : goTo(index + 1))}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-btn bg-brand-gradient text-base font-bold text-white shadow-lift transition-all hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-paper lg:w-56 lg:flex-none"
        >
          {last ? 'Start over' : 'Next'}
          {!last && <Icon name="back" size={18} className="rotate-180" aria-hidden />}
        </button>
        <p className="ml-auto hidden text-xs text-ink-faint lg:block">
          ← → to move · Space to {mode === 'auto' ? 'pause' : 'advance'} · P presenter · F full screen
          {presenting ? ' · N notes' : ''}
        </p>
      </nav>
    </main>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  } else {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

function TalkTrack({ notes, next }: { notes: string; next?: string }) {
  return (
    <div className="mt-6 w-full rounded-2xl border border-dashed border-line bg-card p-4 text-left">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        Talk track · N hides this before you share your screen
      </p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{notes}</p>
      {next && <p className="mt-2 text-xs font-semibold text-ink-faint">Next: {next}</p>}
    </div>
  );
}

function ControlButton({
  onClick,
  pressed,
  disabled,
  desktopOnly = false,
  children,
}: {
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  /** Phones have no full-screen API worth offering (iOS Safari has none). */
  desktopOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      disabled={disabled}
      className={`${desktopOnly ? 'hidden lg:inline-flex' : 'inline-flex'} items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-40 ${
        pressed ? 'bg-terracotta-soft text-terracotta-deep' : 'text-ink-soft hover:bg-cream hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
