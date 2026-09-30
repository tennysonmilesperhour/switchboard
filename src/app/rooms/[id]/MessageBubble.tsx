'use client';

import { Avatar } from '@/components/ui/Avatar';
import type { RoomMessage } from './room-messages';

interface MessageBubbleProps {
  message: RoomMessage;
  mine: boolean;
  senderName: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  pending: boolean;
  /** Absent when the sender has left or this is your own message. */
  onReport?: () => void;
  onBlock?: () => void;
  /** Only for your own, already-saved messages. */
  onDelete?: () => void;
}

const PHOTO_BODY = '📷 Photo';

function PhotoContent({ message, mine }: { message: RoomMessage; mine: boolean }) {
  const caption = message.body !== PHOTO_BODY ? message.body : null;
  return (
    <div className={`overflow-hidden rounded-card ${mine ? 'rounded-br-md' : 'rounded-bl-md'}`}>
      {message.image_src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={message.image_src}
          alt={caption ?? 'Shared photo'}
          className="max-h-72 w-full object-cover"
          loading="lazy"
        />
      ) : (
        // Undefined while a photo that just arrived is being signed; null when
        // it can't be shown (removed, or the link could not be made).
        <div className="flex h-32 w-56 max-w-full items-center justify-center bg-cream text-xs text-ink-faint">
          {message.image_src === undefined ? 'Loading photo…' : 'Photo unavailable'}
        </div>
      )}
      {caption && (
        <p
          className={`px-3.5 py-2 text-[15px] leading-relaxed break-words ${
            mine ? 'bg-terracotta text-white' : 'bg-cream text-ink'
          }`}
        >
          {caption}
        </p>
      )}
    </div>
  );
}

/**
 * One message. Someone else's carries their avatar, which opens Report message
 * (the report carries the message itself to a moderator) and Block; your own
 * opens Delete (G30 — the database always allowed a sender to delete their own
 * message, and nothing offered it).
 */
export function MessageBubble({
  message,
  mine,
  senderName,
  menuOpen,
  onToggleMenu,
  pending,
  onReport,
  onBlock,
  onDelete,
}: MessageBubbleProps) {
  const content = message.image_url ? (
    <PhotoContent message={message} mine={mine} />
  ) : (
    <div
      className={`rounded-card px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
        mine ? 'bg-terracotta text-white rounded-br-md' : 'bg-cream text-ink rounded-bl-md'
      }`}
    >
      {message.body}
    </div>
  );

  if (mine) {
    return (
      <div className="flex flex-row-reverse gap-2.5">
        <div className="max-w-[75%] flex flex-col items-end">
          {onDelete ? (
            <button
              type="button"
              onClick={onToggleMenu}
              aria-expanded={menuOpen}
              aria-label="Options for your message"
              className="block text-left rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              {content}
            </button>
          ) : (
            content
          )}
          {menuOpen && onDelete && (
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="mt-1 min-h-11 rounded-pill px-3 text-xs font-semibold text-rose-deep hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              Delete message
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="relative">
        {onReport || onBlock ? (
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label={`Options for ${senderName}`}
            aria-expanded={menuOpen}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            <Avatar name={senderName} seed={message.sender_id} size="sm" />
          </button>
        ) : (
          <Avatar name={senderName} seed={message.sender_id} size="sm" />
        )}
        {menuOpen && (onReport || onBlock) && (
          <div className="absolute left-0 top-full z-30 mt-1 min-w-[140px] rounded-card border border-line bg-card p-1 shadow-float">
            {onReport && (
              <button
                type="button"
                disabled={pending}
                className="w-full rounded-btn px-3 py-1.5 text-left text-xs font-semibold text-ink-faint hover:bg-cream"
                onClick={onReport}
              >
                Report message
              </button>
            )}
            {onBlock && (
              <button
                type="button"
                disabled={pending}
                className="w-full rounded-btn px-3 py-1.5 text-left text-xs font-semibold text-rose-deep hover:bg-cream"
                onClick={onBlock}
              >
                Block
              </button>
            )}
          </div>
        )}
      </div>
      <div className="max-w-[75%]">
        <p className="text-[11px] text-ink-faint mb-0.5 px-1">{senderName}</p>
        {content}
      </div>
    </div>
  );
}
