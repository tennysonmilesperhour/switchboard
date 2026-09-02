'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CopyButton } from '@/components/ui/CopyButton';

interface ProfileShareProps {
  /** Pre-rendered QR SVG markup (encodes a vCard). */
  qrMarkup: string;
  /** vCard text, offered as a downloadable .vcf. */
  vcard: string;
  displayName: string;
  handle: string;
  /** Whether contact details are included in the shared card. */
  contactIncluded: boolean;
}

export function ProfileShare({
  qrMarkup,
  vcard,
  displayName,
  handle,
  contactIncluded,
}: ProfileShareProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  function downloadVcf() {
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${handle || 'contact'}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        <div className="flex items-center gap-4 p-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Enlarge QR code"
            className="shrink-0 rounded-xl border border-line bg-white p-1.5 transition-transform active:scale-95"
          >
            <div
              className="size-20 [&>svg]:size-full [&>svg]:rounded-md"
              // qrMarkup is generated server-side by the qrcode library — trusted.
              dangerouslySetInnerHTML={{ __html: qrMarkup }}
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-bold text-ink">
              <Icon name="qr" size={16} className="text-terracotta-deep" />
              Contact card
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">
              Scan to save {displayName?.split(' ')[0] || 'me'} to contacts.
            </p>
            <p className="mt-1 text-xs text-ink-faint">
              {contactIncluded
                ? 'Includes your email & phone.'
                : 'Email & phone hidden - toggle in edit.'}
            </p>
          </div>
        </div>
        <div className="flex border-t border-line">
          <button
            type="button"
            onClick={downloadVcf}
            className="flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-bold text-ink-soft hover:bg-cream"
          >
            <Icon name="account" size={16} />
            Save .vcf
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex flex-1 items-center justify-center gap-1.5 border-l border-line py-3 text-sm font-bold text-ink-soft hover:bg-cream"
          >
            <Icon name="share" size={16} />
            Show QR
          </button>
        </div>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your QR contact code"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-card bg-card p-6 text-center shadow-lift"
          >
            <div
              className="mx-auto aspect-square w-full max-w-[16rem] rounded-xl border border-line bg-white p-3 [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: qrMarkup }}
            />
            <p className="mt-4 text-lg font-extrabold text-ink">{displayName}</p>
            <p className="text-sm text-ink-faint">@{handle}</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={downloadVcf}
                className="inline-flex items-center gap-1.5 rounded-pill bg-brand-gradient px-4 py-2 text-sm font-bold text-white shadow-lift active:scale-[0.98]"
              >
                <Icon name="account" size={15} />
                Save contact
              </button>
              <CopyButton text={`@${handle}`} label="Copy handle" />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 text-sm font-semibold text-ink-faint hover:text-ink"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
