'use client';

import { useId, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CopyButton } from '@/components/ui/CopyButton';
import { Dialog } from '@/components/ui/Dialog';

interface ProfileShareProps {
  /** Pre-rendered QR SVG markup (encodes a vCard). */
  qrMarkup: string;
  /** vCard text, offered as a downloadable .vcf. */
  vcard: string;
  displayName: string;
  handle: string;
  /** Absolute `/u/<handle>` link, or null when there is no handle to link to. */
  profileUrl: string | null;
  /** Whether contact details are included in the shared card. */
  contactIncluded: boolean;
}

export function ProfileShare({
  qrMarkup,
  vcard,
  displayName,
  handle,
  profileUrl,
  contactIncluded,
}: ProfileShareProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

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
        {profileUrl && (
          // The /u/ link used to live only inside the QR dialog, where people
          // looking for "my profile link" never found it.
          <div className="flex justify-center border-t border-line px-4 py-1.5">
            <CopyButton text={profileUrl} label="Copy profile link" className="min-h-11" />
          </div>
        )}
      </div>

      {open ? (
        <Dialog
          onClose={() => setOpen(false)}
          labelledBy={titleId}
          panelClassName="w-full max-w-xs rounded-card bg-card p-6 text-center shadow-lift"
        >
            <div
              className="mx-auto aspect-square w-full max-w-[16rem] rounded-xl border border-line bg-white p-3 [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: qrMarkup }}
            />
            <h2 id={titleId} className="mt-4 text-lg font-extrabold text-ink">
              {displayName}
            </h2>
            {handle && <p className="text-sm text-ink-faint">@{handle}</p>}
            {profileUrl && (
              // The link itself, visible, so it can be read out or checked
              // before it is sent anywhere.
              <p className="mt-2 break-all text-xs text-ink-soft">{profileUrl}</p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={downloadVcf}
                className="inline-flex items-center gap-1.5 rounded-pill bg-brand-gradient px-4 py-2 text-sm font-bold text-white shadow-lift active:scale-[0.98]"
              >
                <Icon name="account" size={15} />
                Save contact
              </button>
              {profileUrl && <CopyButton text={profileUrl} label="Copy profile link" />}
              {handle && <CopyButton text={`@${handle}`} label="Copy handle" />}
            </div>
            {!handle && (
              <p className="mt-3 text-xs text-ink-faint">
                Pick a handle in Edit profile to get a link people can open.
              </p>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-pill px-4 text-sm font-semibold text-ink-faint hover:bg-cream hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              Close
            </button>
        </Dialog>
      ) : null}
    </>
  );
}
