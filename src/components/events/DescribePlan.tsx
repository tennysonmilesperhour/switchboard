'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { parsePlanDescription, type PlanDraft } from '@/lib/actions/plan';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** Voice-first planning: describe it, Switchboard drafts the cascade. */
export function DescribePlan({ onDraft }: { onDraft: (draft: PlanDraft) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = getSpeechRecognition();
    if (!recognition) {
      setError('Voice input is not available in this browser. Typing works great too.');
      return;
    }
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, i) => event.results[i][0]?.transcript ?? '',
      ).join(' ');
      setText((current) => `${current} ${transcript}`.trim());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    setListening(true);
    setError('');
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
        className="w-full rounded-card border border-dashed border-line bg-cream px-4 py-3 text-sm text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors text-left"
      >
        ✨ Or just describe it: “Coffee tomorrow morning, try Alex first, then
        Jordan, 20-minute windows”
      </button>
    );
  }

  return (
    <Card tone="cream" className="animate-rise">
      <label htmlFor="describe" className="text-sm font-medium">
        Describe your plan
      </label>
      <textarea
        id="describe"
        value={text}
        onChange={(e) => setText(e.target.value)}
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
        >
          {listening ? '⏹ Listening…' : '🎙️ Speak'}
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
