'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { errorFor, errorRef, type ErrorCode } from '@/lib/errors';
import { VoiceCapture, type CaptureFailure, type RecorderLike } from '@/lib/voice-capture';

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

interface RecorderNotice {
  message: string;
  code?: ErrorCode;
}

/** What each way a recording can end without a clip tells the reader. */
function noticeFor(reason: CaptureFailure): RecorderNotice {
  if (reason === 'blocked') {
    return {
      message:
        'Microphone access was blocked. Allow it for this site in your browser settings, then try again.',
    };
  }
  if (reason === 'no-microphone') {
    return { message: 'No microphone was found. Connect one, then try again.' };
  }
  if (reason === 'empty') return { message: 'That recording was empty. Try again.' };
  // The recorder itself broke: nothing the reader did, so it carries a code.
  const entry = errorFor('SB-VOICE-RECORD');
  return { message: `${entry.message} ${entry.fix ?? ''}`.trim(), code: entry.code };
}

/**
 * Record → preview → keep/discard a short voice note. Fully client-side: the
 * blob is handed to the parent via `onChange` and only uploaded when the parent
 * submits. A browser that cannot record says so, and writing stays the way to
 * send the message (G33).
 *
 * The microphone is released on every path out, not only a clean stop: a
 * recorder that fails to start or errors mid-way, reaching the time limit,
 * and leaving the page (including while the permission prompt is still open).
 * `VoiceCapture` owns those rules and is tested on its own.
 */
export function VoiceRecorder({
  value,
  onChange,
  disabled = false,
  maxSeconds = 60,
}: VoiceRecorderProps) {
  // null until checked on the client, so server markup stays stable and an
  // unsupported browser is never announced before we know.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  // Waiting on the browser's microphone prompt.
  const [requesting, setRequesting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<RecorderNotice | null>(null);

  const captureRef = useRef<VoiceCapture | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  // The clip on screen now, for revoking its preview URL on unmount.
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSupported(canRecordAudio()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // Leaving the page releases the microphone (mid-recording, or with the
  // permission prompt still open) and the preview URL.
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
      tickRef.current = null;
      captureRef.current?.dispose();
      captureRef.current = null;
      if (valueRef.current) URL.revokeObjectURL(valueRef.current.previewUrl);
    };
  }, []);

  function stopTimer() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function stopRecording() {
    captureRef.current?.stop();
  }

  function startRecording() {
    setNotice(null);
    setRequesting(true);
    if (value) {
      URL.revokeObjectURL(value.previewUrl);
      onChange(null);
    }
    captureRef.current?.dispose();

    const mimeType = pickMimeType();
    const capture = new VoiceCapture(
      {
        getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
        createRecorder: (stream) => {
          const media = stream as MediaStream;
          const recorder = mimeType
            ? new MediaRecorder(media, { mimeType })
            : new MediaRecorder(media);
          return recorder as unknown as RecorderLike;
        },
        now: () => Date.now(),
      },
      {
        onStart: () => {
          startedAtRef.current = Date.now();
          setRequesting(false);
          setRecording(true);
          setElapsed(0);
          stopTimer();
          tickRef.current = window.setInterval(() => {
            const secs = Math.round((Date.now() - startedAtRef.current) / 1000);
            setElapsed(secs);
            if (secs >= maxSeconds) stopRecording();
          }, 250);
        },
        onFinish: ({ blob, durationSeconds }) => {
          stopTimer();
          setRecording(false);
          setElapsed(0);
          onChange({ blob, previewUrl: URL.createObjectURL(blob), durationSeconds });
        },
        onFail: (reason) => {
          stopTimer();
          setRequesting(false);
          setRecording(false);
          setElapsed(0);
          setNotice(noticeFor(reason));
        },
      },
    );
    captureRef.current = capture;
    void capture.start();
  }

  function discard() {
    if (value) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    setNotice(null);
  }

  if (supported === null) return null;

  if (!supported) {
    return (
      <p className="text-xs leading-relaxed text-ink-faint">
        Voice notes need a browser that can record audio, and this one can’t.
        Write your message instead, or open Switchboard in an up-to-date browser
        to record one.
      </p>
    );
  }

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
        disabled={disabled || requesting}
        className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-sm font-semibold text-ink-soft hover:border-terracotta hover:text-terracotta-deep active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-50"
      >
        <Icon name="mic" size={16} />
        Record voice note
      </button>
      {notice && (
        <p role="alert" className="mt-1.5 text-xs text-rose-deep">
          {notice.message}
          {notice.code && (
            <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide opacity-70">
              {errorRef(notice.code)}
            </span>
          )}
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
