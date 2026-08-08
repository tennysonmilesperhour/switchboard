'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { ShareButton } from '@/components/ui/ShareButton';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  acceptConnection,
  blockProfile,
  createCircle,
  deleteCircle,
  giveSpace,
  removeConnection,
  renameCircle,
  reportProfile,
  resendConnectionRequest,
  resolveContactMatches,
  sendConnectionRequest,
  stopGivingSpace,
  toggleCircleMember,
  type ContactCandidate,
  type ContactMatch,
} from '@/lib/actions/connections';
import { proposeIntroduction } from '@/lib/actions/matchmaker';
import { createHousehold, deleteHousehold } from '@/lib/actions/households';
import { ACTIVITY_PRESETS } from '@/lib/types';
import { ContactImportControls } from '@/components/ContactImportControls';

export interface FriendRow {
  connectionId: string;
  id: string;
  name: string;
  handle: string;
  circleIds: string[];
  isAvoided: boolean;
}

export interface RequestRow {
  connectionId: string;
  id: string;
  name: string;
  handle: string;
}

export interface CircleRow {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
}

export interface HouseholdRow {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
}

export function PeopleClient({
  friends,
  incoming,
  outgoing,
  circles,
  households = [],
  inviteUrl,
}: {
  friends: FriendRow[];
  incoming: RequestRow[];
  outgoing: RequestRow[];
  circles: CircleRow[];
  households?: HouseholdRow[];
  /** Absolute link to Switchboard itself, from `appInviteUrl()` on the server. */
  inviteUrl: string;
}) {
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [contactMatches, setContactMatches] = useState<ContactMatch[]>([]);
  const [contactsBusy, setContactsBusy] = useState(false);
  const [expandedFriend, setExpandedFriend] = useState<string | null>(null);
  const [expandedCircle, setExpandedCircle] = useState<string | null>(null);
  const [circleEmoji, setCircleEmoji] = useState('✨');
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [newCircle, setNewCircle] = useState('');
  const [matchA, setMatchA] = useState('');
  const [matchB, setMatchB] = useState('');
  const [matchActivity, setMatchActivity] = useState('Coffee');
  const [matchNote, setMatchNote] = useState('');
  const [matchStatus, setMatchStatus] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [householdMembers, setHouseholdMembers] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  async function removeFriend(friend: FriendRow) {
    const ok = await confirm({
      title: `Remove ${friend.name}?`,
      body: 'You’ll disconnect from each other. You can always reconnect later by handle.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await removeConnection(friend.connectionId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not remove that connection.', result.code);
        return;
      }
      router.refresh();
    });
  }

  async function blockFriend(friend: FriendRow) {
    const ok = await confirm({
      title: `Block ${friend.name}?`,
      body: 'They will be removed from your connections and will not be able to reconnect with you.',
      confirmLabel: 'Block',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await blockProfile(friend.id, friend.connectionId);
      if (!result.ok) return toast.error(result.error ?? 'Could not block that person.', result.code);
      router.refresh();
    });
  }

  function toggleGiveSpace(friend: FriendRow) {
    startTransition(async () => {
      const result = friend.isAvoided
        ? await stopGivingSpace(friend.id)
        : await giveSpace(friend.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update. Try again.', result.code);
        return;
      }
      toast.success(
        friend.isAvoided
          ? `Space warnings about ${friend.name} are off.`
          : `You’ll get a quiet heads-up if ${friend.name} is somewhere you’re headed. They’re never told.`,
      );
      router.refresh();
    });
  }

  async function reportFriend(friend: FriendRow) {
    const reason = window.prompt(`Briefly describe why you are reporting ${friend.name}.`);
    if (!reason) return;
    startTransition(async () => {
      const result = await reportProfile(friend.id, reason);
      if (!result.ok) return toast.error(result.error ?? 'Could not send the report.', result.code);
      toast.success('Report received.');
    });
  }

  async function removeHousehold(household: HouseholdRow) {
    const ok = await confirm({
      title: `Delete ${household.name}?`,
      body: 'This removes the household group. The people in it stay your friends.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteHousehold(household.id);
        router.refresh();
      } catch {
        toast.error('Could not delete the household. Try again.');
      }
    });
  }

  function toggleCircleOpen(circle: CircleRow) {
    if (expandedCircle === circle.id) {
      setExpandedCircle(null);
      return;
    }
    // Seed the inline editor with the circle's current name/emoji.
    setExpandedCircle(circle.id);
    setEditName(circle.name);
    setEditEmoji(circle.emoji);
  }

  function setCircleMembership(circleId: string, friendId: string, add: boolean) {
    startTransition(async () => {
      const result = await toggleCircleMember(circleId, friendId, add);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update circle.', result.code);
        return;
      }
      router.refresh();
    });
  }

  function saveCircleName(circle: CircleRow) {
    const name = editName.trim();
    if (!name || (name === circle.name && editEmoji.trim() === circle.emoji)) return;
    startTransition(async () => {
      const result = await renameCircle(circle.id, name, editEmoji.trim() || undefined);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not rename the circle.', result.code);
        return;
      }
      router.refresh();
    });
  }

  async function removeCircle(circle: CircleRow) {
    const ok = await confirm({
      title: `Delete “${circle.name}”?`,
      body: 'The circle is removed. Everyone in it stays your friend - only this grouping goes away.',
      confirmLabel: 'Delete circle',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteCircle(circle.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not delete the circle.', result.code);
        return;
      }
      setExpandedCircle(null);
      router.refresh();
    });
  }

  function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    const value = identifier;
    startTransition(async () => {
      const result = await sendConnectionRequest(value);
      setMessage(
        result.ok
          ? { tone: 'ok', text: 'Request sent.' }
          : { tone: 'error', text: result.error ?? 'Something went wrong' },
      );
      if (result.ok) setIdentifier('');
      router.refresh();
    });
  }

  async function importContacts(contacts: ContactCandidate[]) {
    setContactsBusy(true);
    setMessage(null);
    try {
      const matches = await resolveContactMatches(contacts);
      setContactMatches(matches);
      const matchCount = matches.filter((match) => match.profile).length;
      setMessage({
        tone: 'ok',
        text:
          matchCount === 0
            ? // Same caveat as a single lookup: a contact only matches on an
              // email or phone its owner verified, so "no matches" is not the
              // same as "none of these people are here".
              'No contacts matched — that only finds people who verified that email or phone. Add them by @handle, or invite them below.'
            : `${matchCount} ${matchCount === 1 ? 'contact is' : 'contacts are'} on Switchboard.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not open contacts on this device.',
      });
    } finally {
      setContactsBusy(false);
    }
  }

  function quickConnect(match: ContactMatch) {
    const profile = match.profile;
    if (!profile) return;
    startTransition(async () => {
      const result = await sendConnectionRequest(`@${profile.handle}`);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not send that request.', result.code);
        return;
      }
      toast.success(`Request sent to ${profile.name}.`);
      router.refresh();
    });
  }

  function resendOutgoing(request: RequestRow) {
    startTransition(async () => {
      const result = await resendConnectionRequest(request.connectionId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not resend. Try again.', result.code);
        return;
      }
      toast.success(`Nudged ${request.name.split(' ')[0]} again.`);
      router.refresh();
    });
  }

  function cancelOutgoing(request: RequestRow) {
    startTransition(async () => {
      const result = await removeConnection(request.connectionId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not cancel. Try again.', result.code);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {/* Add someone */}
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

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <section>
          <SectionHeader title="Wants to connect" />
          <div className="space-y-2">
            {incoming.map((request) => (
              <Card key={request.connectionId} tone="gold">
                <div className="flex items-center gap-3">
                  <Avatar name={request.name} seed={request.id} size="sm" />
                  <span className="flex-1">
                    <span className="font-bold block">{request.name}</span>
                    <span className="text-xs text-ink-faint">@{request.handle}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="accept"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await acceptConnection(request.connectionId);
                        if (!result.ok) {
                          toast.error(result.error ?? 'Could not accept. Try again.', result.code);
                          return;
                        }
                        router.refresh();
                      })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await removeConnection(request.connectionId);
                        if (!result.ok) {
                          toast.error(result.error ?? 'Could not update. Try again.', result.code);
                          return;
                        }
                        router.refresh();
                      })
                    }
                  >
                    Ignore
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Friends */}
      {friends.length > 0 && (
        <section>
          <SectionHeader
            title={`Friends · ${friends.length}`}
            hint="Tap a friend to sort them into circles"
          />
          <div className="space-y-2">
            {friends.map((friend) => {
              const expanded = expandedFriend === friend.id;
              return (
                <Card key={friend.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    aria-expanded={expanded}
                    onClick={() => setExpandedFriend(expanded ? null : friend.id)}
                  >
                    <Avatar name={friend.name} seed={friend.id} size="sm" />
                    <span className="flex-1">
                      <span className="font-bold block">{friend.name}</span>
                      <span className="text-xs text-ink-faint">
                        @{friend.handle}
                        {friend.circleIds.length > 0 &&
                          ` · ${friend.circleIds
                            .map((id) => circles.find((c) => c.id === id)?.emoji ?? '')
                            .join(' ')}`}
                      </span>
                    </span>
                    <Icon
                      name="back"
                      size={18}
                      className={`text-ink-faint transition-transform ${expanded ? 'rotate-90' : '-rotate-90'}`}
                    />

                  </button>
                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-line animate-rise">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2.5">
                        Circles
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {circles.map((circle) => {
                          const inCircle = friend.circleIds.includes(circle.id);
                          return (
                            <Chip
                              key={circle.id}
                              emoji={circle.emoji}
                              selected={inCircle}
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () => {
                                  const result = await toggleCircleMember(
                                    circle.id,
                                    friend.id,
                                    !inCircle,
                                  );
                                  if (!result.ok) {
                                    toast.error(result.error ?? 'Could not update circle.', result.code);
                                    return;
                                  }
                                  router.refresh();
                                })
                              }
                            >
                              {circle.name}
                            </Chip>
                          );
                        })}
                      </div>
                      <div className="mt-4 pt-3 border-t border-line">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => toggleGiveSpace(friend)}
                          className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                            friend.isAvoided
                              ? 'bg-gold-soft text-gold-deep'
                              : 'text-ink-faint hover:text-ink'
                          }`}
                        >
                          <Icon name={friend.isAvoided ? 'check' : 'bell'} size={14} />
                          {friend.isAvoided ? 'Giving space' : 'Give space'}
                        </button>
                        <p className="mt-1 text-[11px] leading-snug text-ink-faint">
                          {friend.isAvoided
                            ? `We’ll quietly warn you if ${friend.name.split(' ')[0]} is somewhere you’re headed. They’re never told.`
                            : 'A private heads-up before events where they’ll be - no block, and they’re never notified.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => removeFriend(friend)}
                        className="inline-flex items-center gap-1 rounded-pill px-1 py-1 text-xs font-semibold text-ink-faint hover:text-rose-deep mt-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        <Icon name="close" size={14} />
                        Remove connection
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => reportFriend(friend)}
                        className="ml-3 rounded-pill px-1 py-1 text-xs font-semibold text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        Report
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => blockFriend(friend)}
                        className="ml-3 rounded-pill px-1 py-1 text-xs font-semibold text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        Block
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Outgoing */}
      {outgoing.length > 0 && (
        <section>
          <SectionHeader
            title="Waiting to hear back"
            hint="Nudge someone who hasn’t responded, or cancel the request"
          />
          <ul className="space-y-1.5">
            {outgoing.map((request) => (
              <li
                key={request.connectionId}
                className="flex items-center gap-3 rounded-card bg-cream px-3.5 py-2.5 text-sm"
              >
                <span className="flex-1 min-w-0">
                  <strong>{request.name}</strong>{' '}
                  <span className="text-ink-faint">@{request.handle}</span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  className="shrink-0 rounded-pill px-2 py-1 text-xs font-semibold text-terracotta-deep hover:text-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                  onClick={() => resendOutgoing(request)}
                >
                  Resend
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="shrink-0 rounded-pill px-2 py-1 text-xs text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                  onClick={() => cancelOutgoing(request)}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Friendly empty state */}
      {friends.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
        <EmptyState
          emoji="👋"
          title="Your people live here"
          body="Add a friend above. Once you're connected you can sort them into circles and quietly play matchmaker."
        />
      )}

      {/* Households */}
      {friends.length > 0 && (
        <section>
          <SectionHeader
            title="Households 🏡"
            hint="Invite a whole family or roommate crew with one tap"
          />
          {households.length > 0 && (
            <div className="space-y-2 mb-3">
              {households.map((household) => (
                <div
                  key={household.id}
                  className="flex items-center gap-3 rounded-card bg-cream px-3.5 py-3 text-sm"
                >
                  <span className="text-lg" aria-hidden>{household.emoji}</span>
                  <span className="font-bold flex-1">{household.name}</span>
                  <span className="text-xs text-ink-faint">
                    {household.memberCount} {household.memberCount === 1 ? 'person' : 'people'}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-pill px-2 py-1 text-xs text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    onClick={() => removeHousehold(household)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <Card>
            <div className="space-y-2.5">
              <input
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="Household name (The Riveras, Lake House Crew…)"
                aria-label="Household name"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              <div className="flex flex-wrap gap-2">
                {friends.map((friend) => {
                  const selected = householdMembers.includes(friend.id);
                  return (
                    <Chip
                      key={friend.id}
                      selected={selected}
                      onClick={() =>
                        setHouseholdMembers((current) =>
                          selected
                            ? current.filter((id) => id !== friend.id)
                            : [...current, friend.id],
                        )
                      }
                    >
                      {friend.name.split(' ')[0]}
                    </Chip>
                  );
                })}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={pending || !householdName.trim() || householdMembers.length === 0}
                onClick={() =>
                  startTransition(async () => {
                    const result = await createHousehold(householdName, householdMembers);
                    if (!result.ok) {
                      toast.error(result.error ?? 'Could not create the household.', result.code);
                      return;
                    }
                    setHouseholdName('');
                    setHouseholdMembers([]);
                    router.refresh();
                    toast.success('Household created.');
                  })
                }
              >
                Create household
              </Button>
            </div>
          </Card>
        </section>
      )}

      {/* Matchmaker */}
      {friends.length >= 2 && (
        <section>
          <SectionHeader
            title="Play matchmaker 🤝"
            hint="Introduce two friends. Revealed only if they both say yes."
          />
          <Card>
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <select
                  value={matchA}
                  onChange={(e) => setMatchA(e.target.value)}
                  aria-label="First friend"
                  className="flex-1 rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                >
                  <option value="">First friend</option>
                  {friends.map((friend) => (
                    <option key={friend.id} value={friend.id} disabled={friend.id === matchB}>
                      {friend.name}
                    </option>
                  ))}
                </select>
                <select
                  value={matchB}
                  onChange={(e) => setMatchB(e.target.value)}
                  aria-label="Second friend"
                  className="flex-1 rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                >
                  <option value="">Second friend</option>
                  {friends.map((friend) => (
                    <option key={friend.id} value={friend.id} disabled={friend.id === matchA}>
                      {friend.name}
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={matchActivity}
                onChange={(e) => setMatchActivity(e.target.value)}
                aria-label="Suggested activity"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              >
                {ACTIVITY_PRESETS.map((activity) => (
                  <option key={activity.label} value={activity.label}>
                    {activity.emoji} {activity.label}
                  </option>
                ))}
              </select>
              <input
                value={matchNote}
                onChange={(e) => setMatchNote(e.target.value)}
                maxLength={140}
                placeholder="Why they'd hit it off (they'll both see this)"
                aria-label="Matchmaker note"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              {matchStatus && (
                <p className="text-xs text-sage-deep" role="status">{matchStatus}</p>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={pending || !matchA || !matchB}
                onClick={() =>
                  startTransition(async () => {
                    const result = await proposeIntroduction(
                      matchA,
                      matchB,
                      matchActivity,
                      matchNote,
                    );
                    if (result.ok) {
                      setMatchStatus('Introduction sent, quietly. 🤫');
                      setMatchA('');
                      setMatchB('');
                      setMatchNote('');
                    } else {
                      setMatchStatus(result.error ?? 'Something went wrong');
                    }
                    router.refresh();
                  })
                }
              >
                Suggest they meet
              </Button>
              <p className="text-xs text-ink-faint">
                Neither friend learns who the other is unless both are curious.
                A no is invisible to everyone, including you.
              </p>
            </div>
          </Card>
        </section>
      )}

      {/* Circles */}
      <section>
        <SectionHeader
          title="Your circles"
          hint="Private groupings, reused everywhere you choose an audience. Tap one to see and add people."
        />
        {circles.length === 0 ? (
          <Card tone="cream">
            <p className="text-sm text-ink-soft leading-relaxed">
              Circles are your own private groupings - Close Friends, Book Club,
              Neighbors. Nobody sees them but you. Make your first one below, then
              tap it to add people.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {circles.map((circle) => {
              const members = friends.filter((f) => f.circleIds.includes(circle.id));
              const available = friends.filter((f) => !f.circleIds.includes(circle.id));
              const expanded = expandedCircle === circle.id;
              return (
                <Card key={circle.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    aria-expanded={expanded}
                    onClick={() => toggleCircleOpen(circle)}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cream text-lg" aria-hidden>
                      {circle.emoji}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-bold block truncate">{circle.name}</span>
                      <span className="text-xs text-ink-faint">
                        {members.length} {members.length === 1 ? 'person' : 'people'}
                      </span>
                    </span>
                    <Icon
                      name="back"
                      size={18}
                      className={`text-ink-faint transition-transform ${expanded ? 'rotate-90' : '-rotate-90'}`}
                    />
                  </button>

                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-line animate-rise space-y-4">
                      {/* Who's in it */}
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2">
                          In this circle
                        </p>
                        {members.length === 0 ? (
                          <p className="text-sm text-ink-faint">
                            No one yet - add people below.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {members.map((member) => (
                              <li key={member.id} className="flex items-center gap-2.5">
                                <Avatar name={member.name} seed={member.id} size="sm" />
                                <span className="flex-1 min-w-0">
                                  <span className="text-sm font-semibold block truncate">
                                    {member.name}
                                  </span>
                                  <span className="text-xs text-ink-faint">@{member.handle}</span>
                                </span>
                                <button
                                  type="button"
                                  disabled={pending}
                                  aria-label={`Remove ${member.name} from ${circle.name}`}
                                  onClick={() => setCircleMembership(circle.id, member.id, false)}
                                  className="shrink-0 rounded-full p-1 text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                                >
                                  <Icon name="close" size={16} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Add people */}
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2">
                          Add people
                        </p>
                        {friends.length === 0 ? (
                          <p className="text-sm text-ink-faint">
                            Connect with people first - then you can sort them in here.
                          </p>
                        ) : available.length === 0 ? (
                          <p className="text-sm text-ink-faint">
                            Everyone you’re connected with is already in this circle.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {available.map((friend) => (
                              <Chip
                                key={friend.id}
                                emoji="+"
                                disabled={pending}
                                onClick={() => setCircleMembership(circle.id, friend.id, true)}
                              >
                                {friend.name.split(' ')[0]}
                              </Chip>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Rename / delete */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <input
                          value={expanded ? editEmoji : circle.emoji}
                          onChange={(e) => setEditEmoji(e.target.value)}
                          aria-label={`Emoji for ${circle.name}`}
                          maxLength={4}
                          className="w-12 rounded-card border border-line bg-paper px-2 py-2 text-center text-base outline-none focus:border-terracotta"
                        />
                        <input
                          value={expanded ? editName : circle.name}
                          onChange={(e) => setEditName(e.target.value)}
                          aria-label={`Rename ${circle.name}`}
                          maxLength={40}
                          className="flex-1 min-w-0 rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={
                            pending ||
                            !editName.trim() ||
                            (editName.trim() === circle.name && editEmoji.trim() === circle.emoji)
                          }
                          onClick={() => saveCircleName(circle)}
                        >
                          Save
                        </Button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => removeCircle(circle)}
                          className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-xs font-semibold text-rose-deep hover:text-rose-deep/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                        >
                          <Icon name="trash" size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
        <form
          className="flex gap-2 mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newCircle;
            startTransition(async () => {
              const result = await createCircle(name, circleEmoji);
              if (!result.ok) {
                toast.error(result.error ?? 'Could not create the circle.', result.code);
                return;
              }
              setNewCircle('');
              setCircleEmoji('✨');
              router.refresh();
            });
          }}
        >
          <input
            value={circleEmoji}
            onChange={(e) => setCircleEmoji(e.target.value)}
            aria-label="New circle emoji"
            maxLength={4}
            className="w-12 rounded-pill border border-line bg-card px-2 py-2.5 text-center text-base outline-none focus:border-terracotta"
          />
          <input
            value={newCircle}
            onChange={(e) => setNewCircle(e.target.value)}
            placeholder="New circle (e.g. Book Club)"
            aria-label="New circle name"
            className="flex-1 min-w-0 rounded-pill border border-line bg-card px-4 py-2.5 text-sm outline-none focus:border-terracotta"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={pending || !newCircle.trim()}>
            Add
          </Button>
        </form>
      </section>
    </div>
  );
}
