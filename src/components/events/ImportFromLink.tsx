'use client';

import { Glyph } from '@/components/ui/Glyph';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { importEventFromLink, type ImportResult } from '@/lib/actions/import';
import { errorRef, type ErrorCode } from '@/lib/errors';
import { resolveTimeZone } from '@/lib/client/time-zone';

/**
 * Paste a Partiful / Luma / Facebook / Apple-Invites / Eventbrite link and pull
 * the plan into Switchboard. On success, hands the parsed fields to the wizard.
 */
export function ImportFromLink({
  onImport,
}: {
  onImport: (result: ImportResult) => void;
}) {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    const value = url.trim();
    if (!value) return;
    setError('');
    setErrorCode(null);
    startTransition(async () => {
      const result = await importEventFromLink(value, resolveTimeZone()).catch(
        (): ImportResult => ({ ok: false, code: 'SB-IMPORT-READ' }),
      );
      if (!result.ok) {
        setError(result.error ?? 'We couldn’t import that link.');
        setErrorCode(result.code ?? null);
        return;
      }
      onImport(result);
      setUrl('');
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-card border border-dashed border-line bg-cream px-4 py-3 text-sm text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
      >
        <Glyph emoji="🔗" size={14} className="inline -mt-0.5 mr-1" />Already have a plan elsewhere? Bring it in from a link.
      </button>
    );
  }

  return (
    <div className="rounded-card border border-line bg-card p-3 space-y-2">
      <p className="text-sm font-bold">Import from a link</p>
      <p className="text-xs text-ink-faint">
        Paste a Partiful, Luma, Facebook, Apple Invites, or Eventbrite link.
      </p>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), run())}
          inputMode="url"
          placeholder="https://partiful.com/e/…"
          aria-label="Event link to import"
          className="flex-1 rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
        />
        <Button
          type="button"
          size="sm"
          onClick={run}
          disabled={pending || !url.trim()}
        >
          {pending ? 'Reading…' : 'Import'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-deep">
          {error}
          {errorCode && (
            <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              {errorRef(errorCode)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
