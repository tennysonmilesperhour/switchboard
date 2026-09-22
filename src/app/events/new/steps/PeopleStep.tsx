'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { ContactImportControls } from '@/components/ContactImportControls';
import type {
  ContactCandidate,
  ContactMatch,
} from '@/lib/actions/connections';
import type {
  DraftInvitee,
  WizardCircle,
  WizardFriend,
  WizardHousehold,
} from './wizard-types';

interface PeopleStepProps {
  households: WizardHousehold[];
  circles: WizardCircle[];
  friends: WizardFriend[];
  invitees: DraftInvitee[];
  toggleHousehold: (household: WizardHousehold) => void;
  toggleCircle: (circle: WizardCircle) => void;
  toggleFriend: (friend: WizardFriend) => void;
  friendsOpen: boolean;
  setFriendsOpen: Dispatch<SetStateAction<boolean>>;
  selectedFriendCount: number;
  guestName: string;
  setGuestName: Dispatch<SetStateAction<string>>;
  guestContact: string;
  setGuestContact: Dispatch<SetStateAction<string>>;
  guestError: string | null;
  setGuestError: Dispatch<SetStateAction<string | null>>;
  resolvingGuest: boolean;
  addGuest: () => Promise<void>;
  matchContactsFromDevice: (contacts: ContactCandidate[]) => Promise<void>;
  contactsBusy: boolean;
  contactsNote: string | null;
  contactMatches: ContactMatch[];
  isMatchSelected: (match: ContactMatch) => boolean;
  toggleContactMatch: (match: ContactMatch) => void;
}

