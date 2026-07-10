'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export interface RecordedClip {
  blob: Blob;
  /** Object URL for local preview only — never persisted. */
  previewUrl: string;
  durationSeconds: number;
}

/** Feature-detect once, on the client, so SSR markup stays stable. */
export function canRecordAudio(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface VoiceRecorderProps {
  value: RecordedClip | null;
  onChange: (clip: RecordedClip | null) => void;
  disabled?: boolean;
  maxSeconds?: number;
}

/**
 * Record → preview → keep/discard a short voice note. Fully client-side: the
 * blob is handed to the parent via `onChange` and only uploaded when the parent
 * submits. Renders nothing when the browser can't record, so text-only flows
 * remain the graceful fallback.
 */
export function VoiceRecorder({
  value,
  onChange,
  disabled = false,
  maxSeconds = 60,
}: VoiceRecorderProps) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSupported(canRecordAudio()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // Tear down any live stream / preview URL on unmount.
  useEffect(() => {
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (value) URL.revokeObjectURL(value.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTimer() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function startRecording() {
    setError('');
    if (value) {
      URL.revokeObjectURL(value.previewUrl);
      onChange(null);
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access was blocked. Check your browser permissions.');
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });
      setRecording(false);
      setElapsed(0);
      if (blob.size === 0) {
        setError('That recording was empty. Try again.');
        return;
      }
      onChange({ blob, previewUrl: URL.createObjectURL(blob), durationSeconds });
    };

    startedAtRef.current = Date.now();
    recorder.start();
    setRecording(true);
    setElapsed(0);
    tickRef.current = window.setInterval(() => {
      const secs = Math.round((Date.now() - startedAtRef.current) / 1000);
      setElapsed(secs);
      if (secs >= maxSeconds) stopRecording();
    }, 250);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }

  function discard() {
    if (value) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    setError('');
  }

  if (!supported) return null;

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <PreviewPlayer clip={value} />
        <button
          type="button"
          onClick={discard}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-pill px-2 py-1.5 text-xs font-semibold text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-50"
          aria-label="Discard voice note"
        >
          <Icon name="trash" size={15} />
          Discard
        </button>
      </div>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={stopRecording}
          className="inline-flex items-center gap-1.5 rounded-pill bg-rose-deep px-3.5 py-2 text-sm font-bold text-white active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          <Icon name="stop" size={16} />
          Stop
        </button>
        <span
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-deep"
          role="timer"
          aria-live="polite"
        >
          <span className="size-2 rounded-full bg-rose-deep animate-pulse" aria-hidden />
          {formatDuration(elapsed)} / {formatDuration(maxSeconds)}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-sm font-semibold text-ink-soft hover:border-terracotta hover:text-terracotta-deep active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-50"
      >
        <Icon name="mic" size={16} />
        Record voice note
      </button>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-rose-deep">
          {error}
        </p>
      )}
    </div>
  );
}

/** Plays back the not-yet-uploaded local clip. */
function PreviewPlayer({ clip }: { clip: RecordedClip }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => setPlaying(false));
    }
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-cream px-3 py-1.5 text-sm">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex size-7 items-center justify-center rounded-full bg-terracotta text-white active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        aria-label={playing ? 'Pause preview' : 'Play preview'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={14} />
      </button>
      <span className="font-semibold text-ink-soft">
        Voice note · {formatDuration(clip.durationSeconds)}
      </span>
      <audio
        ref={audioRef}
        src={clip.previewUrl}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </span>
  );
}
