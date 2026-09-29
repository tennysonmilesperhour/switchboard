/**
 * One voice-note recording, from asking for the microphone to handing back a
 * clip (completion plan G33).
 *
 * The recorder used to release the microphone only from a successful `stop`.
 * A recorder that could not be built for the stream, one that failed to
 * start, one that raised an error mid-recording, and a page left while the
 * permission prompt was still open each kept the browser's "recording"
 * indicator on after the recorder was gone. Every path here ends in
 * `releaseStream`, and `dispose` (unmount) reports nothing afterwards.
 *
 * Browser APIs arrive through `deps`, so the release rules are tested without
 * a browser (`voice-capture.test.ts`).
 */

/** The part of a `MediaStreamTrack` this needs. */
export interface TrackLike {
  stop(): void;
}

/** The part of a `MediaStream` this needs. */
export interface StreamLike {
  getTracks(): TrackLike[];
}

/** The part of a `MediaRecorder` this needs. */
export interface RecorderLike {
  readonly state: string;
  readonly mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start(): void;
  stop(): void;
}

/**
 * Why a recording ended without a clip.
 *   - `blocked`: the reader (or the browser) refused the microphone.
 *   - `no-microphone`: there is no microphone to use.
 *   - `failed`: the microphone or the browser's recorder could not start, or
 *     the recorder broke mid-way.
 *   - `empty`: it stopped with nothing recorded.
 */
export type CaptureFailure = 'blocked' | 'no-microphone' | 'failed' | 'empty';

/** Classify a `getUserMedia` rejection by its DOMException name. */
export function microphoneFailure(error: unknown): CaptureFailure {
  const name = error && typeof error === 'object' ? (error as { name?: unknown }).name : null;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-microphone';
  return 'failed';
}

export interface CaptureDeps {
  getUserMedia(): Promise<StreamLike>;
  createRecorder(stream: StreamLike): RecorderLike;
  now(): number;
}

export interface CaptureCallbacks {
  /** The microphone is live and recording. */
  onStart(): void;
  onFinish(clip: { blob: Blob; durationSeconds: number }): void;
  onFail(reason: CaptureFailure): void;
}

/** Stop every track, so the browser drops its recording indicator. Never throws. */
export function releaseStream(stream: StreamLike | null | undefined): void {
  if (!stream) return;
  let tracks: TrackLike[] = [];
  try {
    tracks = stream.getTracks();
  } catch {
    return;
  }
  for (const track of tracks) {
    try {
      track.stop();
    } catch {
      // Already ended; nothing left to release.
    }
  }
}

export class VoiceCapture {
  private stream: StreamLike | null = null;
  private recorder: RecorderLike | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  /** Unmounted, finished or failed: nothing more is reported. */
  private done = false;

  constructor(
    private readonly deps: CaptureDeps,
    private readonly callbacks: CaptureCallbacks,
  ) {}

  /** Whether the microphone is held right now. */
  get holdingMicrophone(): boolean {
    return this.stream !== null;
  }

  async start(): Promise<void> {
    let stream: StreamLike;
    try {
      stream = await this.deps.getUserMedia();
    } catch (error) {
      if (!this.done) {
        this.done = true;
        this.callbacks.onFail(microphoneFailure(error));
      }
      return;
    }
    // Left while the permission prompt was open: the microphone arrived for
    // nobody, so it goes straight back.
    if (this.done) {
      releaseStream(stream);
      return;
    }
    this.stream = stream;

    try {
      const recorder = this.deps.createRecorder(stream);
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.onstop = () => this.finish();
      recorder.onerror = () => this.fail();
      this.startedAt = this.deps.now();
      recorder.start();
    } catch {
      this.fail();
      return;
    }
    this.callbacks.onStart();
  }

  /** Stop recording and hand back the clip (through `onFinish`). */
  stop(): void {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') return;
    try {
      recorder.stop();
    } catch {
      this.fail();
    }
  }

  /** Unmount: release everything, report nothing. Safe to call more than once. */
  dispose(): void {
    this.done = true;
    this.teardown();
  }

  private finish(): void {
    const recorder = this.recorder;
    this.teardown();
    if (this.done) return;
    this.done = true;
    const durationSeconds = Math.max(1, Math.round((this.deps.now() - this.startedAt) / 1000));
    const blob = new Blob(this.chunks, { type: recorder?.mimeType || 'audio/webm' });
    this.chunks = [];
    if (blob.size === 0) {
      this.callbacks.onFail('empty');
      return;
    }
    this.callbacks.onFinish({ blob, durationSeconds });
  }

  private fail(): void {
    this.teardown();
    if (this.done) return;
    this.done = true;
    this.chunks = [];
    this.callbacks.onFail('failed');
  }

  /** Detach the recorder, stop it if it is still running, release the stream. */
  private teardown(): void {
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // A broken recorder may refuse to stop; the stream below is what
          // actually holds the microphone.
        }
      }
    }
    releaseStream(this.stream);
    this.stream = null;
  }
}
