import { describe, expect, it } from 'vitest';
import {
  collectTranscript,
  dictationErrorMessage,
  joinDictation,
  type DictationResultLike,
} from './dictation';

function result(transcript: string, isFinal?: boolean): DictationResultLike {
  const entry = [{ transcript }] as unknown as DictationResultLike;
  if (isFinal !== undefined) entry.isFinal = isFinal;
  return entry;
}

describe('collectTranscript', () => {
  it('separates final results from the interim tail', () => {
    const { finalText, interimText } = collectTranscript([
      result('dinner friday at 7', true),
      result('invite sam and', false),
    ]);
    expect(finalText).toBe('dinner friday at 7');
    expect(interimText).toBe('invite sam and');
  });

  it('rebuilds without duplication when the engine redelivers the full list', () => {
    // Same result list delivered twice (as the Web Speech API does) must not
    // double the words.
    const results = [result('coffee tomorrow', true), result('with alex', true)];
    const first = collectTranscript(results);
    const second = collectTranscript(results);
    expect(first.finalText).toBe('coffee tomorrow with alex');
    expect(second.finalText).toBe(first.finalText);
  });

  it('treats results with no isFinal flag as final', () => {
    const { finalText, interimText } = collectTranscript([result('game night saturday')]);
    expect(finalText).toBe('game night saturday');
    expect(interimText).toBe('');
  });

  it('skips empty and whitespace-only transcripts', () => {
    const { finalText } = collectTranscript([
      result('   ', true),
      result('brunch sunday', true),
      [] as unknown as DictationResultLike,
    ]);
    expect(finalText).toBe('brunch sunday');
  });
});

describe('joinDictation', () => {
  it('joins non-empty parts with single spaces', () => {
    expect(joinDictation('typed intro', 'spoken middle', 'interim tail')).toBe(
      'typed intro spoken middle interim tail',
    );
  });

  it('drops empty parts and trims the rest', () => {
    expect(joinDictation('', '  dinner friday  ', '')).toBe('dinner friday');
    expect(joinDictation('', '', '')).toBe('');
  });
});

describe('dictationErrorMessage', () => {
  it('is silent for routine, recoverable codes', () => {
    expect(dictationErrorMessage('no-speech')).toBeNull();
    expect(dictationErrorMessage('aborted')).toBeNull();
  });

  it('explains permission and device problems', () => {
    expect(dictationErrorMessage('not-allowed')).toMatch(/microphone access/i);
    expect(dictationErrorMessage('service-not-allowed')).toMatch(/siri & dictation/i);
    expect(dictationErrorMessage('audio-capture')).toMatch(/no microphone/i);
    expect(dictationErrorMessage('network')).toMatch(/connection/i);
  });

  it('falls back to a generic message for unknown codes', () => {
    expect(dictationErrorMessage('something-new')).toMatch(/type your plan/i);
    expect(dictationErrorMessage(undefined)).toMatch(/type your plan/i);
  });
});
