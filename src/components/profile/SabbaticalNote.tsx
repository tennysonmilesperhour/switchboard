import type { SabbaticalStatus } from '@/lib/sabbatical';
import { Glyph } from '@/components/ui/Glyph';

/**
 * Someone's sabbatical note, where D6 shows it: their public profile and the
 * invite pickers. The note is their own words, rendered as text only (React
 * escapes it; never put it in `dangerouslySetInnerHTML`).
 */
export function SabbaticalNote({
  name,
  status,
  detail,
  className = '',
}: {
  /** Whose note this is, as the reader knows them. */
  name: string;
  status: SabbaticalStatus;
  /** What it means for the reader here, e.g. what happens to an invitation. */
  detail: string;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-line bg-cream px-3.5 py-3 text-left ${className}`}>
      <p className="text-sm font-bold text-ink">
        <Glyph emoji="🍃" size={14} className="mr-1 inline" />
        {name} is on sabbatical
      </p>
      {status.note ? (
        <p className="mt-1 text-sm leading-relaxed text-ink-soft break-words">“{status.note}”</p>
      ) : null}
      <p className="mt-1 text-xs leading-relaxed text-ink-faint">{detail}</p>
    </div>
  );
}
