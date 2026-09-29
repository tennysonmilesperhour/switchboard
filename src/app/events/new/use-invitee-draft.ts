'use client';

import { useMemo, useState } from 'react';
import { isEmail } from '@/lib/auth-identity';
import { normalizePhoneNumber } from '@/lib/phone';
import { moveItem } from '@/lib/reorder';
import { sharedWindow, windowForNewInvitee } from '@/lib/engine/windows';
import { lookupInviteeByHandle } from '@/lib/actions/events';
import {
  resolveContactMatches,
  type ContactCandidate,
  type ContactMatch,
} from '@/lib/actions/connections';
import {
  existingTarget,
  likelyDuplicates,
  type DedupeTarget,
  type DuplicateWarning,
} from '@/lib/invitee-dedupe';
import {
  contactMatchSelected,
  inviteTargetFor,
  type DraftInvitee,
  type WizardCircle,
  type WizardFriend,
  type WizardHousehold,
} from './steps/wizard-types';

/**
 * Who is coming, and every way that list can change.
 *
 * Lifted out of `EventWizard` because it is the one part of the wizard with
 * rules of its own rather than a field and a setter: friends toggle, groups
 * toggle as a unit, a handle has to resolve to a real account before it is
 * allowed on, a contact match can arrive as either a profile or a phone
 * number, an address already on the list is refused, and the whole thing is
 * then checked for the same person having come in through two different
 * doors. `EventWizard` keeps the plan's own fields and the step machinery.
 *
 * Everything returned here is what a step needs to draw the list or change
 * it; nothing about dates, privacy, or which step is on screen belongs in it.
 */
