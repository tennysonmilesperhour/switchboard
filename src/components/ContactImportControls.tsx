'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  canPickContacts,
  pickContacts,
  readVCardFile,
} from '@/lib/client/contact-picker';
import type { ContactCandidate } from '@/lib/actions/connections';

/**
 * Contact-import controls that work in every browser.
 *
 * The native Contact Picker API (`navigator.contacts`) only exists in
 * Chrome/Edge on Android, so on desktop Safari/Chrome and iOS Safari the picker
 * button used to render permanently disabled. This component always offers a
 * "Upload contacts file (.vcf)" path — a vCard exported from the user's phone,
 * email, or Contacts app — and additionally shows the one-tap native picker
 * when the browser supports it. Both paths resolve to `ContactCandidate[]` and
 * are handed back through `onContacts`, so callers keep their existing matching
 * and rendering logic unchanged.
 */
export function ContactImportControls({
  onContacts,
  busy = false,
  disabled = false,
  pickLabel = 'Choose contacts',
  fileLabel = 'Upload contacts (.vcf)',
}: {
  onContacts: (contacts: ContactCandidate[]) => void | Promise<void>;
  busy?: boolean;
  disabled?: boolean;
  pickLabel?: string;
  fileLabel?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Deferred a tick so the server render (which can't detect the API) and the
  // first client render agree — avoids a hydration mismatch on the button set.
  useEffect(() => {
    const timeout = window.setTimeout(() => setSupported(canPickContacts()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function handlePick() {
    setError(null);
    try {
      const contacts = await pickContacts();
      if (contacts.length > 0) await onContacts(contacts);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not open contacts on this device.',
      );
    }
  }

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset the input so selecting the same file again still fires `change`.
    event.target.value = '';
    if (files.length === 0) return;
    setError(null);
    try {
      const parsed = (await Promise.all(files.map((file) => readVCardFile(file)))).flat();
      if (parsed.length === 0) {
        setError(
          'No contacts found in that file. Export a vCard (.vcf) from your phone, email, or Contacts app and try again.',
        );
        return;
      }
      await onContacts(parsed);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not read that contacts file.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {supported && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || busy}
            onClick={handlePick}
            title="Choose contacts to match on Switchboard"
          >
            <Icon name="users" size={16} />
            {busy ? 'Checking contacts' : pickLabel}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          title="Import contacts from a vCard (.vcf) file exported from your phone, email, or Contacts app"
        >
          <Icon name="upload" size={16} />
          {fileLabel}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".vcf,text/vcard,text/x-vcard,text/directory"
          multiple
          className="hidden"
          onChange={handleFiles}
          aria-hidden
          tabIndex={-1}
        />
      </div>
      {!supported && (
        <span className="text-xs text-ink-faint">
          On a desktop browser, export a contact card (.vcf) from your phone,
          email, or Contacts app and upload it here.
        </span>
      )}
      {error && (
        <span role="alert" className="text-xs text-rose-deep">
          {error}
        </span>
      )}
    </div>
  );
}
