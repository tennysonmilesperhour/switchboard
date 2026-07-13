'use client';

import { useEffect, useState } from 'react';
import { completeOnboarding } from '@/lib/actions/profile';
import { Button } from '@/components/ui/Button';
import { InterestPicker } from '@/components/profile/InterestPicker';
import { INTEREST_CATEGORIES, DOWN_TO_GROUP } from '@/lib/interests';
import Link from 'next/link';
import { COMMUNITY_COVENANT_SUMMARY } from '@/lib/legal';

interface OnboardingFormProps {
  initialName: string;
  initialHandle: string;
  next?: string;
}

export function OnboardingForm({ initialName, initialHandle, next = '/' }: OnboardingFormProps) {
  const [submitting, setSubmitting] = useState(false);
  // Normalize the handle to lowercase as it's typed so the validated value
  // matches what the user sees. The `lowercase` CSS class only changes the
  // display, so without this the browser would reject a value that looks valid.
  const [handle, setHandle] = useState(initialHandle.toLowerCase());
  // Set after mount to avoid a server/client hydration mismatch.
  const [timezone, setTimezone] = useState('UTC');
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <form
      action={completeOnboarding}
      onSubmit={() => setSubmitting(true)}
      className="mt-6 space-y-6"
    >
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <label htmlFor="display_name" className="text-sm font-medium text-ink">
          Your name
        </label>
        <input
          id="display_name"
          name="display_name"
          required
          defaultValue={initialName}
          placeholder="Alex Rivera"
          className="w-full rounded-card border border-line bg-card px-4 py-3 outline-none focus:border-terracotta transition-colors"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="handle" className="text-sm font-medium text-ink">
          Handle
        </label>
        <div className="flex items-center rounded-card border border-line bg-card focus-within:border-terracotta transition-colors">
          <span className="pl-4 text-ink-faint">@</span>
          <input
            id="handle"
            name="handle"
            required
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            pattern="[a-z0-9_]{3,24}"
            title="Use 3–24 lowercase letters, numbers, or underscores."
            placeholder="alexr"
            className="flex-1 bg-transparent px-1.5 py-3 outline-none lowercase"
          />
        </div>
        <p className="text-xs text-ink-faint">
          Lowercase letters, numbers, and underscores.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink mb-1">
          What do you enjoy?{' '}
          <span className="text-ink-faint font-normal">(pick as many as you like)</span>
        </legend>
        <p className="text-sm text-ink-soft leading-relaxed">
          Your interests help Switchboard suggest people and plans you’ll
          actually enjoy. Browse the categories or search.
        </p>
        <InterestPicker name="interests" groups={INTEREST_CATEGORIES} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink mb-1">
          What are you usually down to do?{' '}
          <span className="text-ink-faint font-normal">(optional)</span>
        </legend>
        <p className="text-sm text-ink-soft leading-relaxed">
          These are the plans you’d happily say yes to — friends see them when
          they’re looking for someone to join.
        </p>
        <InterestPicker
          name="down_to"
          groups={[DOWN_TO_GROUP]}
          searchable={false}
        />
      </fieldset>

      <input type="hidden" name="timezone" value={timezone} />

      <div className="rounded-card bg-cream p-4 text-sm text-ink-soft leading-relaxed">
        We’ll also set up three starter circles - <strong>Close Friends</strong>,{' '}
        <strong>Family</strong>, and <strong>Neighbors</strong> - so you can
        control who sees what. You can edit them anytime.
      </div>

      <div className="rounded-card border border-line bg-card p-4 text-sm text-ink-soft">
        <p className="font-bold text-ink">Community Covenant</p>
        <ul className="mt-3 space-y-1.5">
          {COMMUNITY_COVENANT_SUMMARY.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="text-terracotta">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <label className="mt-4 flex items-start gap-2">
          <input
            type="checkbox"
            name="community_agreement"
            required
            className="mt-1 size-4 accent-terracotta"
          />
          <span>
            I agree to use Switchboard with kindness, curiosity, openness,
            generous assumptions, and respect for each matching context.
          </span>
        </label>
        <label className="mt-3 flex items-start gap-2">
          <input
            type="checkbox"
            name="terms_agreement"
            required
            className="mt-1 size-4 accent-terracotta"
          />
          <span>
            I agree to the{' '}
            <Link href="/terms" className="font-bold text-terracotta">Terms</Link>
            ,{' '}
            <Link href="/privacy" className="font-bold text-terracotta">Privacy Notice</Link>
            , and{' '}
            <Link href="/community" className="font-bold text-terracotta">Community Covenant</Link>
            .
          </span>
        </label>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? 'Saving…' : 'Start connecting'}
      </Button>
    </form>
  );
}
