import { describe, expect, it, vi } from 'vitest';
import {
  VoiceCapture,
  microphoneFailure,
  releaseStream,
  type CaptureCallbacks,
  type RecorderLike,
  type StreamLike,
} from './voice-capture';

/**
 * G33: the microphone must be released on every way out of a recording, not
 * only a clean stop. "Released" means every track of the stream was stopped,
 * which is what turns off the browser's recording indicator.
 */

function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream: StreamLike = { getTracks: () => tracks };
  const released = () => tracks.every((track) => track.stop.mock.calls.length > 0);
  return { stream, tracks, released };
}

function fakeRecorder(options: { throwOnStart?: boolean } = {}) {
  const recorder: RecorderLike & { state: string } = {
    state: 'inactive',
    mimeType: 'audio/webm',
    ondataavailable: null,
    onstop: null,
    onerror: null,
    start: vi.fn(() => {
      if (options.throwOnStart) throw new Error('NotSupportedError');
      recorder.state = 'recording';
    }),
    stop: vi.fn(() => {
      if (recorder.state === 'inactive') return;
      recorder.state = 'inactive';
      // Browsers deliver the last chunk, then `stop`.
      recorder.ondataavailable?.({ data: new Blob(['voice']) });
      recorder.onstop?.();
    }),
  };
  return recorder;
}

function callbacks() {
  return {
    onStart: vi.fn(),
    onFinish: vi.fn(),
    onFail: vi.fn(),
  } satisfies CaptureCallbacks;
}

function capture(
  stream: StreamLike | Promise<StreamLike>,
  recorder: RecorderLike | (() => RecorderLike),
  cb = callbacks(),
) {
  let clock = 1_000;
  const voice = new VoiceCapture(
    {
      getUserMedia: () => Promise.resolve(stream),
      createRecorder: () => (typeof recorder === 'function' ? recorder() : recorder),
      now: () => (clock += 4_000),
    },
    cb,
  );
  return { voice, cb };
}

describe('VoiceCapture', () => {
  it('releases the microphone and hands back the clip after a clean stop', async () => {
    const { stream, released } = fakeStream();
    const { voice, cb } = capture(stream, fakeRecorder());

    await voice.start();
    expect(cb.onStart).toHaveBeenCalledTimes(1);
    expect(voice.holdingMicrophone).toBe(true);

    voice.stop();

    expect(released()).toBe(true);
    expect(voice.holdingMicrophone).toBe(false);
    expect(cb.onFinish).toHaveBeenCalledTimes(1);
    const clip = cb.onFinish.mock.calls[0][0];
    expect(clip.blob.size).toBeGreaterThan(0);
    expect(clip.durationSeconds).toBe(4);
    expect(cb.onFail).not.toHaveBeenCalled();
  });

  it('releases the microphone when the recorder cannot be built for the stream', async () => {
    const { stream, released } = fakeStream();
    const { voice, cb } = capture(stream, () => {
      throw new Error('NotSupportedError');
    });

    await voice.start();

    expect(released()).toBe(true);
    expect(cb.onFail).toHaveBeenCalledWith('failed');
    expect(cb.onStart).not.toHaveBeenCalled();
  });

  it('releases the microphone when the recorder fails to start', async () => {
    const { stream, released } = fakeStream();
    const { voice, cb } = capture(stream, fakeRecorder({ throwOnStart: true }));

    await voice.start();

    expect(released()).toBe(true);
    expect(cb.onFail).toHaveBeenCalledWith('failed');
  });

  it('releases the microphone when the recorder errors mid-recording', async () => {
    const { stream, released } = fakeStream();
    const recorder = fakeRecorder();
    const { voice, cb } = capture(stream, recorder);

    await voice.start();
    recorder.onerror?.(new Event('error'));

    expect(released()).toBe(true);
    expect(recorder.stop).toHaveBeenCalled();
    expect(cb.onFail).toHaveBeenCalledTimes(1);
    expect(cb.onFail).toHaveBeenCalledWith('failed');
    expect(cb.onFinish).not.toHaveBeenCalled();
  });

  it('releases the microphone on unmount mid-recording, and reports nothing after', async () => {
    const { stream, released } = fakeStream();
    const recorder = fakeRecorder();
    const { voice, cb } = capture(stream, recorder);

    await voice.start();
    voice.dispose();

    expect(released()).toBe(true);
    expect(recorder.state).toBe('inactive');
    expect(cb.onFinish).not.toHaveBeenCalled();
    expect(cb.onFail).not.toHaveBeenCalled();
    // A late stop from a timer does nothing either.
    voice.stop();
    voice.dispose();
    expect(cb.onFinish).not.toHaveBeenCalled();
  });

  it('gives back a microphone granted after the page was left', async () => {
    const { stream, released } = fakeStream();
    let grant: (value: StreamLike) => void = () => undefined;
    const pending = new Promise<StreamLike>((resolve) => {
      grant = resolve;
    });
    const createRecorder = vi.fn(() => fakeRecorder());
    const cb = callbacks();
    const voice = new VoiceCapture(
      { getUserMedia: () => pending, createRecorder, now: () => 0 },
      cb,
    );

    const starting = voice.start();
    voice.dispose();
    grant(stream);
    await starting;

    expect(released()).toBe(true);
    expect(createRecorder).not.toHaveBeenCalled();
    expect(cb.onStart).not.toHaveBeenCalled();
    expect(cb.onFail).not.toHaveBeenCalled();
  });

  it('says a refused microphone was blocked, holding nothing', async () => {
    const cb = callbacks();
    const voice = new VoiceCapture(
      {
        getUserMedia: () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
        createRecorder: () => fakeRecorder(),
        now: () => 0,
      },
      cb,
    );

    await voice.start();

    expect(cb.onFail).toHaveBeenCalledWith('blocked');
    expect(voice.holdingMicrophone).toBe(false);
  });

  it('reports an empty recording, and still releases the microphone', async () => {
    const { stream, released } = fakeStream();
    const recorder = fakeRecorder();
    recorder.stop = vi.fn(() => {
      recorder.state = 'inactive';
      recorder.onstop?.();
    });
    const { voice, cb } = capture(stream, recorder);

    await voice.start();
    voice.stop();

    expect(released()).toBe(true);
    expect(cb.onFail).toHaveBeenCalledWith('empty');
  });
});

describe('microphoneFailure', () => {
  it('tells a refusal from a missing microphone from a broken one', () => {
    expect(microphoneFailure({ name: 'NotAllowedError' })).toBe('blocked');
    expect(microphoneFailure({ name: 'SecurityError' })).toBe('blocked');
    expect(microphoneFailure({ name: 'NotFoundError' })).toBe('no-microphone');
    expect(microphoneFailure({ name: 'NotReadableError' })).toBe('failed');
    expect(microphoneFailure(null)).toBe('failed');
  });
});

describe('releaseStream', () => {
  it('stops every track and tolerates one that already ended', () => {
    const ended = {
      stop: vi.fn(() => {
        throw new Error('already ended');
      }),
    };
    const live = { stop: vi.fn() };
    releaseStream({ getTracks: () => [ended, live] });
    expect(live.stop).toHaveBeenCalled();
    expect(() => releaseStream(null)).not.toThrow();
  });
});
