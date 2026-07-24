'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = 'Copy link', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable - show the text so it can be copied manually.
      window.prompt('Copy this link:', text);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      // Surface the exact URL being copied: it lets a host see where a link
      // points before sending it, and lets the invite-link contract test read
      // the real link out of the UI instead of reconstructing it.
      title={text}
      className={`inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors ${
        copied ? 'border-sage text-sage-deep' : ''
      } ${className}`}
    >
      {copied ? (
        <>
          <Icon name="check" size={14} />
          Copied
        </>
      ) : (
        label
      )}
    </button>
  );
}
