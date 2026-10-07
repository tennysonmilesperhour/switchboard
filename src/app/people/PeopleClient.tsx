'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useConfirm, usePrompt } from '@/components/ui/ConfirmDialog';
import {
  acceptConnection,
  blockProfile,
  createCircle,
  deleteCircle,
  giveSpace,
  ignoreConnectionRequest,
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
import {
  createHousehold,
  deleteHousehold,
  updateHouseholdMembers,
} from '@/lib/actions/households';
import { AddSomeoneSection } from './sections/AddSomeoneSection';
import { IncomingRequestsSection } from './sections/IncomingRequestsSection';
import { FriendsSection } from './sections/FriendsSection';
import { OutgoingRequestsSection } from './sections/OutgoingRequestsSection';
import { HouseholdsSection } from './sections/HouseholdsSection';
import { MatchmakerSection } from './sections/MatchmakerSection';
import { CirclesSection } from './sections/CirclesSection';
import { GivingSpaceSection } from './sections/GivingSpaceSection';
import type {
  CircleRow,
  FriendRow,
  HouseholdRow,
  PeopleMessage,
  RequestRow,
  SpaceRow,
} from './sections/types';

export function PeopleClient({
  friends,
  incoming,
  outgoing,
  circles,
  households = [],
  givingSpace = [],
  inviteUrl,
  nearby = null,
}: {
  friends: FriendRow[];
  incoming: RequestRow[];
  outgoing: RequestRow[];
  circles: CircleRow[];
  households?: HouseholdRow[];
  /** Everyone the viewer gives space to, friend or not (G35). */
  givingSpace?: SpaceRow[];
  /** Absolute link to Switchboard itself, from `appInviteUrl()` on the server. */
  inviteUrl: string;
  /** Server-rendered "Near you" discovery section, shown under the add form. */
  nearby?: React.ReactNode;
}) {
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState<PeopleMessage | null>(null);
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
  const askReason = usePrompt();

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
      body: 'You’ll stop being connected, and they won’t find you in discovery or on the map or be able to reconnect. They won’t be told.',
      confirmLabel: 'Block',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await blockProfile(friend.id);
      if (!result.ok) return toast.error(result.error ?? 'Could not block that person.', result.code);
      toast.success(`${friend.name} is blocked.`);
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

  function stopSpaceFor(person: SpaceRow) {
    startTransition(async () => {
      const result = await stopGivingSpace(person.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update. Try again.', result.code);
        return;
      }
      toast.success(`You’re no longer giving ${person.name.split(' ')[0]} space.`);
      router.refresh();
    });
  }

  async function saveHouseholdMembers(
    household: HouseholdRow,
    memberIds: string[],
  ): Promise<boolean> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await updateHouseholdMembers(household.id, memberIds);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not update the household.', result.code);
          resolve(false);
          return;
        }
        toast.success(`${household.name} updated.`);
        router.refresh();
        resolve(true);
      });
    });
  }

  async function reportFriend(friend: FriendRow) {
    const reason = await askReason({
      title: `Report ${friend.name}?`,
      body: 'A sentence is plenty. A moderator reads it, and they won’t be told who sent it.',
      confirmLabel: 'Send report',
    });
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
        const result = await deleteHousehold(household.id);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not delete the household. Try again.', result.code);
          return;
        }
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
          ? {
              tone: 'ok',
              text: result.connected
                ? 'You’re connected. They had already asked you.'
                : 'Request sent.',
            }
          : { tone: 'error', text: result.error ?? 'Something went wrong', code: result.code },
      );
      if (result.ok) setIdentifier('');
      router.refresh();
    });
  }

  async function importContacts(contacts: ContactCandidate[]) {
    setContactsBusy(true);
    setMessage(null);
    try {
      const { matches, throttled, error, code } = await resolveContactMatches(contacts);
      setContactMatches(matches);
      // Rate-limited is not "no matches": the unchecked contacts are unknown,
      // and the reader needs to hear that with its code (G7).
      if (throttled || error) {
        setMessage({
          tone: 'error',
          text: error ?? 'Contact lookups are paused for a few minutes.',
          code,
        });
        return;
      }
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
      toast.success(
        result.connected
          ? `You’re connected with ${profile.name}.`
          : `Request sent to ${profile.name}.`,
      );
      setContactMatches((current) =>
        current.map((row) =>
          row.key === match.key
            ? { ...row, connectionStatus: result.connected ? 'accepted' : 'outgoing' }
            : row,
        ),
      );
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

  function acceptRequest(request: RequestRow) {
    startTransition(async () => {
      const result = await acceptConnection(request.connectionId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not accept. Try again.', result.code);
        return;
      }
      router.refresh();
    });
  }

  function ignoreRequest(request: RequestRow) {
    startTransition(async () => {
      const result = await ignoreConnectionRequest(request.connectionId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update. Try again.', result.code);
        return;
      }
      toast.success(
        `Hidden. You won’t see requests from ${request.name.split(' ')[0]} for 90 days. They aren’t told.`,
      );
      router.refresh();
    });
  }

  async function reportRequest(request: RequestRow) {
    const reason = await askReason({
      title: `Report ${request.name}?`,
      body: 'A sentence is plenty. A moderator reads it, and they won’t be told who sent it.',
      confirmLabel: 'Send report',
    });
    if (!reason) return;
    startTransition(async () => {
      const result = await reportProfile(request.id, reason);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not send the report.', result.code);
        return;
      }
      toast.success('Report received.');
    });
  }

  async function blockRequest(request: RequestRow) {
    const ok = await confirm({
      title: `Block ${request.name}?`,
      body: 'You’ll stop being connected, and they won’t find you in discovery or on the map or be able to reconnect. They won’t be told.',
      confirmLabel: 'Block',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await blockProfile(request.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not block that person.', result.code);
        return;
      }
      toast.success(`${request.name} is blocked.`);
      router.refresh();
    });
  }

  function createNewHousehold() {
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
    });
  }

  function submitMatch() {
    startTransition(async () => {
      const result = await proposeIntroduction(matchA, matchB, matchActivity, matchNote);
      if (!result.ok) {
        // A failure used to land in the green "sent" status line, without its
        // code, so a refused intro read as a quiet success.
        setMatchStatus('');
        toast.error(result.error ?? 'Could not send that introduction.', result.code);
        return;
      }
      setMatchStatus('Introduction sent, quietly.');
      setMatchA('');
      setMatchB('');
      setMatchNote('');
      router.refresh();
    });
  }

  function createNewCircle(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createCircle(newCircle, circleEmoji);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not create the circle.', result.code);
        return;
      }
      setNewCircle('');
      setCircleEmoji('✨');
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <AddSomeoneSection
        identifier={identifier} setIdentifier={setIdentifier}
        submitRequest={submitRequest} pending={pending}
        importContacts={importContacts} contactsBusy={contactsBusy}
        message={message} inviteUrl={inviteUrl}
        contactMatches={contactMatches} quickConnect={quickConnect}
      />
      {nearby}
      <IncomingRequestsSection
        incoming={incoming} pending={pending}
        acceptRequest={acceptRequest} ignoreRequest={ignoreRequest}
        reportRequest={reportRequest} blockRequest={blockRequest}
      />
      <FriendsSection
        friends={friends} circles={circles}
        expandedFriend={expandedFriend} setExpandedFriend={setExpandedFriend}
        pending={pending} setCircleMembership={setCircleMembership}
        toggleGiveSpace={toggleGiveSpace} removeFriend={removeFriend}
        reportFriend={reportFriend} blockFriend={blockFriend}
      />
      <OutgoingRequestsSection
        outgoing={outgoing} pending={pending}
        resendOutgoing={resendOutgoing} cancelOutgoing={cancelOutgoing}
      />
      <GivingSpaceSection
        people={givingSpace} pending={pending} stopGivingSpace={stopSpaceFor}
      />
      {friends.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
        <EmptyState
          emoji="👋"
          title="Your people live here"
          body="Add a friend above. Once you're connected you can sort them into circles and quietly play matchmaker."
        />
      )}
      <HouseholdsSection
        friends={friends} households={households} pending={pending}
        householdName={householdName} setHouseholdName={setHouseholdName}
        householdMembers={householdMembers} setHouseholdMembers={setHouseholdMembers}
        removeHousehold={removeHousehold} createNewHousehold={createNewHousehold}
        saveHouseholdMembers={saveHouseholdMembers}
      />
      <MatchmakerSection
        friends={friends} pending={pending}
        matchA={matchA} setMatchA={setMatchA}
        matchB={matchB} setMatchB={setMatchB}
        matchActivity={matchActivity} setMatchActivity={setMatchActivity}
        matchNote={matchNote} setMatchNote={setMatchNote}
        matchStatus={matchStatus} submitMatch={submitMatch}
      />
      <CirclesSection
        circles={circles} friends={friends}
        expandedCircle={expandedCircle} toggleCircleOpen={toggleCircleOpen}
        pending={pending} setCircleMembership={setCircleMembership}
        editEmoji={editEmoji} setEditEmoji={setEditEmoji}
        editName={editName} setEditName={setEditName}
        saveCircleName={saveCircleName} removeCircle={removeCircle}
        circleEmoji={circleEmoji} setCircleEmoji={setCircleEmoji}
        newCircle={newCircle} setNewCircle={setNewCircle}
        createNewCircle={createNewCircle}
      />
    </div>
  );
}