export function PeopleStep({
  households,
  circles,
  friends,
  invitees,
  toggleHousehold,
  toggleCircle,
  toggleFriend,
  friendsOpen,
  setFriendsOpen,
  selectedFriendCount,
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
}: PeopleStepProps) {
  return (
        <div className="space-y-4 animate-rise">
          {(households.length > 0 || circles.length > 0) && (
            <div>
              <p className="text-plate text-plate-inset text-sm font-bold text-ink mb-2">
                Tap a group to add everyone
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  ...households.map((h) => ({ group: h, toggle: () => toggleHousehold(h) })),
                  ...circles.map((c) => ({ group: c, toggle: () => toggleCircle(c) })),
                ].map(({ group, toggle }) => {
                  const members = group.memberIds.filter((id) =>
                    friends.some((f) => f.id === id),
                  );
                  if (members.length === 0) return null;
                  const allIn = members.every((id) =>
                    invitees.some((i) => i.profileId === id),
                  );
                  return (
                    <Chip
                      key={group.id}
                      emoji={group.emoji}
                      selected={allIn}
                      onClick={toggle}
                    >
                      {group.name} ({members.length})
                    </Chip>
                  );
                })}
              </div>
              <p className="text-plate text-plate-inset mt-1.5 text-xs text-ink-faint">
                Adds the whole group - then tap anyone below to drop them.
              </p>
            </div>
          )}
          {friends.length === 0 && (
            <Card tone="cream">
              <p className="text-sm text-ink-soft leading-relaxed">
                You haven’t connected with anyone yet - you can still invite
                people as <strong>guests</strong> below. They’ll get a link that
                opens the plan straight away; replying is what asks them to sign
                in.
              </p>
            </Card>
          )}
          {friends.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setFriendsOpen((open) => !open)}
                aria-expanded={friendsOpen}
                className="w-full flex items-center gap-2 mb-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
              >
                <span className="flex-1 text-left text-sm font-bold text-ink">
                  Friends · {friends.length}
                  {selectedFriendCount > 0 && (
                    <span className="text-terracotta-deep"> · {selectedFriendCount} selected</span>
                  )}
                </span>
                <Icon
                  name="back"
                  size={18}
                  className={`text-ink-faint transition-transform ${friendsOpen ? 'rotate-90' : '-rotate-90'}`}
                />
              </button>
              {friendsOpen && (
                <div className="grid grid-cols-2 gap-2">
                  {friends.map((friend) => {
                    const selected = invitees.some((i) => i.profileId === friend.id);
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => toggleFriend(friend)}
                        aria-pressed={selected}
                        className={`flex items-center gap-2 rounded-card border-2 p-2 text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                          selected
                            ? 'border-terracotta bg-terracotta-soft'
                            : 'border-line bg-card hover:border-terracotta/50'
                        }`}
                      >
                        <Avatar name={friend.name} seed={friend.id} size="sm" />
                        <span className="flex-1 min-w-0">
                          <span className="font-bold text-sm block truncate">{friend.name}</span>
                          <span className="text-[11px] text-ink-faint block truncate">
                            @{friend.handle}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className={`grid size-5 shrink-0 place-items-center rounded-pill border-2 transition-colors ${
                            selected
                              ? 'border-terracotta bg-terracotta text-white'
                              : 'border-line text-ink-faint'
                          }`}
                        >
                          <Icon name={selected ? 'check' : 'add'} size={12} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Contacts, first and on their own.
              It used to be the last control inside the "invite by username,
              email, or phone" card, below two text fields, and the host who
              asked for this found it by accident: "I was able to touch my
              contacts to make them pop up, but it wasn't obvious." Bringing
              the whole phone book in is the fastest way to fill this screen
              and now looks like it. */}
          <Card tone="terracotta">
            <p className="text-sm font-bold text-ink">
              📇 Bring in your contacts
            </p>
            <p className="mt-0.5 mb-2.5 text-xs leading-relaxed text-ink-soft">
              The quickest way to fill this list. We’ll show who is already on
              Switchboard and who can be invited by text - nothing is sent, and
              nothing is saved, until you tap someone.
            </p>
            <ContactImportControls
              onContacts={matchContactsFromDevice}
              busy={contactsBusy}
              pickLabel="Choose from my contacts"
            />
            {contactsNote && (
              <p role="status" className="mt-2 text-xs font-semibold text-ink-soft">
                {contactsNote}
              </p>
            )}
            {contactMatches.length > 0 && (
              <ul className="mt-3 space-y-2">
                {contactMatches.map((match) => {
                  const selected = isMatchSelected(match);
                  const onApp = Boolean(match.profile);
                  return (
                    <li key={match.key}>
                      <button
                        type="button"
                        onClick={() => toggleContactMatch(match)}
                        aria-pressed={selected}
                        className={`w-full flex items-center gap-3 rounded-card border-2 p-3 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                          selected
                            ? 'border-terracotta bg-terracotta-soft'
                            : 'border-line bg-card hover:border-terracotta/50'
                        }`}
                      >
                        <Avatar
                          name={match.profile?.name ?? match.name}
                          seed={match.profile?.id ?? match.key}
                          size="sm"
                        />
                        <span className="flex-1 min-w-0 text-left">
                          <span className="font-bold block truncate">
                            {match.profile?.name ?? match.name}
                          </span>
                          <span className="text-xs text-ink-faint block truncate">
                            {onApp ? (
                              <>on Switchboard · @{match.profile!.handle}</>
                            ) : (
                              'not on Switchboard yet · invite by text'
                            )}
                          </span>
                        </span>
                        {onApp && (
                          <span className="shrink-0 rounded-pill bg-sage-soft px-2 py-0.5 text-[11px] font-bold text-sage-deep">
                            In app
                          </span>
                        )}
                        <span
                          aria-hidden
                          className={`grid size-6 shrink-0 place-items-center rounded-pill border-2 transition-colors ${
                            selected
                              ? 'border-terracotta bg-terracotta text-white'
                              : 'border-line text-ink-faint'
                          }`}
                        >
                          <Icon name={selected ? 'check' : 'add'} size={14} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <p className="text-sm font-bold text-ink mb-2">Or invite by username, email, or phone</p>
            <div className="space-y-2">
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft"
              />
              <div className="flex gap-2">
                <input
                  value={guestContact}
                  onChange={(e) => {
                    setGuestContact(e.target.value);
                    if (guestError) setGuestError(null);
                  }}
                  placeholder="@username, email, or phone"
                  className="flex-1 rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={resolvingGuest}
                  onClick={addGuest}
                >
                  {resolvingGuest ? 'Checking…' : 'Add'}
                </Button>
              </div>
              {guestError && (
                <p role="alert" className="text-xs text-rose-deep">
                  {guestError}
                </p>
              )}
            </div>
          </Card>

          {invitees.length > 0 && (
            <p className="inline-flex items-center gap-1.5 rounded-pill bg-terracotta-soft px-3.5 py-1.5 text-sm font-bold text-terracotta-deep">
              {invitees.length} {invitees.length === 1 ? 'person' : 'people'} selected
            </p>
          )}
        </div>
  );
}
