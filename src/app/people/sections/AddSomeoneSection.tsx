'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SectionHeader } from '@/components/ui/Card';
import { ShareButton } from '@/components/ui/ShareButton';
import { ContactImportControls } from '@/components/ContactImportControls';
import type { ContactCandidate, ContactMatch } from '@/lib/actions/connections';
import type { PeopleMessage } from './types';

interface AddSomeoneSectionProps {
  identifier: string;
  setIdentifier: Dispatch<SetStateAction<string>>;
  submitRequest: (event: FormEvent) => void;
  pending: boolean;
  importContacts: (contacts: ContactCandidate[]) => Promise<void>;
  contactsBusy: boolean;
  message: PeopleMessage | null;
  inviteUrl: string;
  contactMatches: ContactMatch[];
  quickConnect: (match: ContactMatch) => void;
}

export function AddSomeoneSection({
  identifier,
  setIdentifier,
  submitRequest,
  pending,
  importContacts,
  contactsBusy,
  message,
  inviteUrl,
  contactMatches,
  quickConnect,
}: AddSomeoneSectionProps) {
  return (
      <section>
        <SectionHeader
          title="Add someone"
          hint="Find friends by handle, email, phone, or selected contacts"
        />
        <form onSubmit={submitRequest} className="flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 items-center flex-1 rounded-pill border border-line bg-card focus-within:border-terracotta">
            <Icon name="search" size={17} className="ml-4 shrink-0 text-ink-faint" />
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="@handle, email, or phone"
              aria-label="Friend's handle, email, or phone"
              className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-sm outline-none"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending || !identifier.trim()}>
            Connect
          </Button>
        </form>
        <div className="mt-2">
          <ContactImportControls
            onContacts={importContacts}
            busy={contactsBusy}
            disabled={pending}
            pickLabel="Choose contacts"
            fileLabel="Upload contacts (.vcf)"
          />
        </div>
        {message && (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={`text-sm mt-2 ${message.tone === 'error' ? 'text-rose-deep' : 'text-sage-deep'}`}
          >
            {message.text}
          </p>
        )}

        {/*
          Sits here permanently rather than appearing only after a failed
          lookup. Searching for someone who turns out not to have an account is
          the moment people hit this — "No Switchboard account matched" lands
          directly above it — but wanting to send a friend the app is a perfectly
          ordinary thing to want before searching for them at all, and the only
          answer the app used to have was to invent a plan and invite them to it.
        */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card bg-cream px-3.5 py-3">
          <p className="min-w-0 flex-1 text-sm text-ink-soft">
            <span className="block font-bold text-ink">Not on Switchboard yet?</span>
            Send them the app itself. It’s just a link — no plan attached, nothing
            to RSVP to.
          </p>
          <ShareButton
            url={inviteUrl}
            title="Switchboard"
            text="Come find me on Switchboard - it's how I'm making plans with people now."
            label="Share the app"
            className="shrink-0"
          />
        </div>
        {contactMatches.length > 0 && (
          <div className="mt-3 space-y-2">
            {contactMatches.map((match) => (
              <div
                key={match.key}
                className="flex items-center gap-3 rounded-card border border-line bg-card px-3.5 py-3 text-sm"
              >
                <Avatar
                  name={match.profile?.name ?? match.name}
                  seed={match.profile?.id ?? match.key}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {match.profile?.name ?? match.name}
                  </span>
                  <span className="block truncate text-xs text-ink-faint">
                    {match.profile
                      ? `@${match.profile.handle} matched by ${match.kind.replace('_', ' ')}`
                      : match.smsTarget
                        ? 'Not on Switchboard yet, can receive plan invites by text'
                        : 'No Switchboard account found'}
                  </span>
                </span>
                {match.profile && match.connectionStatus === 'none' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => quickConnect(match)}
                  >
                    Add
                  </Button>
                )}
                {match.profile && match.connectionStatus !== 'none' && (
                  <span className="rounded-pill bg-cream px-2.5 py-1 text-xs font-bold text-ink-soft">
                    {match.connectionStatus === 'accepted'
                      ? 'Friend'
                      : match.connectionStatus === 'incoming'
                        ? 'Pending'
                        : 'Sent'}
                  </span>
                )}
                {/*
                  This used to be a link to /events/new: "invite" a contact who
                  isn't on Switchboard and the app sent you off to build a plan
                  first, because a plan invite was the only link it could make.
                  Hand over the app instead — the share sheet opens on the same
                  contact they were just looking at.
                */}
                {!match.profile && (
                  <ShareButton
                    url={inviteUrl}
                    title="Switchboard"
                    text="Come find me on Switchboard - it's how I'm making plans with people now."
                    label="Invite"
                    className="shrink-0 !px-2.5 !py-1 !shadow-none"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
  );
}
