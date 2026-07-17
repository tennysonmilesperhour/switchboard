'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { parsePlanDescription, type PlanDraft } from '@/lib/actions/plan';
import {
  collectTranscript,
  dictationErrorMessage,
  joinDictation,
  type SpeechRecognitionLike,
} from '@/lib/dictation';

function getSpeechRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

// iOS Safari ends recognition sessions after brief pauses, so we restart to
// keep the mic open until the user taps stop. A session that produced nothing
// and died faster than this is treated as broken — no restart — so a failing
// engine can't spin in a silent loop.
const MIN_HEALTHY_SESSION_MS = 1500;

/** Voice-first planning: describe it, Switchboard drafts the cascade. */
export function DescribePlan({ onDraft }: { onDraft: (draft: PlanDraft) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Text that predates the live session (typed, or spoken before a restart).
  // Displayed text is always base + final + interim, rebuilt on every event.
  const baseRef = useRef('');
  const finalRef = useRef('');
  const interimRef = useRef('');
  const stopRequestedRef = useRef(false);
  const fatalErrorRef = useRef(false);
  const hadResultRef = useRef(false);
  const sessionStartedAtRef = useRef(0);

  // Don't leave the mic running if the wizard unmounts mid-dictation.
  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
      recognitionRef.current?.stop();
    };
  }, []);

  function stopDictation() {
    stopRequestedRef.current = true;
    recognitionRef.current?.stop();
    setListening(false);
  }

  function startDictation() {
    const recognition = getSpeechRecognition();
    if (!recognition) {
      setError('Voice input is not available in this browser. Typing works great too.');
      return;
    }

    recognitionRef.current = recognition;
    baseRef.current = text;
    finalRef.current = '';
    interimRef.current = '';
    stopRequestedRef.current = false;
    fatalErrorRef.current = false;
    hadResultRef.current = false;
    sessionStartedAtRef.current = Date.now();

    recognition.lang = navigator.language || 'en-US';
    // Live interim results are the whole point: the user sees their words
    // appear as they speak, so there is no doubt recording is working.
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      hadResultRef.current = true;
      const { finalText, interimText } = collectTranscript(event.results);
      finalRef.current = finalText;
      interimRef.current = interimText;
      setText(joinDictation(baseRef.current, finalText, interimText));
    };

    recognition.onerror = (event) => {
      const message = dictationErrorMessage(event.error);
      if (message) {
        fatalErrorRef.current = true;
        setError(message);
      }
    };

    recognition.onend = () => {
      const wantMore = !stopRequestedRef.current && !fatalErrorRef.current;
      const healthy =
        hadResultRef.current ||
        Date.now() - sessionStartedAtRef.current >= MIN_HEALTHY_SESSION_MS;
      if (wantMore && healthy) {
        // A restarted session's result list starts empty, so fold this
        // session's words into the base first or they would be lost.
        baseRef.current = joinDictation(
          baseRef.current,
          finalRef.current,
          interimRef.current,
        );
        finalRef.current = '';
        interimRef.current = '';
        hadResultRef.current = false;
        sessionStartedAtRef.current = Date.now();
        try {
          recognition.start();
          return;
        } catch {
          // Engine refused the restart — settle what we have below.
        }
      }
      setText(joinDictation(baseRef.current, finalRef.current, interimRef.current));
      setListening(false);
    };

    try {
      recognition.start();
    } catch {
      setError('Voice input hit a snag. Try again, or type your plan instead.');
      return;
    }
    setListening(true);
    setError('');
  }

  function toggleMic() {
    if (listening) {
      stopDictation();
    } else {
      startDictation();
    }
  }

  function parse() {
    startTransition(async () => {
      const result = await parsePlanDescription(text);
      if (!result.ok || !result.draft) {
        setError(result.error ?? 'Could not draft that. Try adding a bit more detail.');
        return;
      }
      onDraft(result.draft);
      setOpen(false);
      setText('');
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-card border border-dashed border-line bg-cream px-4 py-3.5 text-sm text-ink-soft hover:border-terracotta hover:text-terracotta-deep hover:bg-terracotta-soft active:scale-[0.99] transition-all text-left"
      >
        <span className="font-bold text-terracotta-deep">✨ Or just describe it:</span>{' '}
        “Coffee tomorrow morning, try Alex first, then Jordan, 20-minute windows”
      </button>
    );
  }

  return (
    <Card tone="cream" className="animate-rise">
      <label htmlFor="describe" className="text-base font-extrabold tracking-tight">
        Describe your plan
      </label>
      <textarea
        id="describe"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          // A manual edit becomes the new base; hand the mic back to the
          // keyboard so the next result event can't clobber their typing.
          baseRef.current = e.target.value;
          finalRef.current = '';
          interimRef.current = '';
          if (listening) stopDictation();
        }}
        rows={3}
        placeholder="Dinner Friday at 7, invite Sam, Priya, and Marcus one at a time…"
        className="mt-2 w-full rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-terracotta resize-none"
      />
      {error && <p role="alert" className="text-xs text-rose-deep mt-1.5">{error}</p>}
      <div className="flex gap-2 mt-2.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={toggleMic}
          aria-pressed={listening}
          aria-label={listening ? 'Stop recording' : 'Speak your plan'}
        >
          {listening ? (
            <>
              <span
                className="size-2.5 rounded-full bg-rose-deep animate-pulse-soft"
                aria-hidden
              />
              Listening…
            </>
          ) : (
            <>
              <Icon name="mic" size={15} />
              Speak
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={pending || !text.trim()}
          onClick={parse}
        >
          {pending ? 'Drafting…' : 'Draft my plan'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <p className="text-xs text-ink-faint mt-2">
        You will see the full draft before anything is sent.
      </p>
    </Card>
  );
}
