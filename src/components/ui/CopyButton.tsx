'use client';

import { useState } from 'react';

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
      // Clipboard unavailable — show the text so it can be copied manually.
      window.prompt('Copy this link:', text);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors ${className}`}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}
