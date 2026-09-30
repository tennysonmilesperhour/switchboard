'use client';

import { useState, useTransition } from 'react';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  ensureZoneInviteLink,
  removeZoneMember,
  resolveZoneJoinRequest,
  rotateZoneInviteLink,
  setZoneMemberRole,
  setZoneVisibility,
} from '@/lib/actions/zones';

interface Member {
  member_id: string;
  role: string;
  display_name: string;
}

interface JoinRequest {
  id: string;
  requester_id: string;
  note: string | null;
  display_name: string;
}

interface ZoneAccessProps {
  zoneId: string;
  visibility: 'public' | 'private';
  members: Member[];
  requests: JoinRequest[];
  organizerId: string;
}

/**
 * The organizer's controls for a zone: who can see it, who's in it, and the
 * link that lets someone in.
 *
 * Rendered only for organizers and moderators — but that is a convenience, not
 * the boundary. Every action here goes through RLS or a definer function that
 * re-checks the caller against this specific zone, so a hand-crafted request
 * from a member gets the same refusal the UI would have prevented.
 */
export function ZoneAccess({
  zoneId,
  visibility,
  members,
  requests,
  organizerId,
}: ZoneAccessProps) {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const isPrivate = visibility === 'private';

  function flipVisibility() {
    startTransition(async () => {
      const next = isPrivate ? 'public' : 'private';
      const result = await setZoneVisibility(zoneId, next);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not change who can see this.', result.code);
        return;
      }
      toast.success(
        next === 'private'
          ? 'Private. Only people you let in can see this zone.'
          : 'Public. Anyone on Switchboard can find this zone.',
      );
    });
  }

  function makeLink(rotate: boolean) {
    startTransition(async () => {
      const result = rotate
        ? await rotateZoneInviteLink(zoneId)
        : await ensureZoneInviteLink(zoneId);
      if (!result.ok || !result.url) {
        toast.error(result.error ?? 'Could not make an invite link.', result.code);
        return;
      }
      setLink(result.url);
      // Best-effort: a clipboard write can be refused, and the link is on
      // screen either way, so a failure here is not worth a toast.
      void navigator.clipboard?.writeText(result.url).catch(() => {});
      toast.success(rotate ? 'New link copied. The old one stopped working.' : 'Link copied.');
    });
  }

  function resolve(requestId: string, approve: boolean) {
    startTransition(async () => {
      const result = await resolveZoneJoinRequest(requestId, approve);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not answer that request.', result.code);
        return;
      }
      toast.success(approve ? 'They’re in. They’ve been told.' : 'Passed on. They’ve been told.');
    });
  }

  function changeRole(member: Member) {
    const next = member.role === 'moderator' ? 'member' : 'moderator';
    startTransition(async () => {
      const result = await setZoneMemberRole(zoneId, member.member_id, next);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not change their role.', result.code);
        return;
      }
      toast.success(
        next === 'moderator'
          ? `${member.display_name} can now manage this zone with you.`
          : `${member.display_name} is a member again.`,
      );
    });
  }

  async function remove(member: Member) {
    // Ask before the transition starts. Updates made inside an async
    // transition are held until the whole action settles, so a dialog opened
    // in there never paints and the action waits on an answer nobody can give.
    const ok = await confirm({
      title: `Remove ${member.display_name}?`,
      body: isPrivate
        ? 'They lose access to this zone and any check-in here ends. They can ask to come back once, after 30 days, or you can send them the invite link.'
        : 'Any check-in they have here ends. The zone is public, so they can still find it.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await removeZoneMember(zoneId, member.member_id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not remove them.', result.code);
        return;
      }
      toast.success(`${member.display_name} removed.`);
    });
  }

  return (
    <section aria-busy={pending}>
      <SectionHeader title="Who can be here" hint="Only you and your moderators see this" />
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-ink">{isPrivate ? '🔒 Private' : '🌍 Public'}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
              {isPrivate
                ? 'Only people you let in can find this zone, see who’s here, or check in.'
                : 'Anyone on Switchboard can find this zone and check in.'}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={flipVisibility}
          >
            {isPrivate ? 'Make public' : 'Make private'}
          </Button>
        </div>

        {isPrivate && (
          <div className="border-t border-line pt-3.5">
            <p className="text-sm font-bold text-ink">Invite link</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
              Anyone who opens it joins as a member. It never grants moderator.
            </p>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block truncate rounded-card border border-line bg-paper px-3 py-2 text-sm font-semibold text-terracotta-deep underline decoration-terracotta/40 underline-offset-2"
                title={link}
              >
                {link}
              </a>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => makeLink(false)}
              >
                {link ? 'Copy again' : 'Get the link'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => makeLink(true)}
              >
                Replace it
              </Button>
            </div>
          </div>
        )}

        {requests.length > 0 && (
          <div className="border-t border-line pt-3.5">
            <p className="text-sm font-bold text-ink">
              Asking to join ({requests.length})
            </p>
            <ul className="mt-2 space-y-2">
              {requests.map((request) => (
                <li key={request.id} className="flex items-start gap-2.5">
                  <Avatar
                    name={request.display_name}
                    seed={request.requester_id}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{request.display_name}</p>
                    {request.note && (
                      <p className="text-xs leading-snug text-ink-soft">“{request.note}”</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="accept"
                      disabled={pending}
                      onClick={() => resolve(request.id, true)}
                    >
                      Let in
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => resolve(request.id, false)}
                    >
                      Pass
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-line pt-3.5">
          <p className="text-sm font-bold text-ink">
            In this zone ({members.length + 1})
          </p>
          <ul className="mt-2 space-y-2">
            {members.map((member) => (
              <li key={member.member_id} className="flex items-center gap-2.5">
                <Avatar name={member.display_name} seed={member.member_id} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {member.display_name}
                  {member.role === 'moderator' && (
                    <span className="ml-1.5 text-xs text-ink-faint">moderator</span>
                  )}
                </span>
                {member.member_id !== organizerId && (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => changeRole(member)}
                      className="min-h-11 shrink-0 rounded-pill px-2 text-xs font-medium text-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    >
                      {member.role === 'moderator' ? 'Make member' : 'Make moderator'}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(member)}
                      className="min-h-11 shrink-0 rounded-pill px-2 text-xs font-medium text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
            {members.length === 0 && (
              <li className="text-xs text-ink-faint">
                Just you so far. Share the link to bring people in.
              </li>
            )}
          </ul>
        </div>
      </Card>
    </section>
  );
}
