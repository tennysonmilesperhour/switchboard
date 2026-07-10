'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatDuration } from '@/components/ui/VoiceRecorder';

interface VoiceNoteProps {
  url: string;
  durationSeconds?: number | null;
  /** Visual weight: 'solid' for a standalone note, 'soft' inside tinted cards. */
  tone?: 'solid' | 'soft';
}

/** Playback chip for a saved voice note (a public URL from the media bucket). */
export function VoiceNote({ url, durationSeconds, tone = 'solid' }: VoiceNoteProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(durationSeconds ?? null);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => setPlaying(false));
    }
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    setRemaining(Math.max(0, Math.ceil(audio.duration - audio.currentTime)));
  }

  // Count down while playing; otherwise show the total (or a neutral label).
  const label =
    playing && remaining != null
      ? formatDuration(remaining)
      : durationSeconds
        ? formatDuration(durationSeconds)
        : 'Voice note';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-sm ${
        tone === 'soft' ? 'bg-white/60' : 'bg-cream'
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        className="inline-flex size-8 items-center justify-center rounded-full bg-terracotta text-white active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={15} />
      </button>
      <span className="inline-flex items-center gap-1.5 font-semibold text-ink-soft">
        <Icon name="mic" size={14} className="text-ink-faint" />
        {label}
      </span>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setRemaining(durationSeconds ?? null);
        }}
        onTimeUpdate={onTimeUpdate}
        className="hidden"
      />
    </span>
  );
}
