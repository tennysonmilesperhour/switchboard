'use client';

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/Button';
import type { ActionResult } from '@/lib/actions/profile';

/**
 * Explicit save / cancel for the Settings page.
 *
 * Every editable section registers as a "participant". The moment any of them
 * holds unsaved edits, a single floating bar rises above the tab bar offering
 * *Save changes* / *Cancel*. Save fans out to every dirty participant at once;
 * Cancel reverts them. This replaces the old autosave-on-every-keystroke
 * behaviour with a deliberate commit step, so a stray toggle no longer writes
 * to the profile before you meant it to.
 */

interface Participant {
  /** Persist this section's edits. Resolves once the save settles. */
  save: () => Promise<ActionResult>;
  /** Discard this section's edits, restoring the last saved values. */
  cancel: () => void;
}

interface SettingsSaveContextValue {
  register: (id: string, participant: Participant) => () => void;
  setDirty: (id: string, dirty: boolean) => void;
}

const SettingsSaveContext = createContext<SettingsSaveContextValue | null>(null);

/** Read the save controls. Throws if used outside <SettingsSaveProvider>. */
export function useSettingsSave(): SettingsSaveContextValue {
  const ctx = useContext(SettingsSaveContext);
  if (!ctx) {
    throw new Error(
      'Settings save controls must be rendered inside <SettingsSaveProvider>.',
    );
  }
  return ctx;
}

export function SettingsSaveProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const participants = useRef(new Map<string, Participant>());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null,
  );

  // A ref mirror of the dirty set so the Save/Cancel handlers can read the
  // current value without being re-created on every change.
  const dirtyRef = useRef(dirtyIds);
  useEffect(() => {
    dirtyRef.current = dirtyIds;
  }, [dirtyIds]);

  const register = useCallback((id: string, participant: Participant) => {
    participants.current.set(id, participant);
    return () => {
      participants.current.delete(id);
      setDirtyIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };
  }, []);

  const setDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) setNotice(null);
    setDirtyIds((prev) => {
      if (dirty === prev.has(id)) return prev;
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const dirtyCount = dirtyIds.size;

  // "Changes saved." used to sit at the bottom of the screen for the rest of
  // the page's life — nothing cleared it but the next edit. A confirmation that
  // never leaves stops reading as confirmation, and it is pinned in the same
  // `bottom-24` band as the save bar and the toasts. Let it go on its own; a
  // failure stays until the next edit, because that one still needs reading.
  useEffect(() => {
    if (notice?.kind !== 'success') return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Guard against losing edits to an accidental reload or tab close.
  useEffect(() => {
    if (dirtyCount === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  const handleSave = useCallback(async () => {
    const ids = Array.from(dirtyRef.current);
    if (ids.length === 0) return;
    setSaving(true);
    setNotice(null);
    try {
      // Next.js dispatches Server Actions sequentially. Save each dirty section
      // deliberately and retain failed sections as dirty instead of presenting a
      // false success when the database rejects a write.
      const results: ActionResult[] = [];
      for (const id of ids) {
        const participant = participants.current.get(id);
        if (participant) results.push(await participant.save());
      }
      const failure = results.find((result) => !result.ok);
      setNotice(
        failure
          ? { kind: 'error', text: failure.error ?? 'Some changes could not be saved.' }
          : { kind: 'success', text: 'Changes saved.' },
      );
    } catch {
      // A transport failure or an unexpected Server Action exception does not
      // return an ActionResult. Keep every affected section dirty and say so —
      // otherwise Save appears to do nothing, which was the original report.
      setNotice({
        kind: 'error',
        text: 'Could not reach the server. Your changes are still here — try again.',
      });
    } finally {
      setSaving(false);
    }
  }, []);

  const handleCancel = useCallback(() => {
    for (const id of Array.from(dirtyRef.current)) {
      participants.current.get(id)?.cancel();
    }
  }, []);

  const value = useMemo(() => ({ register, setDirty }), [register, setDirty]);

  return (
    <SettingsSaveContext.Provider value={value}>
      {children}
      {dirtyCount > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 px-4">
          <div
            role="region"
            aria-label="Unsaved settings changes"
            className="animate-rise pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-card border border-line bg-card/95 px-4 py-3 shadow-float backdrop-blur-xl"
          >
            <p className="min-w-0 flex-1 text-sm font-semibold text-ink" aria-live="polite">
              {saving
                ? 'Saving your changes…'
                : notice?.kind === 'error'
                  ? notice.text
                  : 'You have unsaved changes'}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}
      {dirtyCount === 0 && notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          // Pinned over the page, so it must not take the taps meant for what
          // is underneath it — see the same note on the toast host.
          className={`pointer-events-none fixed inset-x-0 bottom-24 z-40 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-pill px-4 py-2 text-sm font-semibold shadow-float ${
            notice.kind === 'error'
              ? 'bg-rose-deep text-paper'
              : 'bg-sage-deep text-paper'
          }`}
        >
          {notice.text}
        </div>
      )}
    </SettingsSaveContext.Provider>
  );
}

/** Stable, order-independent snapshot of a form's current values. */
function serialize(form: HTMLFormElement): string {
  const pairs = Array.from(new FormData(form).entries()).map(
    ([key, value]) => `${key}=${typeof value === 'string' ? value : ''}`,
  );
  // Sort so equality ignores field/selection order (e.g. re-ordered interest
  // chips that serialise the same set of values in a different sequence).
  pairs.sort();
  return pairs.join('&');
}

/**
 * A settings form whose changes are held until the shared save bar commits
 * them. Drop-in replacement for the old AutosaveForm: same `action` + children,
 * but instead of debouncing a submit it reports "dirty" to the provider and
 * waits for Save. Cancel remounts the fields (bumping `key`) so both native
 * inputs and the controlled InterestPicker fall back to their last-saved values.
 */
export function SettingsForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
}) {
  const { register, setDirty } = useSettingsSave();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const baselineRef = useRef('');
  // Bumping this key remounts the fields, restoring their last-saved defaults.
  const [revision, setRevision] = useState(0);

  const markSaved = useCallback(() => {
    const form = formRef.current;
    if (form) baselineRef.current = serialize(form);
    setDirty(id, false);
  }, [id, setDirty]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    // Snapshot the server-rendered values as the clean baseline.
    baselineRef.current = serialize(form);

    const onChange = () => setDirty(id, serialize(form) !== baselineRef.current);
    form.addEventListener('input', onChange);
    form.addEventListener('change', onChange);

    const unregister = register(id, {
      save: async () => {
        const result = await action(new FormData(form));
        if (result.ok) markSaved();
        return result;
      },
      cancel: () => {
        setRevision((n) => n + 1);
        setDirty(id, false);
      },
    });

    return () => {
      form.removeEventListener('input', onChange);
      form.removeEventListener('change', onChange);
      unregister();
    };
  }, [action, id, markSaved, register, setDirty]);

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(event) => event.preventDefault()}
    >
      {/* Keyed fragment: bumping the key on cancel remounts these fields to
          their defaults without adding a wrapper element that would break the
          form's `space-y-*` spacing. */}
      <Fragment key={revision}>{children}</Fragment>
    </form>
  );
}
