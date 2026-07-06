'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SectionHeader } from '@/components/ui/Card';
import { SOCIAL_PLATFORMS, SOCIAL_BY_ID } from '@/lib/socials';
import { updateProfileDetails, type ActionResult } from '@/lib/actions/profile';
import type { ProfileLink, ProfileSocial } from '@/lib/types';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const BIO_MAX = 600;

export interface ProfileEditInitial {
  userId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string;
  tagline: string;
  pronouns: string;
  location: string;
  links: ProfileLink[];
  socials: ProfileSocial[];
  contactEmail: string;
  contactPhone: string;
  contactPublic: boolean;
}

const inputCls =
  'w-full rounded-card border border-line bg-card px-4 py-3 text-sm outline-none focus:border-terracotta transition-colors';
const labelCls = 'text-sm font-medium text-ink';

export function ProfileEditForm(props: ProfileEditInitial) {
  const supabase = useRef(createClient()).current;

  const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl);
  const [coverUrl, setCoverUrl] = useState(props.coverUrl);
  const [handle, setHandle] = useState(props.handle);
  const [bio, setBio] = useState(props.bio);
  const [links, setLinks] = useState<ProfileLink[]>(props.links);
  const [socials, setSocials] = useState<ProfileSocial[]>(props.socials);
  const [contactPublic, setContactPublic] = useState(props.contactPublic);

  const [uploading, setUploading] = useState<null | 'avatar' | 'cover'>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    updateProfileDetails,
    { ok: true },
  );

  async function handleFile(kind: 'avatar' | 'cover', file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Image must be under 5MB.');
      return;
    }
    setUploading(kind);
    try {
      const bucket = kind === 'avatar' ? 'avatars' : 'covers';
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${props.userId}/${kind}-${Date.now()}.${ext || 'jpg'}`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true, cacheControl: '3600' });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      if (kind === 'avatar') setAvatarUrl(url);
      else setCoverUrl(url);
    } catch {
      setUploadError('Upload failed. Check your connection and try again.');
    } finally {
      setUploading(null);
    }
  }

  function addLink() {
    if (links.length >= 15) return;
    setLinks((l) => [...l, { label: '', url: '' }]);
  }
  function updateLink(i: number, patch: Partial<ProfileLink>) {
    setLinks((l) => l.map((link, idx) => (idx === i ? { ...link, ...patch } : link)));
  }
  function removeLink(i: number) {
    setLinks((l) => l.filter((_, idx) => idx !== i));
  }

  function addSocial() {
    if (socials.length >= 15) return;
    const used = new Set(socials.map((s) => s.platform));
    const next = SOCIAL_PLATFORMS.find((p) => !used.has(p.id)) ?? SOCIAL_PLATFORMS[0];
    setSocials((s) => [...s, { platform: next.id, value: '' }]);
  }
  function updateSocial(i: number, patch: Partial<ProfileSocial>) {
    setSocials((s) => s.map((soc, idx) => (idx === i ? { ...soc, ...patch } : soc)));
  }
  function removeSocial(i: number) {
    setSocials((s) => s.filter((_, idx) => idx !== i));
  }

  const cleanLinks = links.filter((l) => l.url.trim());
  const cleanSocials = socials.filter((s) => s.value.trim());

  return (
    <form action={formAction} className="space-y-8 pb-4">
      {/* Serialized dynamic collections + media URLs */}
      <input type="hidden" name="avatar_url" value={avatarUrl ?? ''} />
      <input type="hidden" name="cover_url" value={coverUrl ?? ''} />
      <input type="hidden" name="links" value={JSON.stringify(cleanLinks)} />
      <input type="hidden" name="socials" value={JSON.stringify(cleanSocials)} />

      {/* ————— Photos ————— */}
      <section>
        <div className="relative">
          <div className="-mx-4 h-36 overflow-hidden bg-cream sm:mx-0 sm:rounded-card">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-brand-gradient opacity-90" />
            )}
          </div>
          <div className="absolute right-2 top-2 flex gap-2">
            <button
              type="button"
              onClick={() => coverInput.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-pill bg-ink/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur hover:bg-ink/75"
            >
              <Icon name="camera" size={14} />
              {uploading === 'cover' ? 'Uploading…' : 'Cover'}
            </button>
            {coverUrl ? (
              <button
                type="button"
                onClick={() => setCoverUrl(null)}
                aria-label="Remove cover photo"
                className="inline-flex size-8 items-center justify-center rounded-full bg-ink/60 text-white backdrop-blur hover:bg-ink/75"
              >
                <Icon name="trash" size={14} />
              </button>
            ) : null}
          </div>

          <div className="-mt-12 flex items-end gap-4 px-1">
            <div className="relative">
              <Avatar
                name={props.displayName || 'You'}
                seed={props.userId}
                src={avatarUrl}
                size="xl"
                ring
                className="shadow-lift ring-4"
              />
              <button
                type="button"
                onClick={() => avatarInput.current?.click()}
                aria-label="Change profile photo"
                className="absolute -bottom-1 -right-1 inline-flex size-9 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lift active:scale-95"
              >
                <Icon name="camera" size={16} />
              </button>
            </div>
            <div className="pb-1">
              {uploading === 'avatar' ? (
                <p className="text-xs font-semibold text-ink-faint">Uploading photo…</p>
              ) : avatarUrl ? (
                <button
                  type="button"
                  onClick={() => setAvatarUrl(null)}
                  className="text-xs font-bold text-rose-deep hover:underline"
                >
                  Remove photo
                </button>
              ) : (
                <p className="text-xs text-ink-faint">Add a profile photo</p>
              )}
            </div>
          </div>
        </div>

        <input
          ref={avatarInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile('avatar', e.target.files?.[0])}
        />
        <input
          ref={coverInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile('cover', e.target.files?.[0])}
        />
        {uploadError ? (
          <p className="mt-3 text-sm font-medium text-rose-deep">{uploadError}</p>
        ) : null}
      </section>

      {/* ————— Basics ————— */}
      <section className="space-y-4">
        <SectionHeader title="About you" />
        <div className="space-y-1.5">
          <label htmlFor="display_name" className={labelCls}>Name</label>
          <input
            id="display_name"
            name="display_name"
            required
            maxLength={80}
            defaultValue={props.displayName}
            placeholder="Alex Rivera"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="handle" className={labelCls}>Handle</label>
            <div className="flex items-center rounded-card border border-line bg-card focus-within:border-terracotta transition-colors">
              <span className="pl-3 text-ink-faint">@</span>
              <input
                id="handle"
                name="handle"
                required
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                pattern="[a-z0-9_]{3,24}"
                title="3–24 lowercase letters, numbers, or underscores."
                placeholder="alexr"
                className="w-full bg-transparent px-1.5 py-3 text-sm outline-none lowercase"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pronouns" className={labelCls}>Pronouns</label>
            <input
              id="pronouns"
              name="pronouns"
              maxLength={40}
              defaultValue={props.pronouns}
              placeholder="they/them"
              className={inputCls}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tagline" className={labelCls}>Tagline</label>
          <input
            id="tagline"
            name="tagline"
            maxLength={120}
            defaultValue={props.tagline}
            placeholder="Coffee, trails, and last-minute plans"
            className={inputCls}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="location" className={labelCls}>Location</label>
          <input
            id="location"
            name="location"
            maxLength={80}
            defaultValue={props.location}
            placeholder="Portland, OR"
            className={inputCls}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bio" className={labelCls}>Bio</label>
          <textarea
            id="bio"
            name="bio"
            rows={4}
            maxLength={BIO_MAX}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A sentence or two about you."
            className={`${inputCls} resize-none`}
          />
          <p className="text-right text-xs text-ink-faint">{bio.length}/{BIO_MAX}</p>
        </div>
      </section>

      {/* ————— Socials ————— */}
      <section className="space-y-3">
        <SectionHeader title="Social media" hint="Handles or full profile links" />
        <div className="space-y-2.5">
          {socials.map((social, i) => {
            const platform = SOCIAL_BY_ID[social.platform] ?? SOCIAL_PLATFORMS[0];
            return (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-card border border-line bg-card"
                  style={{ color: platform.color }}
                >
                  <Icon name={platform.icon} size={20} />
                </span>
                <select
                  aria-label="Platform"
                  value={social.platform}
                  onChange={(e) => updateSocial(i, { platform: e.target.value })}
                  className="rounded-card border border-line bg-card px-2 py-3 text-sm outline-none focus:border-terracotta"
                >
                  {SOCIAL_PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <input
                  aria-label={`${platform.label} handle`}
                  value={social.value}
                  onChange={(e) => updateSocial(i, { value: e.target.value })}
                  placeholder={platform.placeholder}
                  className="min-w-0 flex-1 rounded-card border border-line bg-card px-3 py-3 text-sm outline-none focus:border-terracotta"
                />
                <button
                  type="button"
                  onClick={() => removeSocial(i)}
                  aria-label="Remove"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-cream hover:text-rose-deep"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            );
          })}
        </div>
        {socials.length < 15 ? (
          <button
            type="button"
            onClick={addSocial}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-terracotta hover:text-terracotta-deep"
          >
            <Icon name="add" size={16} />
            Add social
          </button>
        ) : null}
      </section>

      {/* ————— Links ————— */}
      <section className="space-y-3">
        <SectionHeader title="Links" hint="Website, portfolio, anything" />
        <div className="space-y-2.5">
          {links.map((link, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-card border border-line bg-card text-terracotta">
                <Icon name="globe" size={20} />
              </span>
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  aria-label="Link label"
                  value={link.label}
                  onChange={(e) => updateLink(i, { label: e.target.value })}
                  placeholder="Label (optional)"
                  className="min-w-0 rounded-card border border-line bg-card px-3 py-3 text-sm outline-none focus:border-terracotta"
                />
                <input
                  aria-label="Link URL"
                  inputMode="url"
                  value={link.url}
                  onChange={(e) => updateLink(i, { url: e.target.value })}
                  placeholder="yoursite.com"
                  className="min-w-0 rounded-card border border-line bg-card px-3 py-3 text-sm outline-none focus:border-terracotta"
                />
              </div>
              <button
                type="button"
                onClick={() => removeLink(i)}
                aria-label="Remove"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-cream hover:text-rose-deep"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
        {links.length < 15 ? (
          <button
            type="button"
            onClick={addLink}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-terracotta hover:text-terracotta-deep"
          >
            <Icon name="add" size={16} />
            Add link
          </button>
        ) : null}
      </section>

      {/* ————— Contact ————— */}
      <section className="space-y-4">
        <SectionHeader title="Contact info" />
        <div className="space-y-1.5">
          <label htmlFor="contact_email" className={labelCls}>Email</label>
          <input
            id="contact_email"
            name="contact_email"
            type="email"
            maxLength={120}
            defaultValue={props.contactEmail}
            placeholder="you@example.com"
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="contact_phone" className={labelCls}>Phone</label>
          <input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            maxLength={40}
            defaultValue={props.contactPhone}
            placeholder="+1 555 123 4567"
            className={inputCls}
          />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-card p-3">
          <input
            type="checkbox"
            name="contact_public"
            checked={contactPublic}
            onChange={(e) => setContactPublic(e.target.checked)}
            className="mt-0.5 size-4 accent-[color:var(--color-terracotta)]"
          />
          <span className="text-sm">
            <span className="block font-semibold text-ink">Include on my shared card</span>
            <span className="block text-ink-faint">
              Adds your email &amp; phone to the QR / contact card others scan. Off keeps
              them visible only to you.
            </span>
          </span>
        </label>
      </section>

      <p className="text-xs text-ink-faint">
        Interests &amp; activities live in{' '}
        <Link href="/settings" className="font-semibold text-terracotta">Settings</Link>.
      </p>

      {!state.ok && state.error ? (
        <p className="rounded-card bg-rose-soft px-4 py-3 text-sm font-medium text-rose-deep">
          {state.error}
        </p>
      ) : null}

      <div className="sticky bottom-24 flex gap-3">
        <Link href="/profile" className="flex-1">
          <Button type="button" variant="secondary" className="w-full">
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={pending || uploading !== null} className="flex-1">
          {pending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}
