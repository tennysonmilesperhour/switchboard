/**
 * Pure helpers behind the voice dictation flow (DescribePlan).
 *
 * The Web Speech API redelivers the ENTIRE result list on every `result`
 * event, and iOS Safari revises earlier entries in place — sometimes without
 * ever marking them final. Rebuilding the transcript from scratch on each
 * event, instead of appending deltas, makes duplicated words impossible.
 */

export interface DictationAlternativeLike {
  transcript: string;
}

export type DictationResultLike = ArrayLike<DictationAlternativeLike> & {
  /** Absent on engines that only ever report final results. */
  isFinal?: boolean;
};

export interface SpeechRecognitionEventLike {
  results: ArrayLike<DictationResultLike>;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (event: SpeechRecognitionEventLike) => void;
  onend: () => void;
  onerror: (event: { error?: string }) => void;
  start: () => void;
  stop: () => void;
}

/** Split a result list into settled text and the still-changing tail. */
export function collectTranscript(results: ArrayLike<DictationResultLike>): {
  finalText: string;
  interimText: string;
} {
  const finals: string[] = [];
  const interims: string[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    const transcript = (result[0]?.transcript ?? '').trim();
    if (!transcript) continue;
    (result.isFinal === false ? interims : finals).push(transcript);
  }
  return { finalText: finals.join(' '), interimText: interims.join(' ') };
}

/** Join typed text and transcript fragments, skipping empty pieces. */
export function joinDictation(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Human-readable message for a SpeechRecognition error code, or null when the
 * code is routine (silence, an intentional stop) and dictation may continue.
 */
export function dictationErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'no-speech':
    case 'aborted':
      return null;
    case 'not-allowed':
      return 'Microphone access was blocked. Allow the mic in your browser settings, then try again.';
    case 'service-not-allowed':
      return 'Dictation is turned off on this device. On iPhone, turn on Siri & Dictation in Settings → General → Keyboard — or just type your plan.';
    case 'audio-capture':
      return 'No microphone was found. Check that your mic works, or type your plan instead.';
    case 'network':
      return 'The speech service could not be reached. Check your connection, or type your plan instead.';
    case 'language-not-supported':
      return 'Voice input is not available for this language yet. Typing works great too.';
    default:
      return 'Voice input hit a snag. Try again, or type your plan instead.';
  }
}
