'use client';

import { Glyph } from '@/components/ui/Glyph';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { addPeopleToEvent, inviteConnectionNow } from '@/lib/actions/events';
import { ContactImportControls } from '@/components/ContactImportControls';
import { InviteeSheet } from '@/components/events/InviteeSheet';
import { SabbaticalNote } from '@/components/profile/SabbaticalNote';
import type { SabbaticalStatus } from '@/lib/sabbatical';
import {
  resolveContactMatches,
  type ContactCandidate,
  type ContactMatch,
} from '@/lib/actions/connections';
import { rememberContactPhones } from '@/lib/client/saved-contact-phones';

export interface ConnectionOption {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  /** Set when they are on sabbatical: their card shows the note (D6). */
  sabbatical?: SabbaticalStatus | null;
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
  const [contactsBusy, setContactsBusy] = useState(false);
  const [contactMatches, setContactMatches] = useState<ContactMatch[]>([]);
  const [contactsNote, setContactsNote] = useState<string | null>(null);
  const [openConnection, setOpenConnection] = useState<ConnectionOption | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const totalToAdd = entries.length + selected.length + (text.trim() ? 1 : 0);

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

  /**
   * Ask this person now, rather than putting them at the back of the line.
   * The invitation lands in their notifications immediately — they're already
   * on Switchboard, so there is nothing to text and nothing to install.
   */
  function sendNow(connection: ConnectionOption) {
    setSendingTo(connection.id);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof inviteConnectionNow>>;
      try {
        result = await inviteConnectionNow(eventId, connection.id);
      } finally {
        // Cleared even when the call throws, or the button sits on "Sending…"
        // for good.
        setSendingTo(null);
      }
      if (!result.ok) {
        toast.error(result.error ?? 'Could not send that invite.', result.code);
        return;
      }
      setOpenConnection(null);
      // They're on the plan now, so drop any staged selection of them; the
      // refresh below re-renders the list without them either way.
      setSelected((current) => current.filter((id) => id !== connection.id));
      toast.success(
        result.warning
          ? `${result.name ?? connection.name} was invited. ${result.warning}`
          : `Invitation sent to ${result.name ?? connection.name}.`,
      );
      router.refresh();
    });
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

  async function matchContactsFromDevice(contacts: ContactCandidate[]) {
    setContactsBusy(true);
    setError(null);
    setContactsNote(null);
    try {
      const { matches, error: lookupError, code } = await resolveContactMatches(contacts);
      rememberContactPhones(matches);
      const invitable = matches
        .filter((match) => match.connectionStatus !== 'self')
        .filter((match) => Boolean(inviteTargetFor(match)))
        .sort((a, b) => Number(Boolean(b.profile)) - Number(Boolean(a.profile)));
      setContactMatches(invitable);
      const onApp = invitable.filter((match) => match.profile).length;
      setContactsNote(
        // A rate-limited lookup is not "no matches": say so, with its code (G7).
        lookupError
          ? `${lookupError}${code ? ` ${code}` : ''}`
          : invitable.length === 0
          ? 'None of those contacts can be added yet - no matching accounts or numbers.'
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
      } else if (result.warning) {
        setError(`${result.warning} Check the invitation flow for delivery details.`);
      }
      router.refresh();
    });
  }

  return (
    <section className="border-t border-line pt-5">
      <h2 className="text-plate text-plate-inset font-display text-xl text-ink">Add people</h2>
      <p className="text-plate text-plate-inset text-sm text-ink-faint mt-0.5 mb-3">
        Add anyone by <strong>@handle</strong>, email, phone, or name - they
        join the back of the line and go out when it’s their turn. Friends
        already on Switchboard are below: tap one to ask them straight away.
      </p>

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {entries.map((entry) => (
            <Chip
              key={entry}
              selected
              onClick={() => setEntries((c) => c.filter((x) => x !== entry))}
            >
              <span className="inline-flex items-center gap-1">{entry}<Glyph emoji="✕" size={12} /></span>
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
          <p className="text-plate text-plate-inset text-xs font-bold uppercase tracking-wide text-ink-faint mb-1">
            From your people
          </p>
          <p className="text-plate text-plate-inset mb-2 text-xs text-ink-faint leading-relaxed">
            Tap someone to ask them right now - the invitation lands in their
            notifications. Or queue them for their turn in the line.
          </p>
          <ul className="space-y-1.5">
            {availableConnections.map((connection) => {
              const queued = selected.includes(connection.id);
              return (
                <li
                  key={connection.id}
                  className="flex items-center gap-2 rounded-card bg-cream px-2.5 py-2"
                >
                  <button
                    type="button"
                    onClick={() => setOpenConnection(connection)}
                    aria-label={`Open ${connection.name}’s card`}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-card text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                  >
                    <Avatar
                      name={connection.name}
                      seed={connection.id}
                      src={connection.avatarUrl}
                      size="sm"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-ink">
                        {connection.name}
                      </span>
                      {connection.sabbatical ? (
                        <span className="block truncate text-xs text-ink-faint">
                          <span className="inline-flex items-center gap-1"><Glyph emoji="🍃" size={12} />On sabbatical</span>
                        </span>
                      ) : connection.handle ? (
                        <span className="block truncate text-xs text-ink-faint">
                          @{connection.handle}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={queued}
                    disabled={pending}
                    onClick={() => toggleConnection(connection.id)}
                    className={`shrink-0 rounded-pill border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                      queued
                        ? 'border-terracotta bg-terracotta text-white'
                        : 'border-line bg-card text-ink-soft hover:border-terracotta hover:text-terracotta-deep'
                    }`}
                  >
                    {queued ? (
                      <span className="inline-flex items-center gap-1">
                        In line
                        <Glyph emoji="✓" size={12} />
                      </span>
                    ) : (
                      'In line'
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <ContactImportControls
          onContacts={matchContactsFromDevice}
          busy={contactsBusy}
          disabled={pending}
          pickLabel="From my contacts"
        />
        {contactsNote && (
          <p role="status" className="text-plate text-plate-inset text-xs text-ink-soft mt-2">
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

      {error && <p className="text-plate text-plate-inset text-xs text-rose-deep mt-2.5">{error}</p>}

      {openConnection && (
        <InviteeSheet
          person={{
            id: openConnection.id,
            name: openConnection.name,
            handle: openConnection.handle || null,
            avatarUrl: openConnection.avatarUrl,
            seed: openConnection.id,
            isGuest: false,
            statusLabel: 'Connected on Switchboard',
            // Nothing off-platform here on purpose: they have an account, so
            // the invitation goes through the app, and their own contact
            // details are theirs to share (see the event page's card notes).
            contact: null,
            inviteUrl: null,
            messages: null,
          }}
          onClose={() => setOpenConnection(null)}
        >
          {openConnection.sabbatical ? (
            <SabbaticalNote
              name={openConnection.name}
              status={openConnection.sabbatical}
              detail="Your invitation will wait in their inbox without a notification, so they may not answer in time."
              className="mb-3"
            />
          ) : null}
          <Button
            type="button"
            className="w-full"
            disabled={pending}
            onClick={() => sendNow(openConnection)}
          >
            {sendingTo === openConnection.id ? 'Sending…' : 'Send invite now'}
          </Button>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            Goes straight to their notifications, ahead of the line. Everyone
            still waiting keeps their place.
          </p>
        </InviteeSheet>
      )}
    </section>
  );
}
