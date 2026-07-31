import { errorRef, type ErrorCode } from '@/lib/errors';

interface ErrorNoticeProps {
  /** What happened, in the reader's terms. */
  message: string;
  /** The next step, when there is one they can take. */
  fix?: string | null;
  /** The stable code. Shown quietly, always — see @/lib/errors. */
  code?: ErrorCode | null;
  /** Next.js error digest, when this came from an error boundary. */
  digest?: string | null;
  className?: string;
}

/**
 * The one way a failure is shown to a human: what happened, what to do about
 * it, and a reference that survives a screenshot.
 *
 * The reference is rendered small and quiet but never hidden behind a toggle.
 * Every failure report we have actually received arrived as a photo of a phone
 * screen from someone who was not filing a bug — if the code is one tap away,
 * it isn't in the photo, and we're back to guessing which of four causes
 * produced the same sentence.
 */
export function ErrorNotice({
  message,
  fix,
  code,
  digest,
  className = '',
}: ErrorNoticeProps) {
  return (
    <div className={className}>
      <p className="text-sm font-bold text-ink">{message}</p>
      {fix && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{fix}</p>}
      {code && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
          {errorRef(code, digest)}
        </p>
      )}
    </div>
  );
}