export function useInviteeDraft({
  userId,
  friends,
  initialInviteeId,
  suggestedWindowMinutes,
  onError,
}: {
  userId: string;
  friends: WizardFriend[];
  initialInviteeId: string | null;
  /** The response window a freshly added person starts with. */
  suggestedWindowMinutes: number;
  /** Where a failure that is not about one field goes. */
  onError: (message: string | null) => void;
}) {
  // People & order
  const [invitees, setInvitees] = useState<DraftInvitee[]>(() => {
    const preselected = friends.find((f) => f.id === initialInviteeId);
    if (!preselected) return [];
    return [
      {
        key: preselected.id,
        profileId: preselected.id,
        name: preselected.name,
        groupStage: 0,
        windowMinutes: 24 * 60,
      },
    ];
  });
  /**
   * Pairs the host has looked at and called two different people, as
   * `keepKey|dropKey`.
   *
   * A name match is a guess (see `invitee-dedupe`), and a guess that cannot be
   * waved off is worse than no guess at all: two real Sarahs would carry a
   * caution on the list every time the host opened it. Answering it once is
   * enough, and the answer lives only as long as this draft does.
   */
  const [keptDuplicates, setKeptDuplicates] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [guestError, setGuestError] = useState<string | null>(null);
  const [resolvingGuest, setResolvingGuest] = useState(false);
  const [contactsBusy, setContactsBusy] = useState(false);
  const [contactMatches, setContactMatches] = useState<ContactMatch[]>([]);
  const [contactsNote, setContactsNote] = useState<string | null>(null);
  // Long friend lists get long; collapse by default so the group chips and
  // guest box below stay reachable without a marathon scroll.
  const [friendsOpen, setFriendsOpen] = useState(friends.length <= 12);

  function toggleFriend(friend: WizardFriend) {
    setInvitees((current) => {
      const existing = current.find((i) => i.profileId === friend.id);
      if (existing) return current.filter((i) => i.profileId !== friend.id);
      return [
        ...current,
        {
          key: friend.id,
          profileId: friend.id,
          name: friend.name,
          groupStage: 0,
          windowMinutes: newInviteeWindow(current),
        },
      ];
    });
  }

  function toggleGroup(memberIds: string[]) {
    setInvitees((current) => {
      const members = memberIds
        .map((id) => friends.find((f) => f.id === id))
        .filter((f): f is WizardFriend => Boolean(f));
      const allIn =
        members.length > 0 &&
        members.every((m) => current.some((i) => i.profileId === m.id));
      if (allIn) {
        return current.filter(
          (i) => !members.some((m) => m.id === i.profileId),
        );
      }
      const additions = members
        .filter((m) => !current.some((i) => i.profileId === m.id))
        .map((m) => ({
          key: m.id,
          profileId: m.id,
          name: m.name,
          groupStage: 0,
          windowMinutes: newInviteeWindow(current),
        }));
      return [...current, ...additions];
    });
  }

  function toggleHousehold(household: WizardHousehold) {
    toggleGroup(household.memberIds);
  }

  function toggleCircle(circle: WizardCircle) {
    toggleGroup(circle.memberIds);
  }

  /**
   * Add a guest, unless that address is already on the list.
   *
   * The refusal is the narrow, certain one: the same phone number or the same
   * email twice would send that person two copies of the plan, and no host
   * means that. A second guest with the same NAME is allowed through — two
   * Sarahs are ordinary — and asked about on Review instead.
   *
   * Returns false when nothing was added, so the caller can leave what the
   * host typed in the box rather than clearing it out from under her.
   */
  function addGuestInvite(name: string, contact: string): boolean {
    const label = name || contact.replace(/^@/, '');
    const clash = existingTarget(dedupeTargets(invitees), {
      key: '',
      profileId: null,
      name: label,
      contact: contact || null,
    });
    if (clash) {
      setGuestError(`${clash.name} is already on this list.`);
      return false;
    }
    setInvitees((current) => [
      ...current,
      {
        key: `guest-${label}-${current.length}`,
        profileId: null,
        name: label,
        guestContact: contact || undefined,
        groupStage: 0,
        windowMinutes: newInviteeWindow(current),
      },
    ]);
    setGuestName('');
    setGuestContact('');
    return true;
  }

  async function addGuest() {
    const name = guestName.trim();
    const contact = guestContact.trim();
    if (!name && !contact) return;
    setGuestError(null);

    const emailLike = isEmail(contact);
    const isPhone = normalizePhoneNumber(contact) !== null;

    // A username (anything in the contact box that isn't an email or phone)
    // must map to a real account. We never silently invite a typo'd handle as
    // an off-platform guest — email and phone are the guest paths.
    if (contact && !emailLike && !isPhone) {
      const handle = contact.replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
        setGuestError('Enter a valid username, email, or phone number.');
        return;
      }
      setResolvingGuest(true);
      try {
        const found = await lookupInviteeByHandle(handle);
        if (!found) {
          setGuestError(`No account with the username @${handle}. Invite them by email or phone instead.`);
          return;
        }
        if (found.id === userId) {
          setGuestError('That’s you - you’re already the host.');
          return;
        }
        // Already on the list is worth SAYING. Adding nothing and clearing the
        // box looked identical to a successful add, which is one of the ways a
        // host ends up unsure who is actually on her plan.
        if (invitees.some((i) => i.profileId === found.id)) {
          setGuestError(`${found.name} is already on this list.`);
          return;
        }
        setInvitees((current) => [
          ...current,
          {
            key: `member-${found.id}`,
            profileId: found.id,
            name: found.name,
            groupStage: 0,
            windowMinutes: newInviteeWindow(current),
          },
        ]);
        setGuestName('');
        setGuestContact('');
      } finally {
        setResolvingGuest(false);
      }
      return;
    }

    // Email / phone / name-only → off-platform guest (link, email, or text).
    addGuestInvite(name, contact);
  }

  function isMatchSelected(match: ContactMatch) {
    return contactMatchSelected(match, invitees);
  }

  function toggleContactMatch(match: ContactMatch) {
    const target = inviteTargetFor(match);
    if (!target) return;
    setInvitees((current) => {
      if (target.profileId) {
        if (current.some((i) => i.profileId === target.profileId)) {
          return current.filter((i) => i.profileId !== target.profileId);
        }
        return [
          ...current,
          {
            key: target.profileId,
            profileId: target.profileId,
            name: match.profile?.name ?? match.name,
            groupStage: 0,
            windowMinutes: newInviteeWindow(current),
          },
        ];
      }
      const existing = current.find(
        (i) => i.profileId === null && i.guestContact === target.contact,
      );
      if (existing) {
        return current.filter((i) => i.key !== existing.key);
      }
      return [
        ...current,
        {
          key: `contact-${target.contact}`,
          profileId: null,
          name: match.name || target.contact!,
          guestContact: target.contact!,
          groupStage: 0,
          windowMinutes: newInviteeWindow(current),
        },
      ];
    });
  }

  async function matchContactsFromDevice(contacts: ContactCandidate[]) {
    setContactsBusy(true);
    onError(null);
    setContactsNote(null);
    try {
      const { matches, error: lookupError, code } = await resolveContactMatches(contacts);
      // Drop yourself and anyone with no way to be invited (no account and no
      // textable number); on-Switchboard matches float to the top.
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
          ? 'None of those contacts can be invited yet - no matching accounts or numbers.'
          : onApp === 0
            ? `${invitable.length} ${invitable.length === 1 ? 'contact' : 'contacts'} can be invited by text.`
            : `${onApp} on Switchboard${
                invitable.length - onApp > 0 ? `, ${invitable.length - onApp} by text` : ''
              }. Tap to add them.`,
      );
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : 'Could not open contacts on this device.',
      );
    } finally {
      setContactsBusy(false);
    }
  }

  /** Drag-and-drop, and the arrow keys on a grip: one row, one new slot. */
  function moveInvitee(from: number, to: number) {
    setInvitees((current) => moveItem(current, from, to));
  }

  /**
   * Take somebody off the list, from wherever the host is looking at it.
   *
   * Also drops any duplicate question that named this row, so removing the
   * second Xochitl does not leave a warning about her hanging over the list.
   */
  function removeInvitee(key: string) {
    setInvitees((current) => current.filter((invitee) => invitee.key !== key));
    setKeptDuplicates((current) => {
      const next = new Set(current);
      for (const id of next) {
        if (id.split('|').includes(key)) next.delete(id);
      }
      return next;
    });
  }

  /** The window everyone shares, or null when the rows disagree ("Mixed"). */
  const commonWindow = useMemo(
    () => sharedWindow(invitees.map((i) => i.windowMinutes)),
    [invitees],
  );

  /**
   * The window to give someone just added. Reads `current` from inside the
   * `setInvitees` updater rather than the closed-over `invitees`, which may be
   * a render behind when several people are added in one go.
   */
  function newInviteeWindow(current: DraftInvitee[]): number {
    return windowForNewInvitee(
      current.map((i) => i.windowMinutes),
      suggestedWindowMinutes,
    );
  }

  /** The "select all" from the feedback: one window, everybody. */
  function setWindowForEveryone(minutes: number) {
    setInvitees((current) =>
      current.map((invitee) => ({ ...invitee, windowMinutes: minutes })),
    );
  }

  function updateInvitee(index: number, patch: Partial<DraftInvitee>) {
    setInvitees((current) =>
      current.map((invitee, i) =>
        i === index ? { ...invitee, ...patch } : invitee,
      ),
    );
  }

  /** The list as `invitee-dedupe` compares it. */
  function dedupeTargets(list: readonly DraftInvitee[]): DedupeTarget[] {
    return list.map((invitee) => ({
      key: invitee.key,
      profileId: invitee.profileId,
      name: invitee.name,
      contact: invitee.guestContact ?? null,
    }));
  }

  /**
   * Rows that might be one person twice, minus the ones the host has already
   * said are not. The address matches stay whatever she says, because those
   * are not guesses — two rows pointing at one phone number really would send
   * that phone two copies.
   */
  const duplicates = useMemo(
    () =>
      likelyDuplicates(dedupeTargets(invitees)).filter(
        (warning) =>
          warning.reason === 'target' ||
          !keptDuplicates.has(`${warning.keepKey}|${warning.dropKey}`),
      ),
    [invitees, keptDuplicates],
  );

  function keepBothDuplicates(warning: DuplicateWarning) {
    setKeptDuplicates(
      (current) => new Set(current).add(`${warning.keepKey}|${warning.dropKey}`),
    );
  }

  return {
    invitees,
    setInvitees,
    selectedFriendCount: invitees.filter((i) => i.profileId).length,
    commonWindow,
    duplicates,
    keepBothDuplicates,
    toggleFriend,
    toggleHousehold,
    toggleCircle,
    moveInvitee,
    removeInvitee,
    updateInvitee,
    setWindowForEveryone,
    friendsOpen,
    setFriendsOpen,
    guestName,
    setGuestName,
    guestContact,
    setGuestContact,
    guestError,
    setGuestError,
    resolvingGuest,
    addGuest,
    matchContactsFromDevice,
    contactsBusy,
    contactsNote,
    contactMatches,
    isMatchSelected,
    toggleContactMatch,
  };
}
