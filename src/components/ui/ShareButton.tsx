'use client';

import { useToast } from '@/components/ui/Toast';

interface ShareButtonProps {
  /** App-relative path (e.g. "/events/123"); resolved to an absolute URL. */
  path: string;
  title?: string;
  text?: string;
  label?: string;
  className?: string;
}

/**
 * One-tap native share (iMessage/WhatsApp/anything the OS offers) with a
 * copy-link fallback. Makes an invite hand off to the channel people already
 * text in, instead of forcing an app install.
 */
export function ShareButton({
  path,
  title,
  text,
  label = 'Share',
  className = '',
}: ShareButtonProps) {
  const toast = useToast();

  async function share() {
    const url =
      typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url });
        return;
      } catch {
        // User dismissed the sheet, or share failed - fall through to copy.
      }
    }
    try {
      await nav?.clipboard.writeText(url);
      toast.success('Link copied.');
    } catch {
      if (typeof window !== 'undefined') window.prompt('Copy this link:', url);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className={`inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${className}`}
    >
      🔗 {label}
    </button>
  );
}
