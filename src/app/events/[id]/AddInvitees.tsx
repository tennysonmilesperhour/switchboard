'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { addPeopleToEvent } from '@/lib/actions/events';
import { canPickContacts, pickContacts } from '@/lib/client/contact-picker';
import { resolveContactMatches, type ContactMatch } from '@/lib/actions/connections';

export interface ConnectionOption {
  id: string;
  name: string;
  handle: string;
}

/**
 * Host/co-host panel to append more people to a live cascade. Add anyone by
 * handle, email, phone, or name — or tap friends straight from your people.
 * Everyone added joins the back of the line.
 */
export function AddInvitees({
  eventId,
  connections,
}: {
  eventId: string;
  connections: ConnectionOption[];
}) {
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [contactsSupported, setContactsSupported] = useState(false);
  const [contactsBusy, setContactsBusy] = useState(false);
  const [contactMatches, setContactMatches] = useState<ContactMatch[]>([]);
  const [contactsNote, setContactsNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const totalToAdd = entries.length + selected.length + (text.trim() ? 1 : 0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setContactsSupported(canPickContacts()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const availableConnections = useMemo(
    () => connections.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [connections],
  );

  function stage(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setError(null);
    setEntries((current) => (current.includes(value) ? current : [...current, value]));
    setText('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      stage(text);
    } else if (e.key === 'Backspace' && !text && entries.length > 0) {
      setEntries((current) => current.slice(0, -1));
    }
  }

  function toggleConnection(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  // A matched contact resolves to a profile (invite in app) or, failing that, a
  // textable phone/email guest. Name-only contacts with no account can't be
  // invited, so they're dropped.
  function inviteTargetFor(match: ContactMatch) {
    if (match.profile) return { profileId: match.profile.id, contact: null as string | null };
    const contact = match.smsTarget ?? match.identifier ?? null;
    if (!contact) return null;
    return { profileId: null as string | null, contact };
  }

  function isMatchSelected(match: ContactMatch) {
    const target = inviteTargetFor(match);
    if (!target) return false;
    return target.profileId
      ? selected.includes(target.profileId)
      : entries.includes(target.contact!);
  }

  function toggleContactMatch(match: ContactMatch) {
    const target = inviteTargetFor(match);
    if (!target) return;
    if (target.profileId) {
      toggleConnection(target.profileId);
    } else {
      const contact = target.contact!;
      setEntries((current) =>
        current.includes(contact)
          ? current.filter((x) => x !== contact)
          : [...current, contact],
      );
    }
  }

  async function matchContactsFromDevice() {
    setContactsBusy(true);
    setError(null);
    setContactsNote(null);
    try {
      const contacts = await pickContacts();
      if (contacts.length === 0) return;
      const matches = await resolveContactMatches(contacts);
      const invitable = matches
        .filter((match) => match.connectionStatus !== 'self')
        .filter((match) => Boolean(inviteTargetFor(match)))
        .sort((a, b) => Number(Boolean(b.profile)) - Number(Boolean(a.profile)));
      setContactMatches(invitable);
      const onApp = invitable.filter((match) => match.profile).length;
      setContactsNote(
        invitable.length === 0
          ? 'None of those contacts can be added yet — no matching accounts or numbers.'
          : onApp === 0
            ? `${invitable.length} ${invitable.length === 1 ? 'contact' : 'contacts'} can be added by text.`
            : `${onApp} on Switchboard${
                invitable.length - onApp > 0 ? `, ${invitable.length - onApp} by text` : ''
              }. Tap to add them.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not open contacts on this device.',
      );
    } finally {
      setContactsBusy(false);
    }
  }

  function submit() {
    const staged = text.trim() ? [...entries, text.trim()] : entries;
    if (staged.length === 0 && selected.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await addPeopleToEvent(eventId, {
        entries: staged,
        profileIds: selected,
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not add people.');
        return;
      }
      setText('');
      setEntries([]);
      setSelected([]);
      const added = result.added ?? 0;
      toast.success(
        `Added ${added} ${added === 1 ? 'person' : 'people'} to the flow.`,
      );
      if (result.skipped && result.skipped.length > 0) {
        setError(
          `Skipped ${result.skipped.map((s) => `${s.entry} (${s.reason})`).join(', ')}.`,
        );
      }
      router.refresh();
    });
  }

  return (
    <section className="border-t border-line pt-5">
      <h2 className="font-display text-xl text-ink">Add people</h2>
      <p className="text-sm text-ink-faint mt-0.5 mb-3">
        Add anyone by <strong>@handle</strong>, email, phone, or name — or tap a
        friend below. They join the back of the line and go out when it’s their
        turn.
      </p>

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {entries.map((entry) => (
            <Chip
              key={entry}
              selected
              onClick={() => setEntries((c) => c.filter((x) => x !== entry))}
            >
              {entry} ✕
            </Chip>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => stage(text)}
          placeholder="@handle, email, phone, or name"
          aria-label="Add someone by handle, email, phone, or name"
          className="flex-1 rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending || totalToAdd === 0}
          onClick={submit}
        >
          {totalToAdd > 0 ? `Add ${totalToAdd}` : 'Add'}
        </Button>
      </div>

      {availableConnections.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2">
            From your people
          </p>
          <div className="flex flex-wrap gap-2">
            {availableConnections.map((connection) => (
              <Chip
                key={connection.id}
                selected={selected.includes(connection.id)}
                disabled={pending}
                onClick={() => toggleConnection(connection.id)}
              >
                {connection.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!contactsSupported || contactsBusy || pending}
            onClick={matchContactsFromDevice}
            title={
              contactsSupported
                ? 'Match your contacts against Switchboard'
                : 'Contact access is not available in this browser'
            }
          >
            <Icon name="users" size={16} />
            {contactsBusy ? 'Checking contacts' : 'From my contacts'}
          </Button>
          {!contactsSupported && (
            <span className="text-xs text-ink-faint">
              Contact access works only in supported mobile browsers.
            </span>
          )}
        </div>
        {contactsNote && (
          <p role="status" className="text-xs text-ink-soft mt-2">
            {contactsNote}
          </p>
        )}
        {contactMatches.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {contactMatches.map((match) => (
              <Chip
                key={match.key}
                selected={isMatchSelected(match)}
                disabled={pending}
                onClick={() => toggleContactMatch(match)}
              >
                {match.profile?.name ?? match.name}
                {match.profile ? ' · in app' : ' · by text'}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-deep mt-2.5">{error}</p>}
    </section>
  );
}
