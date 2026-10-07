'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { deleteZone, updateZoneDetails } from '@/lib/actions/zones';
import { EXPERIENCE_PRESETS } from '@/lib/types';
import { zoneEndDay } from '@/lib/zone-rules';
import { Glyph } from '@/components/ui/Glyph';

interface ZoneSettingsProps {
  zoneId: string;
  name: string;
  description: string | null;
  experiences: string[];
  /** ISO timestamp; every zone has one (D23). */
  endsAt: string;
  /** Only the organizer may delete; moderators may edit. */
  isOrganizer: boolean;
}

/**
 * The organizer's tools for the zone itself: its name, one-liner, the
 * experiences people pick from when they check in, when it ends, and deleting
 * it. Rendered for organizers and moderators; the zones UPDATE and DELETE
 * policies are what actually decide.
 */
export function ZoneSettings({
  zoneId,
  name: initialName,
  description: initialDescription,
  experiences: initialExperiences,
  endsAt,
  isOrganizer,
}: ZoneSettingsProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [experiences, setExperiences] = useState<string[]>(initialExperiences);
  const [endsOn, setEndsOn] = useState(zoneEndDay(endsAt));
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  function toggle(label: string) {
    setExperiences((current) =>
      current.includes(label) ? current.filter((value) => value !== label) : [...current, label],
    );
  }

  function save() {
    startTransition(async () => {
      const result = await updateZoneDetails(zoneId, { name, description, experiences, endsOn });
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save the zone.', result.code);
        return;
      }
      toast.success('Zone updated.');
      setOpen(false);
      router.refresh();
    });
  }

  async function remove() {
    // Ask before the transition starts. Updates made inside an async
    // transition are held until the whole action settles, so a dialog opened
    // in there never paints and the action waits on an answer nobody can give.
    const ok = await confirm({
      title: `Delete ${initialName}?`,
      body: 'Everyone loses access, and anyone checked in here is checked out. This can’t be undone.',
      confirmLabel: 'Delete zone',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteZone(zoneId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not delete the zone.', result.code);
        return;
      }
      toast.success('Zone deleted.');
      router.push('/zones');
    });
  }

  // Presets first, then anything the zone already carries that isn't a preset,
  // so editing never silently drops a custom experience.
  const options = [
    ...EXPERIENCE_PRESETS.map((preset) => ({ label: preset.label, emoji: preset.emoji })),
    ...initialExperiences
      .filter((value) => !EXPERIENCE_PRESETS.some((preset) => preset.label === value))
      .map((label) => ({ label, emoji: '✨' })),
  ];

  return (
    <section aria-busy={pending}>
      <SectionHeader
        title="Zone settings"
        hint="Name, description, experiences, and when it ends"
        action={
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="inline-flex min-h-11 items-center px-1 text-sm font-bold text-terracotta-deep"
          >
            {open ? 'Close' : 'Edit'}
          </button>
        }
      />
      {open && (
        <Card className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-bold text-ink-soft">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-ink-soft">One line about it</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={280}
              className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-ink-soft">Ends on</span>
            <input
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
              className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
            />
            <span className="block text-xs text-ink-faint">
              After this, the zone drops out of search and nobody new can check in.
            </span>
          </label>
          <fieldset>
            <legend className="mb-1.5 text-xs font-bold text-ink-soft">Experiences to offer</legend>
            <div className="flex flex-wrap gap-1.5">
              {options.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => toggle(option.label)}
                  aria-pressed={experiences.includes(option.label)}
                  className={`min-h-11 rounded-pill border px-3 text-xs transition-colors ${
                    experiences.includes(option.label)
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line bg-paper text-ink-soft'
                  }`}
                >
                  <Glyph emoji={option.emoji} size={14} className="mr-1 inline align-text-bottom" />
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <Button type="button" className="w-full" disabled={pending} onClick={save}>
            Save changes
          </Button>
          {isOrganizer && (
            <div className="border-t border-line pt-3">
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="inline-flex min-h-11 items-center rounded-pill px-2 text-sm font-bold text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
              >
                Delete this zone
              </button>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
